"use client";

import { motion } from "framer-motion";
import { PHASES, PHASE_LABEL, type Phase } from "@/lib/interview/state-machine";
import { cn } from "@/lib/utils";

export function PhaseTimeline({ phase }: { phase: Phase }) {
  const steps = PHASES.filter((p) => p !== "COMPLETED");
  const current = PHASES.indexOf(phase);
  return (
    <ol className="flex items-center gap-1" aria-label="Interview phase">
      {steps.map((p, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={p} className="flex items-center gap-1">
            <span
              className={cn(
                "relative rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
                active ? "text-ink-950" : done ? "text-ink-300" : "text-ink-600",
              )}
              aria-current={active ? "step" : undefined}
            >
              {active && <motion.span layoutId="phase-pill" className="absolute inset-0 rounded-full bg-signal" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
              <span className="relative">{PHASE_LABEL[p]}</span>
            </span>
            {i < steps.length - 1 && <span className={cn("h-px w-3", done ? "bg-ink-400" : "bg-ink-700")} />}
          </li>
        );
      })}
    </ol>
  );
}
