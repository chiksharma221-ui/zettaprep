"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Brain, Ear, Loader2, Swords, Volume2, WifiOff } from "lucide-react";
import type { AIStatus } from "@/lib/interview/protocol";
import { cn } from "@/lib/utils";

export type DisplayStatus = AIStatus | "offline";

const META: Record<DisplayStatus, { label: string; icon: React.ElementType; cls: string; dot: string }> = {
  idle: { label: "Idle", icon: Ear, cls: "border-ink-700 text-ink-300", dot: "bg-ink-400" },
  offline: { label: "Offline", icon: WifiOff, cls: "border-ink-700 text-ink-400", dot: "bg-ink-600" },
  connecting: { label: "Connecting", icon: Loader2, cls: "border-ink-600 text-ink-200", dot: "bg-ink-300" },
  listening: { label: "Listening", icon: Ear, cls: "border-signal/50 text-signal", dot: "bg-signal" },
  thinking: { label: "Thinking", icon: Brain, cls: "border-think/50 text-think", dot: "bg-think" },
  speaking: { label: "Speaking", icon: Volume2, cls: "border-speak/50 text-speak", dot: "bg-speak" },
  cross_questioning: { label: "Cross-Questioning", icon: Swords, cls: "border-probe/60 text-probe", dot: "bg-probe" },
};

/** Floating pill showing what the AI is doing right now. */
export function StatusIndicator({ status, className }: { status: DisplayStatus; className?: string }) {
  const m = META[status];
  const Icon = m.icon;
  return (
    <div className={cn("pointer-events-none", className)} aria-live="polite">
      <AnimatePresence mode="wait">
        <motion.div
          key={status}
          initial={{ opacity: 0, y: -6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.96 }}
          transition={{ duration: 0.18 }}
          className={cn("flex items-center gap-2 rounded-full border bg-ink-950/90 px-3 py-1.5 shadow-lg shadow-black/40 backdrop-blur", m.cls)}
        >
          <span className="relative flex h-2 w-2">
            {status !== "offline" && status !== "idle" && (
              <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", m.dot)} />
            )}
            <span className={cn("relative inline-flex h-2 w-2 rounded-full", m.dot)} />
          </span>
          <Icon className={cn("h-3.5 w-3.5", status === "connecting" && "animate-spin")} />
          <span className="font-mono text-[11px] uppercase tracking-[0.16em]">{m.label}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
