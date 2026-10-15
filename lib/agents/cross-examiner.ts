import { generateObject } from "ai";
import { agentModel } from "./model";
import { CROSS_EXAMINER_SYSTEM, crossExaminerUserPrompt, type QuestionBrief } from "./prompts";
import { CrossExamDecisionSchema, type CrossExamDecision } from "./schemas";
import type { Phase } from "@/lib/interview/state-machine";

export interface CrossExamInput {
  question: QuestionBrief;
  phase: Phase;
  language: string;
  currentCode: string;
  diff: string;
  recentTranscript: string;
  probesAsked: string[];
  secondsInPhase: number;
  lastRun: string | null;
}

/**
 * Runs the Cross-Examiner on the latest code state. Returns null when the model fails, so a
 * flaky LLM call can never break the live interview loop.
 */
export async function runCrossExaminer(input: CrossExamInput, signal?: AbortSignal): Promise<CrossExamDecision | null> {
  const { model } = agentModel();
  try {
    const { object } = await generateObject({
      model,
      schema: CrossExamDecisionSchema,
      schemaName: "CrossExamDecision",
      system: CROSS_EXAMINER_SYSTEM,
      prompt: crossExaminerUserPrompt(input),
      temperature: 0.3,
      maxTokens: 700,
      abortSignal: signal,
    });
    // Defensive post-validation: never interject with an empty or duplicate question.
    const q = object.question.trim();
    if (!q) return { ...object, shouldInterject: false };
    const normalized = q.toLowerCase();
    if (input.probesAsked.some((p) => similarity(p.toLowerCase(), normalized) > 0.6)) {
      return { ...object, shouldInterject: false };
    }
    return { ...object, question: q };
  } catch (err) {
    if ((err as Error).name !== "AbortError") console.error("[cross-examiner] failed:", (err as Error).message);
    return null;
  }
}

/** Jaccard similarity over word sets — cheap guard against rephrased duplicate probes. */
function similarity(a: string, b: string): number {
  const A = new Set(a.split(/\W+/).filter((w) => w.length > 2));
  const B = new Set(b.split(/\W+/).filter((w) => w.length > 2));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}
