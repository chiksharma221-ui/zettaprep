import { generateObject } from "ai";
import { agentModel } from "./model";
import { HINT_SYSTEM, type QuestionBrief } from "./prompts";
import { HintSchema, type Hint } from "./schemas";

export async function generateHint(args: {
  question: QuestionBrief;
  code: string;
  recentTranscript: string;
  hintsUsed: number;
  requestedLevel?: Hint["level"];
}): Promise<Hint> {
  const { model } = agentModel();
  const levels: Hint["level"][] = ["nudge", "directional", "concrete"];
  const level = args.requestedLevel ?? levels[Math.min(args.hintsUsed, 2)];
  const { object } = await generateObject({
    model,
    schema: HintSchema,
    schemaName: "Hint",
    system: HINT_SYSTEM,
    prompt: `Problem: ${args.question.title}\n${args.question.prompt}\n\nPrivate notes: ${args.question.referenceNotes}\n\nHints already given: ${args.hintsUsed}. Requested level: ${level}.\n\nCandidate code:\n${args.code || "(empty)"}\n\nRecent conversation:\n${args.recentTranscript || "(none)"}`,
    temperature: 0.4,
    maxTokens: 400,
  });
  return object;
}
