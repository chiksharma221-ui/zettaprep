"use client";

import { useCallback } from "react";
import { useAudioVisualizer } from "@/hooks/useAudioVisualizer";
import { cn } from "@/lib/utils";

interface Props {
  analyser: AnalyserNode | null;
  color: string;
  className?: string;
  bars?: number;
  mirrored?: boolean;
  label?: string;
}

/**
 * Mirrored frequency-bar waveform rendered on canvas from a Web Audio AnalyserNode.
 * Uses a log-spaced bin mapping so voice frequencies get most of the bars.
 */
export function AudioVisualizer({ analyser, color, className, bars = 48, mirrored = true, label }: Props) {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, data: Uint8Array, w: number, h: number) => {
      const usable = Math.floor(data.length * 0.45);
      const gap = 2;
      const bw = Math.max(1, (w - gap * (bars - 1)) / bars);
      const mid = h / 2;
      ctx.fillStyle = color;
      for (let i = 0; i < bars; i++) {
        // Log-spaced index: more bars for low (voice) frequencies.
        const idx = Math.min(usable - 1, Math.floor(Math.pow(usable, i / bars)));
        const v = data[idx] / 255;
        const amp = Math.max(1.5, v * (mirrored ? mid - 2 : h - 2));
        const x = i * (bw + gap);
        ctx.globalAlpha = 0.35 + v * 0.65;
        if (mirrored) roundRect(ctx, x, mid - amp, bw, amp * 2, Math.min(bw / 2, 3));
        else roundRect(ctx, x, h - amp, bw, amp, Math.min(bw / 2, 3));
      }
      ctx.globalAlpha = 1;
    },
    [bars, color, mirrored],
  );
  const { canvasRef } = useAudioVisualizer(analyser, draw);
  return <canvas ref={canvasRef} aria-label={label} role="img" className={cn("h-12 w-full", className)} />;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}
