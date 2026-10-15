import { z } from "zod";

/**
 * Structured-output contracts for every text agent. Each schema is passed to the Vercel AI SDK
 * `generateObject`, which enforces it via tool-calling / JSON-schema mode and validates the
 * response with Zod before it ever reaches application code.
 */

// ───────────────────────── Cross-Examiner ─────────────────────────

export const CrossExamDecisionSchema = z.object({
  shouldInterject: z
    .boolean()
    .describe("True only if there is a substantive, non-redundant question worth interrupting the candidate for right now."),
  severity: z
    .enum(["low", "medium", "high"])
    .describe("high = correctness bug or wrong complexity claim; medium = questionable design choice; low = curiosity / depth check."),
  category: z.enum([
    "correctness",
    "complexity",
    "data_structure_choice",
    "edge_case",
    "assumption",
    "code_quality",
    "consistency_with_spoken_plan",
  ]),
  targetLine: z.number().int().min(1).nullable().describe("1-based line in the CURRENT code the question is about, or null."),
  question: z
    .string()
    .max(320)
    .describe("The exact follow-up to ask aloud. One or two sentences, specific, references the code concretely. No praise."),
  rationale: z.string().max(400).describe("Private reasoning for the evaluator log. Not spoken."),
  observedComplexity: z
    .object({ time: z.string(), space: z.string() })
    .describe("Your best estimate of the current code's complexity, e.g. O(n log n) / O(n)."),
});
export type CrossExamDecision = z.infer<typeof CrossExamDecisionSchema>;

// ───────────────────────── Hint generator ─────────────────────────

export const HintSchema = z.object({
  level: z.enum(["nudge", "directional", "concrete"]),
  hint: z.string().max(400).describe("The hint text the interviewer will paraphrase aloud. Never contains full code."),
  conceptTags: z.array(z.string()).max(4),
  penalty: z.number().min(0).max(1).describe("Fraction to subtract from the independence portion of the score (0-1)."),
});
export type Hint = z.infer<typeof HintSchema>;

// ───────────────────────── Evaluation Critic ─────────────────────────

const DimensionSchema = z.object({
  score: z.number().min(0).max(10),
  justification: z.string().max(600).describe("Evidence-based: cite transcript timestamps, test results or line numbers."),
});

export const LineAnnotationSchema = z.object({
  line: z.number().int().min(1).describe("1-based line number in the FINAL code snapshot."),
  endLine: z.number().int().min(1).nullable(),
  severity: z.enum(["praise", "info", "warning", "critical"]),
  category: z.enum(["correctness", "complexity", "edge_case", "readability", "idiom", "naming"]),
  comment: z.string().max(400),
  suggestion: z.string().max(600).nullable().describe("Concrete replacement code or change, if applicable."),
});
export type LineAnnotation = z.infer<typeof LineAnnotationSchema>;

export const ConversationMomentSchema = z.object({
  offsetMs: z.number().int().min(0).describe("Timestamp of the moment, copied from the transcript."),
  phase: z.enum(["INTRO", "QUESTION_PROPOSAL", "CODING_AND_PROBING", "OPTIMIZATION_CROSS_EXAM", "DEBRIEF", "COMPLETED"]),
  quote: z.string().max(300).describe("Short verbatim quote from the candidate."),
  assessment: z.enum(["strong", "adequate", "weak"]),
  observation: z.string().max(400),
  suggestion: z.string().max(400).describe("What the candidate should have said or done instead, phrased actionably."),
});
export type ConversationMoment = z.infer<typeof ConversationMomentSchema>;

export const EvaluationSchema = z.object({
  verdict: z.enum(["STRONG_HIRE", "HIRE", "LEAN_HIRE", "LEAN_NO_HIRE", "NO_HIRE"]),
  summary: z.string().max(900).describe("3-5 sentence hiring-committee summary."),
  dimensions: z.object({
    codeCorrectness: DimensionSchema,
    algorithmicComplexity: DimensionSchema,
    edgeCaseHandling: DimensionSchema,
    communicationClarity: DimensionSchema,
    speed: DimensionSchema,
  }),
  finalComplexity: z.object({
    time: z.string(),
    space: z.string(),
    isOptimal: z.boolean(),
    explanation: z.string().max(400),
  }),
  strengths: z.array(z.string().max(240)).min(1).max(5),
  improvements: z
    .array(z.object({ title: z.string().max(80), detail: z.string().max(400), drill: z.string().max(240).describe("A specific practice exercise.") }))
    .min(1)
    .max(5),
  lineAnnotations: z.array(LineAnnotationSchema).max(20),
  conversationBreakdown: z.array(ConversationMomentSchema).max(12),
  crossExamPerformance: z
    .array(z.object({ probe: z.string(), response: z.string(), handled: z.enum(["well", "partially", "poorly"]) }))
    .max(10),
});
export type Evaluation = z.infer<typeof EvaluationSchema>;

// ───────────────────────── CS Fundamentals Arena ─────────────────────────

export const ScenarioQuestionSchema = z.object({
  title: z.string().max(100),
  scenario: z.string().max(1200).describe("A concrete production scenario (numbers, symptoms, constraints) — not a definition question."),
  question: z.string().max(400),
  expectedPoints: z.array(z.string().max(240)).min(3).max(7).describe("Rubric points a strong answer must hit."),
  followUps: z.array(z.string().max(240)).min(1).max(3),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  sourceIds: z.array(z.string()).describe("ids of retrieved chunks actually used."),
});
export type ScenarioQuestion = z.infer<typeof ScenarioQuestionSchema>;

export const ArenaGradeSchema = z.object({
  score: z.number().min(0).max(10),
  coveredPoints: z.array(z.string()),
  missedPoints: z.array(z.string()),
  misconceptions: z.array(z.string()),
  modelAnswer: z.string().max(1500),
  nextFollowUp: z.string().max(300),
});
export type ArenaGrade = z.infer<typeof ArenaGradeSchema>;
