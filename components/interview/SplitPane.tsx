"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { clamp, cn } from "@/lib/utils";

interface Props {
  left: React.ReactNode;
  right: React.ReactNode;
  initial?: number; // percentage width of the left pane
  min?: number;
  max?: number;
  storageKey?: string;
  className?: string;
}

/**
 * Horizontal split with a draggable, keyboard-accessible divider. Uses pointer capture so the
 * drag keeps tracking even over the Monaco iframe-like surface.
 */
export function SplitPane({ left, right, initial = 38, min = 24, max = 62, storageKey, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(initial);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (saved) setPct(clamp(saved, min, max));
    } catch {
      /* storage unavailable */
    }
  }, [storageKey, min, max]);

  const persist = useCallback(
    (v: number) => {
      if (!storageKey) return;
      try {
        localStorage.setItem(storageKey, String(Math.round(v)));
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPct(clamp(((e.clientX - rect.left) / rect.width) * 100, min, max));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 5 : 1;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setPct((p) => {
        const v = clamp(p + (e.key === "ArrowLeft" ? -step : step), min, max);
        persist(v);
        return v;
      });
    }
  };

  return (
    <div ref={ref} className={cn("flex h-full w-full overflow-hidden", dragging && "select-none", className)} onPointerMove={onPointerMove}>
      <div style={{ width: `${pct}%` }} className="h-full min-w-0">
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setDragging(true);
        }}
        onPointerUp={(e) => {
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
          setDragging(false);
          persist(pct);
        }}
        onDoubleClick={() => {
          setPct(initial);
          persist(initial);
        }}
        className={cn(
          "group relative z-10 flex w-2 shrink-0 cursor-col-resize items-center justify-center bg-ink-900 outline-none transition-colors hover:bg-ink-800 focus-visible:bg-signal/20",
          dragging && "bg-signal/20",
        )}
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-ink-700 group-hover:bg-signal/60" />
        <GripVertical className="relative h-4 w-4 text-ink-600 group-hover:text-signal" />
      </div>
      {/* Transparent shield stops Monaco from swallowing pointer events mid-drag. */}
      {dragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}
      <div style={{ width: `${100 - pct}%` }} className="h-full min-w-0">
        {right}
      </div>
    </div>
  );
}
