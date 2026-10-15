"use client";

import { CheckCircle2, CircleDashed, Loader2, Lock, XCircle } from "lucide-react";
import type { RunSummary } from "@/lib/judge0/types";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  PASSED: "Passed",
  WRONG_ANSWER: "Wrong answer",
  COMPILE_ERROR: "Compile error",
  RUNTIME_ERROR: "Runtime error",
  TIME_LIMIT: "Time limit exceeded",
  MEMORY_LIMIT: "Memory limit exceeded",
  INTERNAL_ERROR: "Judge error",
};

export function TestConsole({ result, running }: { result: RunSummary | null; running: "RUN" | "SUBMIT" | null }) {
  if (running) {
    return (
      <div className="flex h-full items-center gap-3 px-4 font-mono text-xs text-ink-300">
        <Loader2 className="h-4 w-4 animate-spin text-signal" />
        {running === "SUBMIT" ? "Running visible + hidden test suites in the sandbox…" : "Running examples in the sandbox…"}
      </div>
    );
  }
  if (!result) {
    return (
      <div className="flex h-full items-center gap-3 px-4 font-mono text-xs text-ink-400">
        <CircleDashed className="h-4 w-4" />
        Run executes the examples. Submit also runs hidden edge cases (only pass/fail is shown).
      </div>
    );
  }

  const allPassed = result.passed === result.total;
  return (
    <div className="thin-scroll h-full overflow-y-auto px-4 py-3 font-mono text-xs">
      <div className="mb-3 flex items-center gap-3">
        <span className={cn("text-sm font-semibold", allPassed ? "text-signal" : "text-probe")}>
          {result.passed}/{result.total} passed
        </span>
        <span className="text-ink-400">{result.mode === "SUBMIT" ? "submission" : "examples"}</span>
        {result.maxTimeMs !== null && <span className="text-ink-400">· max {result.maxTimeMs} ms</span>}
        {result.maxMemoryKb !== null && <span className="text-ink-400">· {(result.maxMemoryKb / 1024).toFixed(1)} MB</span>}
      </div>
      {result.compileOutput && (
        <pre className="mb-3 whitespace-pre-wrap rounded-md border border-probe/30 bg-probe/5 p-3 text-probe">{result.compileOutput}</pre>
      )}
      <ul className="space-y-2">
        {result.results.map((r) => (
          <li key={r.label} className="rounded-md border border-ink-800 bg-ink-950/60">
            <div className="flex items-center gap-2 px-3 py-2">
              {r.passed ? <CheckCircle2 className="h-3.5 w-3.5 text-signal" /> : <XCircle className="h-3.5 w-3.5 text-probe" />}
              <span className="text-ink-200">{r.label}</span>
              {r.hidden && <Lock className="h-3 w-3 text-ink-400" />}
              <span className={cn("ml-auto", r.passed ? "text-ink-400" : "text-probe")}>{STATUS_LABEL[r.status]}</span>
              {r.timeMs !== null && <span className="text-ink-600">{r.timeMs}ms</span>}
            </div>
            {!r.hidden && !r.passed && (
              <div className="grid gap-2 border-t border-ink-800 p-3 md:grid-cols-3">
                <Block title="Input" body={r.input} />
                <Block title="Expected" body={r.expected} tone="signal" />
                <Block title={r.stderr ? "Stdout / stderr" : "Your output"} body={[r.stdout, r.stderr].filter(Boolean).join("\n---\n")} tone="probe" />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Block({ title, body, tone }: { title: string; body?: string; tone?: "signal" | "probe" }) {
  const text = body ?? "";
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] uppercase tracking-[0.16em] text-ink-400">{title}</p>
      <pre
        className={cn(
          "thin-scroll max-h-32 overflow-auto whitespace-pre-wrap rounded bg-ink-900 p-2",
          tone === "signal" ? "text-signal" : tone === "probe" ? "text-probe" : "text-ink-200",
        )}
      >
        {text.length > 1500 ? `${text.slice(0, 1500)}\n… (truncated)` : text || "(empty)"}
      </pre>
    </div>
  );
}
