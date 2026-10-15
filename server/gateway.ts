/**
 * InterviewAI Studio — Realtime Gateway
 *
 * A standalone Node WebSocket server (Next.js route handlers cannot hold long-lived sockets).
 * For each interview it bridges:
 *
 *   Browser ──(PCM16 frames + JSON control)──▶ Gateway ──(Realtime events)──▶ OpenAI Realtime (Lead Interviewer)
 *      ▲                                          │  ├─▶ Cross-Examiner agent (code diffs)  ──▶ injected probes
 *      └──────(audio deltas, transcript, status)──┘  ├─▶ Judge0 (runs / hidden-test submits)
 *                                                    ├─▶ Hybrid RAG (lookup_fundamentals tool)
 *                                                    └─▶ Postgres (transcript, snapshots, phase log) ─▶ Critic
 *
 * Run: `npm run dev:gateway` (tsx). Env: see .env.example.
 */
import "dotenv/config";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { createTwoFilesPatch } from "diff";
import type { InterviewPhase, Language, Question, Speaker, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { verifyTicket } from "@/lib/interview/ticket";
import {
  checkTimebox,
  crossExaminerActive,
  initialContext,
  reduce,
  transition,
  type Phase,
  type PhaseContext,
  type TransitionActor,
} from "@/lib/interview/state-machine";
import type { AIStatus, ClientMessage, ServerMessage, TranscriptEntry } from "@/lib/interview/protocol";
import { toPublicQuestion, toQuestionBrief } from "@/lib/interview/question";
import { leadInterviewerPrompt, PHASE_DIRECTIVES } from "@/lib/agents/prompts";
import { REALTIME_TOOLS, AdvancePhaseArgs, EndInterviewArgs, GetHintArgs, LookupFundamentalsArgs } from "@/lib/agents/realtime-tools";
import { runCrossExaminer } from "@/lib/agents/cross-examiner";
import { generateHint } from "@/lib/agents/hint";
import { evaluateSession } from "@/lib/agents/critic";
import { hybridRetrieve } from "@/lib/rag/hybrid";
import { runAgainstTests } from "@/lib/judge0/client";
import type { RunSummary, TestCase } from "@/lib/judge0/types";
import { LANGUAGES, LANGUAGE_KEYS } from "@/lib/languages";

const E = env();

// ─────────────────────────────── Tunables ───────────────────────────────
const CROSS_EXAM_DEBOUNCE_MS = 4_000; // wait for the candidate to pause typing
const CROSS_EXAM_COOLDOWN_MS = 40_000; // minimum gap between probes
const LOW_SEVERITY_COOLDOWN_MS = 120_000; // low-severity probes are rarer still
const TIMEBOX_TICK_MS = 10_000;
const MAX_TRANSCRIPT_CONTEXT = 14; // lines of recent conversation given to the Cross-Examiner
const HELLO_TIMEOUT_MS = 5_000;
const MAX_AUDIO_FRAME_BYTES = 64 * 1024;

type RealtimeEvent = { type: string; [k: string]: unknown };
type Probe = { question: string; targetLine: number | null; severity: "low" | "medium" | "high"; category: string };

class InterviewRuntime {
  private rt: WebSocket | null = null;
  private rtReady = false;
  private ctx: PhaseContext;
  private startedAt: number;
  private language: Language;
  private closed = false;

  // Code tracking
  private currentCode = "";
  private lastPersistedCode = "";
  private lastExaminedCode = "";
  private cursorLine: number | null = null;
  private lastRunText: string | null = null;
  private runInFlight = false;

  // Speech / turn tracking
  private candidateSpeaking = false;
  private responseActive = false;
  private assistantItemId: string | null = null;
  private assistantText = new Map<string, string>();
  private interruptedItems = new Set<string>();
  private recentLines: string[] = [];

  // Cross-examination
  private probesAsked: string[];
  private lastProbeAt = 0;
  private crossExamTimer: NodeJS.Timeout | null = null;
  private crossExamAbort: AbortController | null = null;
  private pendingProbe: Probe | null = null;
  private nextResponseIsProbe = false;

  // Tool calls collected during a response, flushed on response.done
  private toolOutputsPending = false;
  private endAfterResponse = false;
  private timeboxTimer: NodeJS.Timeout;

  constructor(
    private readonly client: WebSocket,
    private readonly sessionId: string,
    private readonly user: User,
    private readonly question: Question,
    session: { phase: InterviewPhase; language: Language; startedAt: Date | null; probesAsked: string[] },
    private readonly resumeTranscript: TranscriptEntry[],
    lastCode: string | null,
  ) {
    const now = Date.now();
    this.startedAt = session.startedAt?.getTime() ?? now;
    this.language = session.language;
    this.probesAsked = session.probesAsked;
    this.ctx = { ...initialContext(this.startedAt), phase: session.phase as Phase, phaseEnteredAt: now };
    this.currentCode = this.lastPersistedCode = this.lastExaminedCode = lastCode ?? "";
    this.recentLines = resumeTranscript.slice(-MAX_TRANSCRIPT_CONTEXT).map((t) => `${t.speaker}: ${t.text}`);
    this.timeboxTimer = setInterval(() => this.onTimeboxTick(), TIMEBOX_TICK_MS);
  }

  // ─────────────────────────────── lifecycle ───────────────────────────────

  async start() {
    if (!this.ctx.phase || this.ctx.phase === "COMPLETED") {
      this.send({ type: "error", message: "This interview has already ended.", fatal: true });
      return this.close();
    }
    await prisma.interviewSession.update({
      where: { id: this.sessionId },
      data: { status: "LIVE", startedAt: new Date(this.startedAt) },
    });
    const revealed = this.isRevealed(this.ctx.phase);
    this.send({
      type: "ready",
      phase: this.ctx.phase,
      elapsedMs: Date.now() - this.startedAt,
      questionMeta: { title: this.question.title, difficulty: this.question.difficulty, topics: this.question.topics },
      question: revealed ? toPublicQuestion(this.question) : null,
      language: this.language,
      transcript: this.resumeTranscript,
      lastCode: this.currentCode || null,
    });
    this.setStatus("connecting");
    this.connectRealtime();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timeboxTimer);
    if (this.crossExamTimer) clearTimeout(this.crossExamTimer);
    this.crossExamAbort?.abort();
    try {
      this.rt?.close();
    } catch {
      /* ignore */
    }
    if (this.client.readyState === WebSocket.OPEN) this.client.close();
  }

  // ─────────────────────────────── OpenAI Realtime ───────────────────────────────

  private connectRealtime() {
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(E.OPENAI_REALTIME_MODEL)}`;
    const rt = new WebSocket(url, { headers: { Authorization: `Bearer ${E.OPENAI_API_KEY}` } });
    this.rt = rt;

    rt.on("open", () => {
      this.rtReady = true;
      this.rtSend({
        type: "session.update",
        session: {
          type: "realtime",
          model: E.OPENAI_REALTIME_MODEL,
          instructions: this.buildInstructions(),
          output_modalities: ["audio"],
          audio: {
            input: {
              format: { type: "audio/pcm", rate: 24000 },
              noise_reduction: { type: "near_field" },
              transcription: { model: E.OPENAI_TRANSCRIBE_MODEL, language: "en" },
              // Semantic VAD with low eagerness tolerates the long "thinking" pauses typical of interviews,
              // while interrupt_response lets the candidate barge in over the interviewer.
              turn_detection: { type: "semantic_vad", eagerness: "low", create_response: true, interrupt_response: true },
            },
            output: { format: { type: "audio/pcm", rate: 24000 }, voice: E.OPENAI_REALTIME_VOICE },
          },
          tools: REALTIME_TOOLS,
          tool_choice: "auto",
        },
      });
      // Fresh interview: have the interviewer open. Resumed interview: re-orient briefly.
      const opener =
        this.resumeTranscript.length === 0
          ? "Begin the interview now."
          : "The candidate's connection dropped and has just been restored. Briefly acknowledge it in one sentence and continue exactly where you left off.";
      this.rtSend({ type: "response.create", response: { instructions: `${PHASE_DIRECTIVES[this.ctx.phase]} ${opener}` } });
      this.setStatus("thinking");
    });

    rt.on("message", (data) => {
      try {
        this.onRealtimeEvent(JSON.parse(data.toString()) as RealtimeEvent);
      } catch (err) {
        console.error("[gateway] bad realtime event", err);
      }
    });

    rt.on("close", (code, reason) => {
      this.rtReady = false;
      if (!this.closed) {
        console.warn(`[gateway] realtime closed ${code} ${reason.toString()}`);
        this.send({ type: "error", message: "Voice connection to the interviewer was lost. Reconnect to resume.", fatal: true });
        this.close();
      }
    });
    rt.on("error", (err) => console.error("[gateway] realtime error", err.message));
  }

  private rtSend(event: Record<string, unknown>) {
    if (this.rt && this.rtReady && this.rt.readyState === WebSocket.OPEN) this.rt.send(JSON.stringify(event));
  }

  private buildInstructions(): string {
    const base = leadInterviewerPrompt({
      candidateName: this.user.name,
      targetLevel: this.user.targetLevel,
      language: LANGUAGES[this.language].label,
      question: toQuestionBrief(this.question),
      phase: this.ctx.phase,
    });
    if (!this.resumeTranscript.length) return base;
    const recap = this.resumeTranscript
      .slice(-24)
      .map((t) => `${t.speaker}: ${t.text}`)
      .join("\n");
    return `${base}\n\n# Conversation so far (resumed session)\n${recap}`;
  }

  private onRealtimeEvent(ev: RealtimeEvent) {
    switch (ev.type) {
      case "input_audio_buffer.speech_started": {
        this.candidateSpeaking = true;
        // Barge-in: the candidate started talking while the interviewer audio is (or may be) playing.
        // The server already cancels the response (interrupt_response); the client must flush its
        // playback queue immediately and report how much audio was actually heard so we can truncate.
        if (this.assistantItemId) this.send({ type: "interrupt" });
        this.crossExamAbort?.abort();
        this.setStatus("listening");
        break;
      }
      case "input_audio_buffer.speech_stopped":
        this.candidateSpeaking = false;
        this.setStatus("thinking");
        break;

      case "conversation.item.input_audio_transcription.completed": {
        const text = String(ev.transcript ?? "").trim();
        if (!text) break;
        this.ctx = reduce(this.ctx, { type: "CANDIDATE_TURN" });
        void this.persistTranscript("CANDIDATE", text, String(ev.item_id ?? randomUUID()));
        // A spoken claim ("this is O(n)") can be inconsistent with the code — let the Cross-Examiner look.
        if (crossExaminerActive(this.ctx.phase)) this.scheduleCrossExam(1_500);
        break;
      }

      case "response.created":
        this.responseActive = true;
        this.setStatus(this.nextResponseIsProbe ? "cross_questioning" : "thinking");
        break;

      case "response.output_audio.delta":
      case "response.audio.delta": {
        const itemId = String(ev.item_id);
        if (this.assistantItemId !== itemId) {
          this.assistantItemId = itemId;
          this.setStatus(this.nextResponseIsProbe ? "cross_questioning" : "speaking");
        }
        this.send({ type: "audio", itemId, delta: String(ev.delta) });
        break;
      }

      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta": {
        const itemId = String(ev.item_id);
        const text = (this.assistantText.get(itemId) ?? "") + String(ev.delta ?? "");
        this.assistantText.set(itemId, text);
        this.send({
          type: "transcript",
          entry: { id: itemId, speaker: "INTERVIEWER", text, final: false, offsetMs: this.offset() },
        });
        break;
      }

      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done": {
        const itemId = String(ev.item_id);
        const text = String(ev.transcript ?? this.assistantText.get(itemId) ?? "").trim();
        this.assistantText.delete(itemId);
        if (text) void this.persistTranscript("INTERVIEWER", text, itemId, this.interruptedItems.has(itemId));
        break;
      }

      case "response.function_call_arguments.done":
        void this.handleToolCall(String(ev.name), String(ev.call_id), String(ev.arguments ?? "{}"));
        break;

      case "response.done": {
        this.responseActive = false;
        this.nextResponseIsProbe = false;
        this.assistantItemId = null;
        if (this.toolOutputsPending) {
          // Tool results were appended; let the model speak about them.
          this.toolOutputsPending = false;
          this.rtSend({ type: "response.create" });
          break;
        }
        if (this.endAfterResponse) {
          void this.finish();
          break;
        }
        if (this.pendingProbe) {
          const p = this.pendingProbe;
          this.pendingProbe = null;
          this.deliverProbe(p);
          break;
        }
        this.setStatus("listening");
        break;
      }

      case "error": {
        const err = ev.error as { message?: string; code?: string } | undefined;
        // Cancelling an already-finished response is benign in barge-in races.
        if (err?.code === "response_cancel_not_active") break;
        console.error("[gateway] realtime error event:", err?.message ?? ev);
        break;
      }
      default:
        break;
    }
  }

  // ─────────────────────────────── tools ───────────────────────────────

  private async handleToolCall(name: string, callId: string, rawArgs: string) {
    let output: unknown;
    try {
      const args = JSON.parse(rawArgs || "{}");
      switch (name) {
        case "advance_phase": {
          const a = AdvancePhaseArgs.parse(args);
          const res = await this.advancePhase(a.to, "LEAD_AGENT", a.reason);
          output = res.ok ? { ok: true, phase: a.to, directive: PHASE_DIRECTIVES[a.to] } : { ok: false, error: res.error };
          break;
        }
        case "get_hint": {
          const a = GetHintArgs.parse(args);
          const session = await prisma.interviewSession.findUniqueOrThrow({ where: { id: this.sessionId }, select: { hintsUsed: true } });
          const hint = await generateHint({
            question: toQuestionBrief(this.question),
            code: this.currentCode,
            recentTranscript: this.recentLines.join("\n"),
            hintsUsed: session.hintsUsed,
            requestedLevel: a.level,
          });
          await prisma.interviewSession.update({ where: { id: this.sessionId }, data: { hintsUsed: { increment: 1 } } });
          await this.persistTranscript("SYSTEM", `[hint:${hint.level}] ${hint.hint}`, randomUUID());
          this.send({ type: "hint", hint });
          output = { hint: hint.hint, level: hint.level, instruction: "Paraphrase this as a question or nudge. Do not read it verbatim." };
          break;
        }
        case "lookup_fundamentals": {
          const a = LookupFundamentalsArgs.parse(args);
          const chunks = await hybridRetrieve(a.query, { k: 3, domains: a.domain ? [a.domain] : undefined });
          output = {
            results: chunks.map((c) => ({ topic: c.heading, text: c.content.slice(0, 1200) })),
            instruction: "Use this to pose one concrete, scenario-based follow-up. Do not lecture.",
          };
          break;
        }
        case "end_interview": {
          const a = EndInterviewArgs.parse(args);
          if (this.ctx.phase !== "DEBRIEF") await this.advancePhase("DEBRIEF", "SYSTEM", "end requested");
          this.endAfterResponse = true;
          output = { ok: true, instruction: `Say a single short goodbye sentence. (${a.reason})` };
          break;
        }
        default:
          output = { ok: false, error: `Unknown tool ${name}` };
      }
    } catch (err) {
      output = { ok: false, error: (err as Error).message };
    }
    this.rtSend({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(output) } });
    this.toolOutputsPending = true;
    // If the response already finished before the (async) tool completed, trigger the follow-up now.
    if (!this.responseActive) {
      this.toolOutputsPending = false;
      this.rtSend({ type: "response.create" });
    }
  }

  private async advancePhase(to: Phase, actor: TransitionActor, reason: string) {
    const res = transition(this.ctx, to, actor, reason);
    if (!res.ok) return res;
    this.ctx = res.context;
    const session = await prisma.interviewSession.findUniqueOrThrow({ where: { id: this.sessionId }, select: { phaseHistory: true } });
    await prisma.interviewSession.update({
      where: { id: this.sessionId },
      data: {
        phase: to as InterviewPhase,
        phaseHistory: [...((session.phaseHistory as unknown[]) ?? []), res.record] as object[],
      },
    });
    this.send({ type: "phase", phase: to, reason });
    if (to === "CODING_AND_PROBING" && !this.isRevealed(res.record.from)) {
      this.send({ type: "question_revealed", question: toPublicQuestion(this.question) });
    }
    // Refresh the interviewer's instructions so the phase directive stays authoritative.
    this.rtSend({ type: "session.update", session: { type: "realtime", instructions: this.buildInstructions() } });
    return res;
  }

  private isRevealed(phase: Phase) {
    return phase === "CODING_AND_PROBING" || phase === "OPTIMIZATION_CROSS_EXAM" || phase === "DEBRIEF" || phase === "COMPLETED";
  }

  // ─────────────────────────────── client messages ───────────────────────────────

  async onClientMessage(msg: ClientMessage) {
    switch (msg.type) {
      case "code_update":
        if (!LANGUAGE_KEYS.includes(msg.language) || typeof msg.code !== "string" || msg.code.length > 64_000) return;
        if (msg.language !== this.language) {
          this.language = msg.language;
          await prisma.interviewSession.update({ where: { id: this.sessionId }, data: { language: msg.language } });
        }
        this.currentCode = msg.code;
        this.cursorLine = msg.cursorLine;
        await this.persistSnapshot("EDIT");
        if (crossExaminerActive(this.ctx.phase)) this.scheduleCrossExam(CROSS_EXAM_DEBOUNCE_MS);
        break;

      case "run":
        await this.handleRun(msg.mode, msg.code, msg.language);
        break;

      case "interrupt":
        // Manual "interrupt" button or client-side barge-in detection.
        this.rtSend({ type: "response.cancel" });
        this.pendingProbe = null;
        this.setStatus("listening");
        break;

      case "playback_truncated":
        // Tell the model exactly how much of its answer the candidate heard, so its memory matches reality.
        this.interruptedItems.add(msg.itemId);
        this.rtSend({ type: "conversation.item.truncate", item_id: msg.itemId, content_index: 0, audio_end_ms: Math.max(0, Math.floor(msg.audioEndMs)) });
        await prisma.transcriptChunk.updateMany({ where: { sessionId: this.sessionId, itemId: msg.itemId }, data: { interrupted: true } });
        break;

      case "mute":
        if (msg.muted) this.rtSend({ type: "input_audio_buffer.clear" });
        break;

      case "end":
        await this.advancePhase("COMPLETED", "CANDIDATE", "candidate ended the interview");
        await this.finish();
        break;

      default:
        break;
    }
  }

  onClientAudio(frame: Buffer) {
    if (!this.rtReady || frame.byteLength === 0 || frame.byteLength > MAX_AUDIO_FRAME_BYTES) return;
    this.rtSend({ type: "input_audio_buffer.append", audio: frame.toString("base64") });
  }

  // ─────────────────────────────── runs ───────────────────────────────

  private async handleRun(mode: "RUN" | "SUBMIT", code: string, language: Language) {
    if (this.runInFlight) return this.send({ type: "error", message: "A run is already in progress.", fatal: false });
    if (!this.isRevealed(this.ctx.phase)) return this.send({ type: "error", message: "Agree on an approach with the interviewer first.", fatal: false });
    this.runInFlight = true;
    this.currentCode = code;
    this.language = language;
    this.send({ type: "run_started", mode });
    try {
      const summary = await runAgainstTests({
        language,
        code,
        mode,
        visible: this.question.visibleTests as unknown as TestCase[],
        hidden: mode === "SUBMIT" ? (this.question.hiddenTests as unknown as TestCase[]) : undefined,
      });
      await this.persistSnapshot(mode, summary);
      this.send({ type: "run_result", summary });

      const visible = summary.results.filter((r) => !r.hidden);
      const allVisiblePassed = visible.length > 0 && visible.every((r) => r.passed);
      this.ctx = reduce(this.ctx, { type: "TESTS_RUN", allVisiblePassed });
      if (mode === "SUBMIT") this.ctx = reduce(this.ctx, { type: "SUBMITTED" });

      this.lastRunText = describeRun(summary);
      // Keep the interviewer aware of results without making it speak over the candidate.
      this.rtSend({
        type: "conversation.item.create",
        item: { type: "message", role: "system", content: [{ type: "input_text", text: `[TEST RUN] ${this.lastRunText}` }] },
      });
      if (allVisiblePassed && this.ctx.phase === "CODING_AND_PROBING" && !this.responseActive && !this.candidateSpeaking) {
        this.rtSend({
          type: "response.create",
          response: {
            instructions:
              "The candidate's visible tests now pass. Acknowledge neutrally in one sentence, then call advance_phase to OPTIMIZATION_CROSS_EXAM and begin probing complexity and worst-case inputs.",
          },
        });
      }
      if (crossExaminerActive(this.ctx.phase)) this.scheduleCrossExam(2_000);
    } catch (err) {
      this.send({ type: "error", message: `Code execution failed: ${(err as Error).message}`, fatal: false });
    } finally {
      this.runInFlight = false;
    }
  }

  // ─────────────────────────────── cross-examiner ───────────────────────────────

  private scheduleCrossExam(delayMs: number) {
    if (this.crossExamTimer) clearTimeout(this.crossExamTimer);
    this.crossExamTimer = setTimeout(() => void this.runCrossExam(), delayMs);
  }

  private async runCrossExam() {
    if (this.closed || !crossExaminerActive(this.ctx.phase)) return;
    if (this.crossExamAbort) return; // one evaluation at a time
    if (this.candidateSpeaking) return this.scheduleCrossExam(3_000);
    if (Date.now() - this.lastProbeAt < CROSS_EXAM_COOLDOWN_MS) return;
    if (!this.currentCode.trim()) return;

    const diff = this.currentCode === this.lastExaminedCode ? "" : unifiedDiff(this.lastExaminedCode, this.currentCode);
    const codeAtCheck = this.currentCode;
    const abort = new AbortController();
    this.crossExamAbort = abort;
    try {
      const decision = await runCrossExaminer(
        {
          question: toQuestionBrief(this.question),
          phase: this.ctx.phase,
          language: LANGUAGES[this.language].label,
          currentCode: codeAtCheck,
          diff,
          recentTranscript: this.recentLines.join("\n"),
          probesAsked: this.probesAsked,
          secondsInPhase: Math.round((Date.now() - this.ctx.phaseEnteredAt) / 1000),
          lastRun: this.lastRunText,
        },
        abort.signal,
      );
      if (abort.signal.aborted || !decision) return;
      this.lastExaminedCode = codeAtCheck;
      if (!decision.shouldInterject) return;
      if (decision.severity === "low" && Date.now() - this.lastProbeAt < LOW_SEVERITY_COOLDOWN_MS) return;
      // The code moved on substantially while we were thinking — the probe may be stale.
      if (this.currentCode !== codeAtCheck && decision.targetLine && !sameLine(codeAtCheck, this.currentCode, decision.targetLine)) return;

      const probe: Probe = { question: decision.question, targetLine: decision.targetLine, severity: decision.severity, category: decision.category };
      if (this.responseActive) this.pendingProbe = probe; // deliver as soon as the interviewer finishes speaking
      else this.deliverProbe(probe);
    } finally {
      if (this.crossExamAbort === abort) this.crossExamAbort = null;
    }
  }

  private deliverProbe(p: Probe) {
    if (this.candidateSpeaking || !crossExaminerActive(this.ctx.phase)) return;
    this.lastProbeAt = Date.now();
    this.probesAsked.push(p.question);
    this.ctx = reduce(this.ctx, { type: "PROBE_DELIVERED" });
    void prisma.interviewSession.update({ where: { id: this.sessionId }, data: { probesAsked: this.probesAsked } });
    void this.persistTranscript("CROSS_EXAMINER", p.question, randomUUID());
    this.send({ type: "probe", ...p });

    this.nextResponseIsProbe = true;
    this.setStatus("cross_questioning");
    this.rtSend({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "system",
        content: [{ type: "input_text", text: `[CROSS-EXAM]${p.targetLine ? ` (line ${p.targetLine})` : ""} ${p.question}` }],
      },
    });
    this.rtSend({
      type: "response.create",
      response: {
        instructions: `Interrupt the candidate politely ("Quick question —") and ask this follow-up in your own words, in at most two sentences, then stop and listen: "${p.question}"`,
      },
    });
  }

  // ─────────────────────────────── timeboxes ───────────────────────────────

  private onTimeboxTick() {
    const { context, nudge } = checkTimebox(this.ctx, Date.now());
    this.ctx = context;
    if (!nudge || this.responseActive || this.candidateSpeaking) return;
    this.rtSend({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text: `[TIMEKEEPER] ${nudge}` }] } });
    this.rtSend({ type: "response.create" });
  }

  // ─────────────────────────────── persistence ───────────────────────────────

  private offset() {
    return Date.now() - this.startedAt;
  }

  private async persistTranscript(speaker: Speaker, text: string, itemId: string, interrupted = false) {
    const entry: TranscriptEntry = { id: itemId, speaker, text, final: true, offsetMs: this.offset(), interrupted };
    this.send({ type: "transcript", entry });
    this.recentLines.push(`${speaker}: ${text}`);
    if (this.recentLines.length > MAX_TRANSCRIPT_CONTEXT) this.recentLines.shift();
    try {
      await prisma.transcriptChunk.create({
        data: { sessionId: this.sessionId, speaker, text, phase: this.ctx.phase as InterviewPhase, offsetMs: entry.offsetMs, itemId, interrupted },
      });
    } catch (err) {
      console.error("[gateway] transcript persist failed", (err as Error).message);
    }
  }

  private async persistSnapshot(kind: "EDIT" | "RUN" | "SUBMIT", runResult?: RunSummary) {
    if (kind === "EDIT" && this.currentCode === this.lastPersistedCode) return;
    const diff = unifiedDiff(this.lastPersistedCode, this.currentCode);
    this.lastPersistedCode = this.currentCode;
    await prisma.codeSnapshot.create({
      data: {
        sessionId: this.sessionId,
        kind,
        language: this.language,
        code: this.currentCode,
        diff,
        offsetMs: this.offset(),
        cursorLine: this.cursorLine,
        runResult: runResult ? (runResult as unknown as object) : undefined,
      },
    });
  }

  private async finish() {
    if (this.closed) return;
    await prisma.interviewSession.update({
      where: { id: this.sessionId },
      data: { endedAt: new Date(), phase: "COMPLETED", status: "EVALUATING" },
    });
    this.send({ type: "ended", sessionId: this.sessionId });
    this.close();
    // The Critic runs in the background; the report page polls until it lands.
    evaluateSession(this.sessionId).catch(async (err) => {
      console.error("[gateway] evaluation failed", err);
      await prisma.interviewSession.update({ where: { id: this.sessionId }, data: { status: "EVALUATED" } }).catch(() => undefined);
    });
  }

  // ─────────────────────────────── outbound ───────────────────────────────

  private status: AIStatus = "idle";
  private setStatus(s: AIStatus) {
    if (this.status === s) return;
    this.status = s;
    this.send({ type: "status", status: s });
  }

  private send(msg: ServerMessage) {
    if (this.client.readyState === WebSocket.OPEN) this.client.send(JSON.stringify(msg));
  }
}

// ─────────────────────────────── helpers ───────────────────────────────

function unifiedDiff(before: string, after: string): string {
  if (before === after) return "";
  return createTwoFilesPatch("before", "after", before, after, "", "", { context: 2 })
    .split("\n")
    .slice(2) // drop the ---/+++ header lines
    .join("\n");
}

function sameLine(a: string, b: string, line: number) {
  return a.split("\n")[line - 1] === b.split("\n")[line - 1];
}

function describeRun(s: RunSummary): string {
  const vis = s.results.filter((r) => !r.hidden);
  const hid = s.results.filter((r) => r.hidden);
  const parts = [`${s.mode}: visible ${vis.filter((r) => r.passed).length}/${vis.length}`];
  if (hid.length) parts.push(`hidden ${hid.filter((r) => r.passed).length}/${hid.length}`);
  if (s.compileOutput) parts.push(`compile error: ${s.compileOutput.slice(0, 200)}`);
  const firstFail = s.results.find((r) => !r.passed);
  if (firstFail) parts.push(`first failure: ${firstFail.label} (${firstFail.status})`);
  if (s.maxTimeMs !== null) parts.push(`max time ${s.maxTimeMs}ms`);
  return parts.join("; ");
}

// ─────────────────────────────── server ───────────────────────────────

const httpServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, sessions: runtimes.size }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server: httpServer, path: "/ws", maxPayload: 256 * 1024 });
const runtimes = new Map<string, InterviewRuntime>();

wss.on("connection", (socket) => {
  let runtime: InterviewRuntime | null = null;
  let sessionId: string | null = null;
  const helloTimer = setTimeout(() => socket.close(4401, "hello timeout"), HELLO_TIMEOUT_MS);

  socket.on("message", async (data: RawData, isBinary: boolean) => {
    if (isBinary) {
      runtime?.onClientAudio(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer));
      return;
    }
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString()) as ClientMessage;
    } catch {
      return;
    }

    if (!runtime) {
      if (msg.type !== "hello") return;
      clearTimeout(helloTimer);
      const ticket = verifyTicket(msg.ticket, E.GATEWAY_SECRET);
      if (!ticket) return socket.close(4401, "invalid ticket");

      const session = await prisma.interviewSession.findFirst({
        where: { id: ticket.sid, userId: ticket.uid },
        include: {
          user: true,
          question: true,
          transcript: { orderBy: { offsetMs: "asc" } },
          snapshots: { orderBy: { offsetMs: "desc" }, take: 1 },
        },
      });
      if (!session) return socket.close(4404, "session not found");

      // One live socket per session: a new tab takes over from the old one.
      runtimes.get(session.id)?.close();

      sessionId = session.id;
      runtime = new InterviewRuntime(
        socket,
        session.id,
        session.user,
        session.question,
        {
          phase: session.phase,
          language: session.language,
          startedAt: session.startedAt,
          probesAsked: (session.probesAsked as string[]) ?? [],
        },
        session.transcript.map((t) => ({
          id: t.itemId ?? t.id,
          speaker: t.speaker,
          text: t.text,
          final: true,
          offsetMs: t.offsetMs,
          interrupted: t.interrupted,
        })),
        session.snapshots[0]?.code ?? null,
      );
      runtimes.set(session.id, runtime);
      await runtime.start();
      return;
    }

    try {
      await runtime.onClientMessage(msg);
    } catch (err) {
      console.error("[gateway] client message failed", err);
    }
  });

  socket.on("close", () => {
    clearTimeout(helloTimer);
    runtime?.close();
    if (sessionId && runtimes.get(sessionId) === runtime) runtimes.delete(sessionId);
  });
});

httpServer.listen(E.GATEWAY_PORT, () => {
  console.log(`[gateway] listening on ws://localhost:${E.GATEWAY_PORT}/ws`);
});

const shutdown = () => {
  for (const r of runtimes.values()) r.close();
  wss.close();
  httpServer.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
// A failed DB write or LLM call in one interview must never take down every live session.
process.on("unhandledRejection", (reason) => console.error("[gateway] unhandled rejection:", reason));
