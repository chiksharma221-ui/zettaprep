"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { MicCapture } from "@/lib/audio/mic-capture";
import { PcmPlayer } from "@/lib/audio/pcm-player";
import type { AIStatus, ClientMessage, ServerMessage, TranscriptEntry } from "@/lib/interview/protocol";
import type { Phase } from "@/lib/interview/state-machine";
import type { PublicQuestion } from "@/lib/interview/question";
import type { RunSummary } from "@/lib/judge0/types";
import type { Hint } from "@/lib/agents/schemas";
import type { LanguageKey } from "@/lib/languages";

// Local barge-in: RMS above this for N consecutive 40 ms frames while the interviewer is
// speaking stops playback immediately (before the server VAD round-trip completes).
const BARGE_IN_RMS = 0.06;
const BARGE_IN_FRAMES = 4;

export type Connection = "idle" | "connecting" | "open" | "closed" | "error";

export interface Probe {
  question: string;
  targetLine: number | null;
  severity: "low" | "medium" | "high";
  category: string;
  at: number;
}

export interface SessionState {
  connection: Connection;
  serverStatus: AIStatus;
  phase: Phase;
  questionMeta: { title: string; difficulty: string; topics: string[] } | null;
  question: PublicQuestion | null;
  language: LanguageKey;
  transcript: TranscriptEntry[];
  probes: Probe[];
  running: "RUN" | "SUBMIT" | null;
  lastRun: RunSummary | null;
  hints: Hint[];
  error: string | null;
  ended: boolean;
  startedAtClient: number | null; // performance-independent epoch for the session clock
  resumeCode: string | null;
}

type Action =
  | { type: "connection"; value: Connection }
  | { type: "server"; msg: ServerMessage }
  | { type: "error"; message: string }
  | { type: "clear_error" };

const initial: SessionState = {
  connection: "idle",
  serverStatus: "idle",
  phase: "INTRO",
  questionMeta: null,
  question: null,
  language: "PYTHON",
  transcript: [],
  probes: [],
  running: null,
  lastRun: null,
  hints: [],
  error: null,
  ended: false,
  startedAtClient: null,
  resumeCode: null,
};

function upsertTranscript(list: TranscriptEntry[], entry: TranscriptEntry): TranscriptEntry[] {
  const idx = list.findIndex((t) => t.id === entry.id && t.speaker === entry.speaker);
  if (idx === -1) return [...list, entry];
  const next = list.slice();
  next[idx] = { ...next[idx], ...entry };
  return next;
}

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "connection":
      return { ...state, connection: action.value };
    case "error":
      return { ...state, error: action.message };
    case "clear_error":
      return { ...state, error: null };
    case "server": {
      const m = action.msg;
      switch (m.type) {
        case "ready":
          return {
            ...state,
            phase: m.phase,
            questionMeta: m.questionMeta,
            question: m.question,
            language: m.language,
            transcript: m.transcript,
            startedAtClient: Date.now() - m.elapsedMs,
            resumeCode: m.lastCode,
          };
        case "status":
          return { ...state, serverStatus: m.status };
        case "transcript":
          return { ...state, transcript: upsertTranscript(state.transcript, m.entry) };
        case "phase":
          return { ...state, phase: m.phase };
        case "question_revealed":
          return { ...state, question: m.question };
        case "probe":
          return { ...state, probes: [...state.probes, { ...m, at: Date.now() }] };
        case "run_started":
          return { ...state, running: m.mode };
        case "run_result":
          return { ...state, running: null, lastRun: m.summary };
        case "hint":
          return { ...state, hints: [...state.hints, m.hint] };
        case "error":
          return { ...state, error: m.message, running: m.fatal ? null : state.running };
        case "ended":
          return { ...state, ended: true };
        default:
          return state;
      }
    }
  }
}

export function useInterviewSession(opts: { ticket: string; gatewayUrl: string }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [analysers, setAnalysers] = useState<{ mic: AnalyserNode | null; ai: AnalyserNode | null }>({ mic: null, ai: null });

  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const loudFrames = useRef(0);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  /** Stop interviewer audio now and tell the gateway exactly how much was heard. */
  const interruptPlayback = useCallback(
    (notifyServer: boolean) => {
      const cut = playerRef.current?.interrupt();
      if (cut) send({ type: "playback_truncated", itemId: cut.itemId, audioEndMs: cut.audioEndMs });
      if (notifyServer) send({ type: "interrupt" });
    },
    [send],
  );

  const start = useCallback(async () => {
    if (wsRef.current) return;
    dispatch({ type: "connection", value: "connecting" });
    try {
      // Must run inside a user gesture: AudioContext autoplay policy + mic permission prompt.
      const ctx = new AudioContext({ latencyHint: "interactive" });
      await ctx.resume();
      ctxRef.current = ctx;

      const player = new PcmPlayer(ctx, setPlaying);
      playerRef.current = player;

      const mic = new MicCapture(ctx, (frame) => {
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) ws.send(frame.pcm);
        // Local barge-in detection.
        if (player.isPlaying && frame.rms > BARGE_IN_RMS) {
          loudFrames.current += 1;
          if (loudFrames.current >= BARGE_IN_FRAMES) {
            loudFrames.current = 0;
            interruptPlayback(true);
          }
        } else loudFrames.current = 0;
      });
      await mic.start();
      micRef.current = mic;
      setAnalysers({ mic: mic.analyser, ai: player.analyser });

      const ws = new WebSocket(`${opts.gatewayUrl.replace(/\/$/, "")}/ws`);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;
      ws.onopen = () => {
        dispatch({ type: "connection", value: "open" });
        ws.send(JSON.stringify({ type: "hello", ticket: opts.ticket } satisfies ClientMessage));
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data !== "string") return;
        const msg = JSON.parse(ev.data) as ServerMessage;
        if (msg.type === "audio") {
          player.enqueue(msg.itemId, msg.delta);
          return; // hot path: keep audio out of React state
        }
        if (msg.type === "interrupt") {
          interruptPlayback(false);
          return;
        }
        dispatch({ type: "server", msg });
      };
      ws.onclose = (ev) => {
        dispatch({ type: "connection", value: ev.code === 1000 || ev.code === 1005 ? "closed" : "error" });
        if (ev.code >= 4400) dispatch({ type: "error", message: ev.reason || "Connection rejected by gateway." });
        wsRef.current = null;
      };
      ws.onerror = () => dispatch({ type: "connection", value: "error" });
    } catch (err) {
      const message =
        (err as DOMException).name === "NotAllowedError"
          ? "Microphone permission was denied. Allow microphone access and try again."
          : (err as Error).message;
      dispatch({ type: "error", message });
      dispatch({ type: "connection", value: "error" });
      teardown();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.gatewayUrl, opts.ticket, interruptPlayback]);

  const teardown = useCallback(() => {
    wsRef.current?.close(1000);
    wsRef.current = null;
    micRef.current?.stop();
    micRef.current = null;
    playerRef.current?.dispose();
    playerRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    setAnalysers({ mic: null, ai: null });
  }, []);

  useEffect(() => teardown, [teardown]);

  useEffect(() => {
    if (state.ended) teardown();
  }, [state.ended, teardown]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    micRef.current?.setMuted(next);
    setMuted(next);
    send({ type: "mute", muted: next });
  }, [muted, send]);

  return {
    state,
    playing,
    muted,
    micAnalyser: analysers.mic,
    aiAnalyser: analysers.ai,
    start,
    toggleMute,
    interrupt: () => interruptPlayback(true),
    sendCode: (code: string, language: LanguageKey, cursorLine: number | null) => send({ type: "code_update", code, language, cursorLine }),
    run: (mode: "RUN" | "SUBMIT", code: string, language: LanguageKey) => send({ type: "run", mode, code, language }),
    end: () => send({ type: "end" }),
    clearError: () => dispatch({ type: "clear_error" }),
  };
}
