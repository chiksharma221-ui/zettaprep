"use client";

import { useCallback } from "react";
import { motion, useTransform } from "framer-motion";
import { useAudioVisualizer } from "@/hooks/useAudioVisualizer";
import type { DisplayStatus } from "./StatusIndicator";

const COLORS: Record<DisplayStatus, string> = {
  idle: "#7a8297",
  offline: "#343b4d",
  connecting: "#a3aabb",
  listening: "#c6f432",
  thinking: "#8b7cff",
  speaking: "#38d6c4",
  cross_questioning: "#ff6b3d",
};

/**
 * The interviewer "presence": a radial spectrum ring around a core orb whose scale tracks the
 * interviewer's voice level. Color encodes the AI state.
 */
export function AIAvatar({ analyser, status, name = "Ava" }: { analyser: AnalyserNode | null; status: DisplayStatus; name?: string }) {
  const color = COLORS[status];
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, data: Uint8Array, w: number, h: number, level: number) => {
      const cx = w / 2;
      const cy = h / 2;
      const base = Math.min(w, h) * 0.3;
      const spokes = 96;
      const usable = Math.floor(data.length * 0.4);
      ctx.strokeStyle = color;
      ctx.lineCap = "round";
      for (let i = 0; i < spokes; i++) {
        // Mirror the spectrum so the ring is symmetric.
        const k = i < spokes / 2 ? i : spokes - i;
        const v = data[Math.floor((k / (spokes / 2)) * (usable - 1))] / 255;
        const a = (i / spokes) * Math.PI * 2 - Math.PI / 2;
        const r1 = base + 6;
        const r2 = r1 + 4 + v * base * 0.55 + level * 6;
        ctx.globalAlpha = 0.25 + v * 0.75;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    [color],
  );
  const { canvasRef, level } = useAudioVisualizer(analyser, draw);
  const scale = useTransform(level, [0, 0.6], [1, 1.18]);
  const glow = useTransform(level, [0, 0.6], [0.25, 0.8]);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[260px]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      <motion.div
        style={{ scale, opacity: glow, background: `radial-gradient(circle, ${color}55 0%, transparent 65%)` }}
        className="absolute inset-[18%] rounded-full blur-xl"
      />
      <motion.div
        style={{ scale, borderColor: color }}
        className="absolute inset-[27%] grid place-items-center rounded-full border-2 bg-ink-900"
      >
        <span className="font-display text-4xl italic" style={{ color }}>
          {name[0]}
        </span>
      </motion.div>
      <motion.div
        aria-hidden
        className="absolute inset-[23%] rounded-full border border-dashed transition-opacity"
        style={{ borderColor: color, opacity: status === "thinking" ? 0.9 : 0 }}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
      />
      {status === "cross_questioning" && <span className="absolute inset-[24%] animate-pulse-ring rounded-full border-2 border-probe" />}
    </div>
  );
}
