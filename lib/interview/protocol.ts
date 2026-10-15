/**
 * Wire protocol between the browser and the realtime gateway.
 * Text frames carry JSON messages below; binary frames (client → server only) carry raw
 * little-endian PCM16 mono audio at 24 kHz.
 */
import type { Phase } from "./state-machine";
import type { RunSummary } from "@/lib/judge0/types";
import type { PublicQuestion } from "./question";
import type { LanguageKey } from "@/lib/languages";
import type { Hint } from "@/lib/agents/schemas";

export const AUDIO_SAMPLE_RATE = 24_000;

export type AIStatus = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "cross_questioning";

export type TranscriptSpeaker = "CANDIDATE" | "INTERVIEWER" | "CROSS_EXAMINER" | "SYSTEM";

// ───────────── client → server ─────────────
export type ClientMessage =
  | { type: "hello"; ticket: string }
  | { type: "code_update"; code: string; language: LanguageKey; cursorLine: number | null }
  | { type: "run"; mode: "RUN" | "SUBMIT"; code: string; language: LanguageKey }
  | { type: "interrupt" }
  | { type: "playback_truncated"; itemId: string; audioEndMs: number }
  | { type: "mute"; muted: boolean }
  | { type: "end" };

// ───────────── server → client ─────────────
export type ServerMessage =
  | {
      type: "ready";
      phase: Phase;
      elapsedMs: number;
      questionMeta: { title: string; difficulty: string; topics: string[] };
      question: PublicQuestion | null; // null until the statement is revealed
      language: LanguageKey;
      transcript: TranscriptEntry[];
      lastCode: string | null;
    }
  | { type: "status"; status: AIStatus }
  | { type: "transcript"; entry: TranscriptEntry }
  | { type: "audio"; itemId: string; delta: string /* base64 PCM16 */ }
  | { type: "interrupt" }
  | { type: "phase"; phase: Phase; reason: string }
  | { type: "question_revealed"; question: PublicQuestion }
  | {
      type: "probe";
      question: string;
      targetLine: number | null;
      severity: "low" | "medium" | "high";
      category: string;
    }
  | { type: "run_started"; mode: "RUN" | "SUBMIT" }
  | { type: "run_result"; summary: RunSummary }
  | { type: "hint"; hint: Hint }
  | { type: "error"; message: string; fatal: boolean }
  | { type: "ended"; sessionId: string };

export interface TranscriptEntry {
  id: string; // realtime item id or generated
  speaker: TranscriptSpeaker;
  text: string;
  final: boolean;
  offsetMs: number;
  interrupted?: boolean;
}
