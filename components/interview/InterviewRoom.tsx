"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  FileText,
  Hand,
  Lightbulb,
  Loader2,
  MessageSquareText,
  Mic,
  MicOff,
  Moon,
  Play,
  PhoneOff,
  Send,
  Sun,
  Swords,
  X,
} from "lucide-react";
import { useInterviewSession } from "@/hooks/useInterviewSession";
import { SplitPane } from "./SplitPane";
import { AIAvatar } from "./AIAvatar";
import { AudioVisualizer } from "./AudioVisualizer";
import { StatusIndicator, type DisplayStatus } from "./StatusIndicator";
import { TranscriptPanel } from "./TranscriptPanel";
import { ProblemPanel } from "./ProblemPanel";
import { CodeEditor, type EditorTheme } from "./CodeEditor";
import { TestConsole } from "./TestConsole";
import { PhaseTimeline } from "./PhaseTimeline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LANGUAGES, LANGUAGE_KEYS, type LanguageKey } from "@/lib/languages";
import { cn, formatClock } from "@/lib/utils";

interface Props {
  sessionId: string;
  ticket: string;
  gatewayUrl: string;
  candidateName: string | null;
}

const SCRATCHPAD = (lang: LanguageKey) => {
  const c = lang === "PYTHON" ? "#" : "//";
  return `${c} Scratchpad — jot down ideas while you discuss the approach.\n${c} The problem statement and starter code unlock once you agree on an approach.\n`;
};

const CODE_SYNC_DEBOUNCE_MS = 1_200;

export function InterviewRoom({ sessionId, ticket, gatewayUrl, candidateName }: Props) {
  const router = useRouter();
  const s = useInterviewSession({ ticket, gatewayUrl });
  const { state } = s;

  const [theme, setTheme] = useState<EditorTheme>("studio-dark");
  const [leftTab, setLeftTab] = useState<"transcript" | "problem">("transcript");
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [language, setLanguage] = useState<LanguageKey>("PYTHON");
  const [codeByLang, setCodeByLang] = useState<Partial<Record<LanguageKey, string>>>({});
  const [now, setNow] = useState(Date.now());
  const [dismissedProbe, setDismissedProbe] = useState<number | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);

  const code = codeByLang[language] ?? SCRATCHPAD(language);
  const revealed = state.question !== null;

  // Session clock
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Adopt server language + resumed code once on connect.
  useEffect(() => {
    if (!state.startedAtClient || initialized.current) return;
    initialized.current = true;
    setLanguage(state.language);
    if (state.resumeCode) setCodeByLang({ [state.language]: state.resumeCode });
  }, [state.startedAtClient, state.language, state.resumeCode]);

  // When the problem is revealed, swap the scratchpad for starter code (keeping any notes as a comment block).
  useEffect(() => {
    if (!state.question) return;
    const starter = state.question.starterCode;
    setCodeByLang((prev) => {
      const next = { ...prev };
      for (const k of LANGUAGE_KEYS) {
        const cur = prev[k];
        const pad = SCRATCHPAD(k);
        if (!cur || cur === pad) next[k] = starter[k];
        else if (cur.startsWith(pad.split("\n")[0])) {
          // Preserve the candidate's scratch notes as comments above the starter code.
          const c = k === "PYTHON" ? "#" : "//";
          const notes = cur
            .slice(pad.length)
            .split("\n")
            .filter((l) => l.trim())
            .map((l) => (l.trimStart().startsWith(c) ? l : `${c} ${l}`))
            .join("\n");
          next[k] = notes ? `${notes}\n\n${starter[k]}` : starter[k];
        }
      }
      return next;
    });
    setLeftTab("problem");
  }, [state.question]);

  // Navigate to the report once the session ends.
  useEffect(() => {
    if (!state.ended) return;
    const t = setTimeout(() => router.push(`/report/${sessionId}`), 1800);
    return () => clearTimeout(t);
  }, [state.ended, router, sessionId]);

  const onCodeChange = (value: string, cursorLine: number | null) => {
    setCodeByLang((prev) => ({ ...prev, [language]: value }));
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => s.sendCode(value, language, cursorLine), CODE_SYNC_DEBOUNCE_MS);
  };

  const onLanguageChange = (next: LanguageKey) => {
    setLanguage(next);
    setCodeByLang((prev) => ({ ...prev, [next]: prev[next] ?? (state.question ? state.question.starterCode[next] : SCRATCHPAD(next)) }));
    const nextCode = codeByLang[next] ?? (state.question ? state.question.starterCode[next] : SCRATCHPAD(next));
    s.sendCode(nextCode, next, null);
  };

  const displayStatus: DisplayStatus = useMemo(() => {
    if (state.connection === "idle" || state.connection === "closed" || state.connection === "error") return "offline";
    if (state.connection === "connecting" || state.serverStatus === "connecting" || state.serverStatus === "idle") return "connecting";
    if (s.playing) return state.serverStatus === "cross_questioning" ? "cross_questioning" : "speaking";
    if (state.serverStatus === "speaking") return "listening";
    return state.serverStatus;
  }, [state.connection, state.serverStatus, s.playing]);

  const latestProbe = state.probes[state.probes.length - 1] ?? null;
  const showProbe = latestProbe && latestProbe.at !== dismissedProbe && now - latestProbe.at < 60_000;
  const elapsed = state.startedAtClient ? now - state.startedAtClient : 0;
  const latestHint = state.hints[state.hints.length - 1];

  // ─────────────────────────── left pane ───────────────────────────
  const left = (
    <div className="flex h-full flex-col bg-ink-950">
      <div className="relative border-b border-ink-800 px-5 pb-4 pt-6">
        <StatusIndicator status={displayStatus} className="absolute left-1/2 top-3 z-10 -translate-x-1/2" />
        <AIAvatar analyser={s.aiAnalyser} status={displayStatus} />
        <div className="mt-2 grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-speak">Ava · interviewer</p>
            <AudioVisualizer analyser={s.aiAnalyser} color="#38d6c4" label="Interviewer audio level" className="h-10" />
          </div>
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-signal">
              {candidateName || "You"} {s.muted && <span className="text-probe">· muted</span>}
            </p>
            <AudioVisualizer analyser={s.muted ? null : s.micAnalyser} color="#c6f432" label="Microphone level" className="h-10" />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button variant={s.muted ? "danger" : "secondary"} size="sm" onClick={s.toggleMute} disabled={state.connection !== "open"} aria-pressed={s.muted}>
            {s.muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            {s.muted ? "Unmute" : "Mute"}
          </Button>
          <Button variant="secondary" size="sm" onClick={s.interrupt} disabled={!s.playing} title="Stop the interviewer and take the floor">
            <Hand className="h-3.5 w-3.5" />
            Interrupt
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {showProbe && latestProbe && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-probe/30 bg-probe/[0.06]"
          >
            <div className="flex gap-3 px-5 py-3">
              <Swords className="mt-0.5 h-4 w-4 shrink-0 text-probe" />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-probe">
                  Cross-examination · {latestProbe.category.replace(/_/g, " ")}
                  {latestProbe.targetLine ? ` · line ${latestProbe.targetLine}` : ""}
                </p>
                <p className="mt-1 text-sm text-ink-100">{latestProbe.question}</p>
              </div>
              <button aria-label="Dismiss" onClick={() => setDismissedProbe(latestProbe.at)} className="self-start text-ink-400 hover:text-ink-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {latestHint && (
        <div className="flex gap-2 border-b border-think/30 bg-think/[0.06] px-5 py-2 text-xs text-ink-200">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-think" />
          <span>
            <span className="font-mono uppercase tracking-wider text-think">Hint ({latestHint.level}) · </span>
            {latestHint.hint}
          </span>
        </div>
      )}

      <div className="flex border-b border-ink-800 px-3" role="tablist">
        {(
          [
            { id: "transcript", label: "Transcript", icon: MessageSquareText },
            { id: "problem", label: "Problem", icon: FileText },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={leftTab === id}
            onClick={() => setLeftTab(id)}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium",
              leftTab === id ? "text-ink-100" : "text-ink-400 hover:text-ink-200",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {id === "problem" && revealed && leftTab !== "problem" && <span className="h-1.5 w-1.5 rounded-full bg-signal" />}
            {leftTab === id && <motion.span layoutId="left-tab" className="absolute inset-x-2 -bottom-px h-0.5 bg-signal" />}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {leftTab === "transcript" ? <TranscriptPanel entries={state.transcript} /> : <ProblemPanel question={state.question} meta={state.questionMeta} />}
      </div>
    </div>
  );

  // ─────────────────────────── right pane ───────────────────────────
  const right = (
    <div className={cn("flex h-full flex-col", theme === "studio-light" ? "bg-[#fbfbf8]" : "bg-ink-900")}>
      <div className="flex items-center gap-2 border-b border-ink-800 bg-ink-950 px-3 py-2">
        <select
          value={language}
          onChange={(e) => onLanguageChange(e.target.value as LanguageKey)}
          className="h-8 rounded-md border border-ink-700 bg-ink-900 px-2 font-mono text-xs text-ink-100 outline-none focus:border-signal/60"
          aria-label="Language"
        >
          {LANGUAGE_KEYS.map((k) => (
            <option key={k} value={k}>
              {LANGUAGES[k].label}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setTheme((t) => (t === "studio-dark" ? "studio-light" : "studio-dark"))}
          aria-label="Toggle editor theme"
        >
          {theme === "studio-dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={!revealed || !!state.running || state.connection !== "open"} onClick={() => s.run("RUN", code, language)}>
            {state.running === "RUN" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run
          </Button>
          <Button size="sm" variant="primary" disabled={!revealed || !!state.running || state.connection !== "open"} onClick={() => s.run("SUBMIT", code, language)}>
            {state.running === "SUBMIT" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Submit
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <CodeEditor
          value={code}
          language={language}
          theme={theme}
          onChange={onCodeChange}
          probeLine={showProbe ? latestProbe?.targetLine ?? null : null}
          probeText={latestProbe?.question ?? null}
          readOnly={state.ended}
        />
      </div>
      <div className={cn("border-t border-ink-800 bg-ink-950 transition-[height] duration-200", consoleOpen ? "h-[34%]" : "h-9")}>
        <button
          onClick={() => setConsoleOpen((o) => !o)}
          className="flex h-9 w-full items-center gap-2 border-b border-ink-800 px-4 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-400 hover:text-ink-200"
          aria-expanded={consoleOpen}
        >
          Test runner
          {state.lastRun && (
            <Badge tone={state.lastRun.passed === state.lastRun.total ? "signal" : "probe"}>
              {state.lastRun.passed}/{state.lastRun.total}
            </Badge>
          )}
          <span className="ml-auto">{consoleOpen ? "hide" : "show"}</span>
        </button>
        {consoleOpen && (
          <div className="h-[calc(100%-2.25rem)]">
            <TestConsole result={state.lastRun} running={state.running} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative flex h-[calc(100vh-3rem)] flex-col">
      {/* Session bar */}
      <div className="flex items-center gap-4 border-b border-ink-800 bg-ink-950 px-4 py-2">
        <PhaseTimeline phase={state.phase} />
        <div className="ml-auto flex items-center gap-3">
          {state.questionMeta && <span className="hidden text-xs text-ink-400 lg:inline">{state.questionMeta.title}</span>}
          <span className="font-mono text-sm tabular-nums text-ink-200">{formatClock(elapsed)}</span>
          <Button size="sm" variant="danger" onClick={s.end} disabled={state.connection !== "open" || state.ended}>
            <PhoneOff className="h-3.5 w-3.5" />
            End interview
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <SplitPane left={left} right={right} storageKey="iai.split" />
      </div>

      {/* Error toast */}
      <AnimatePresence>
        {state.error && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="absolute bottom-4 left-1/2 z-40 flex max-w-lg -translate-x-1/2 items-start gap-3 rounded-lg border border-probe/40 bg-ink-900 px-4 py-3 text-sm text-ink-100 shadow-xl"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-probe" />
            <span className="flex-1">{state.error}</span>
            <button onClick={s.clearError} aria-label="Dismiss error" className="text-ink-400 hover:text-ink-100">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Start gate: audio requires a user gesture */}
      <AnimatePresence>
        {(state.connection === "idle" || ((state.connection === "error" || state.connection === "closed") && !state.ended)) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 grid place-items-center bg-ink-950/85 backdrop-blur-sm">
            <div className="max-w-md rounded-2xl border border-ink-800 bg-ink-900 p-8 text-center shadow-2xl">
              <p className="font-display text-4xl italic text-ink-100">{state.connection === "idle" ? "Ready when you are." : "Connection lost."}</p>
              <p className="mt-3 text-sm text-ink-300">
                {state.connection === "idle"
                  ? "Ava will open the interview. Think out loud, ask clarifying questions, and expect to be interrupted when something in your code looks off."
                  : "Your transcript and code are saved. Reconnect to resume exactly where you left off."}
              </p>
              <ul className="mx-auto mt-5 max-w-xs space-y-1.5 text-left text-xs text-ink-400">
                <li>• Headphones prevent the interviewer hearing itself.</li>
                <li>• Speak over Ava any time — she’ll stop.</li>
                <li>• Run tests as often as you like; Submit runs hidden cases.</li>
              </ul>
              <Button variant="primary" size="lg" className="mt-6" onClick={() => (state.connection === "idle" ? s.start() : window.location.reload())}>
                <Mic className="h-4 w-4" />
                {state.connection === "idle" ? "Enable microphone & begin" : "Reconnect"}
              </Button>
            </div>
          </motion.div>
        )}
        {state.ended && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-30 grid place-items-center bg-ink-950/90 backdrop-blur-sm">
            <div className="text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-signal" />
              <p className="mt-4 font-display text-3xl italic text-ink-100">Interview complete.</p>
              <p className="mt-2 text-sm text-ink-400">The evaluation critic is reviewing your transcript, code history and test runs…</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
