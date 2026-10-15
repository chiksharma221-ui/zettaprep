"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Swords } from "lucide-react";
import type { TranscriptEntry } from "@/lib/interview/protocol";
import { cn, formatClock } from "@/lib/utils";

const SPEAKER: Record<TranscriptEntry["speaker"], { name: string; cls: string }> = {
  INTERVIEWER: { name: "Ava", cls: "text-speak" },
  CANDIDATE: { name: "You", cls: "text-signal" },
  CROSS_EXAMINER: { name: "Cross-exam", cls: "text-probe" },
  SYSTEM: { name: "System", cls: "text-think" },
};

/** Streaming transcript with auto-scroll that pauses when the user scrolls up. */
export function TranscriptPanel({ entries }: { entries: TranscriptEntry[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [entries]);

  return (
    <div
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      }}
      className="thin-scroll h-full space-y-3 overflow-y-auto px-4 py-4"
    >
      {entries.length === 0 && <p className="pt-8 text-center text-sm text-ink-400">The conversation will appear here as you speak.</p>}
      <AnimatePresence initial={false}>
        {entries.map((t) => {
          const s = SPEAKER[t.speaker];
          if (t.speaker === "CROSS_EXAMINER") {
            return (
              <motion.div
                key={`${t.speaker}-${t.id}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex gap-2 rounded-md border border-probe/30 bg-probe/5 px-3 py-2 text-xs text-probe"
              >
                <Swords className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="font-mono uppercase tracking-wider">Probe injected · </span>
                  {t.text}
                </span>
              </motion.div>
            );
          }
          return (
            <motion.div key={`${t.speaker}-${t.id}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-sm leading-relaxed">
              <div className="mb-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em]">
                <span className={s.cls}>{s.name}</span>
                <span className="text-ink-600">{formatClock(t.offsetMs)}</span>
                {t.interrupted && <span className="text-ink-400">· interrupted</span>}
              </div>
              <p className={cn("text-ink-200", !t.final && "text-ink-300", t.speaker === "SYSTEM" && "text-xs text-ink-400")}>
                {t.text}
                {!t.final && <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-speak/70" />}
              </p>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
