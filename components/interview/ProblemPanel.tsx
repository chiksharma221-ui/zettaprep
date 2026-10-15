"use client";

import { Lock } from "lucide-react";
import type { PublicQuestion } from "@/lib/interview/question";
import { Badge } from "@/components/ui/badge";

/** Minimal, dependency-free renderer for the inline markdown used in problem statements. */
function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("`") ? (
      <code key={i} className="rounded bg-ink-800 px-1 py-0.5 font-mono text-[0.85em] text-signal">
        {p.slice(1, -1)}
      </code>
    ) : p.startsWith("**") ? (
      <strong key={i} className="text-ink-100">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export function ProblemPanel({
  question,
  meta,
}: {
  question: PublicQuestion | null;
  meta: { title: string; difficulty: string; topics: string[] } | null;
}) {
  if (!question) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <Lock className="h-5 w-5 text-ink-400" />
        <p className="text-sm text-ink-300">
          {meta ? (
            <>
              <span className="text-ink-100">{meta.title}</span> will unlock once you and the interviewer agree on an approach.
            </>
          ) : (
            "The problem unlocks once you agree on an approach with the interviewer."
          )}
        </p>
        <p className="text-xs text-ink-400">Ask clarifying questions — that’s part of the evaluation.</p>
      </div>
    );
  }
  return (
    <div className="thin-scroll h-full overflow-y-auto px-5 py-4 text-sm leading-relaxed text-ink-300">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-2xl italic text-ink-100">{question.title}</h2>
        <Badge tone={question.difficulty === "HARD" ? "probe" : question.difficulty === "MEDIUM" ? "think" : "signal"}>{question.difficulty}</Badge>
      </div>
      <div className="mt-3 space-y-3">
        {question.prompt.split(/\n{2,}/).map((para, i) => (
          <p key={i}>{renderInline(para)}</p>
        ))}
      </div>
      <dl className="mt-5 space-y-3">
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">Input</dt>
          <dd>{question.inputFormat}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">Output</dt>
          <dd>{question.outputFormat}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">Constraints</dt>
          <dd>
            <ul className="list-inside list-disc">
              {question.constraints.map((c) => (
                <li key={c} className="font-mono text-xs">{c}</li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
      <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">Examples</p>
      <div className="mt-2 space-y-2">
        {question.visibleTests.map((t, i) => (
          <div key={i} className="grid grid-cols-2 gap-2">
            <pre className="thin-scroll overflow-x-auto rounded-md bg-ink-950 p-2 font-mono text-xs text-ink-200">{t.input}</pre>
            <pre className="thin-scroll overflow-x-auto rounded-md bg-ink-950 p-2 font-mono text-xs text-signal">{t.expected}</pre>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-ink-400">+ {question.hiddenTestCount} hidden test cases run on Submit.</p>
    </div>
  );
}
