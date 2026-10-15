"use client";

import { useEffect, useRef } from "react";
import { useMotionValue, type MotionValue } from "framer-motion";

/**
 * Drives a canvas from an AnalyserNode's frequency data on requestAnimationFrame, and exposes
 * the smoothed overall level as a Framer Motion value (no React re-renders per frame).
 */
export function useAudioVisualizer(
  analyser: AnalyserNode | null,
  draw: (ctx: CanvasRenderingContext2D, data: Uint8Array, w: number, h: number, level: number) => void,
): { canvasRef: React.RefObject<HTMLCanvasElement>; level: MotionValue<number> } {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const level = useMotionValue(0);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const bins = analyser ? analyser.frequencyBinCount : 64;
    const data = new Uint8Array(bins);
    let smoothed = 0;
    let raf = 0;

    const frame = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (analyser) analyser.getByteFrequencyData(data);
      else data.fill(0);
      // Speech energy lives roughly in the lowest third of the spectrum at 24–48 kHz.
      const speechBins = Math.max(1, Math.floor(bins / 3));
      let sum = 0;
      for (let i = 0; i < speechBins; i++) sum += data[i];
      const instant = sum / speechBins / 255;
      smoothed = smoothed * 0.8 + instant * 0.2;
      level.set(smoothed);
      ctx2d.clearRect(0, 0, width, height);
      drawRef.current(ctx2d, data, width, height, smoothed);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [analyser, level]);

  return { canvasRef, level };
}
