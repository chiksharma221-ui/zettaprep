"use client";

import { useMemo, useState } from "react";
import { AlertOctagon, AlertTriangle, Info, ThumbsUp } from "lucide-react";
import type { LineAnnotation } from "@/lib/agents/schemas";
import { cn } from "@/lib/utils";

const SEV = {
  praise: { icon: ThumbsUp, text: "text-signal", line: "bg-signal/[0.07] border-signal", chip: "border-signal/40 text-signal" },
  info: { icon: Info, text: "text-think", line: "bg-think/[0.07] border-think", chip: "border-think/40 text-think" },
  warning: { icon: AlertTriangle, text: "text-amber-300", line: "bg-amber-300/[0.07] border-amber-300", chip: "border-amber-300/40 text-amber-300" },
  critical: { icon: AlertOctagon, text: "text-probe", line: "bg-probe/[0.08] border-probe", chip: "border-probe/40 text-probe" },
} as const;

/**
 * Final solution with line-anchored critic annotations rendered inline beneath the lines they
 * cover. Annotation list on the side doubles as navigation.
 */
export function AnnotatedCode({ code, annotations }: { code: string; annotations: LineAnnotation[] }) {
  const lines = useMemo(() => code.replace(/\r\n/g, "\n").split("\n"), [code]);
  const [active, setActive] = useState<number | null>(null);

  const byEndLine = useMemo(() => {
    const m = new Map<number, { a: LineAnnotation; i: number }[]>();
    annotations.forEach((a, i) => {
      const end = a.endLine ?? a.line;
      m.set(end, [...(m.get(end) ?? []), { a, i }]);
    });
    return m;
  }, [annotations]);

  const covering = (ln: number) => annotations.findIndex((a) => ln >= a.line && ln <= (a.endLine ?? a.line));

  if (!code.trim()) return <p className="p-5 text-sm text-ink-400">No code was written in this session.</p>;

  return (
    <div className="thin-scroll max-h-[720px] overflow-auto bg-ink-950 py-3 font-mono text-[13px] leading-[22px]">
      {lines.map((text, idx) => {
        const ln = idx + 1;
        const ci = covering(ln);
        const sev = ci >= 0 ? SEV[annotations[ci].severity] : null;
        return (
          <div key={ln}>
            <div
              className={cn("flex border-l-2 border-transparent", sev && sev.line, active !== null && ci === active && "ring-1 ring-inset ring-ink-600")}
              onMouseEnter={() => ci >= 0 && setActive(ci)}
            >
              <span className="w-12 shrink-0 select-none pr-3 text-right text-ink-600">{ln}</span>
              <pre className="whitespace-pre text-ink-200">{text || " "}</pre>
            </div>
            {byEndLine.get(ln)?.map(({ a, i }) => {
              const S = SEV[a.severity];
              const Icon = S.icon;
              return (
                <div key={i} className="my-1.5 ml-12 mr-4 rounded-md border border-ink-800 bg-ink-900 p-3 font-sans text-sm" onMouseEnter={() => setActive(i)}>
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-3.5 w-3.5", S.text)} />
                    <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider", S.chip)}>{a.severity}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-400">
                      {a.category.replace(/_/g, " ")} · L{a.line}
                      {a.endLine && a.endLine !== a.line ? `–${a.endLine}` : ""}
                    </span>
                  </div>
                  <p className="mt-1.5 text-ink-200">{a.comment}</p>
                  {a.suggestion && (
                    <pre className="thin-scroll mt-2 overflow-x-auto rounded bg-ink-950 p-2 font-mono text-xs text-signal">{a.suggestion}</pre>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
