import { generateObject } from "ai";
import { agentModel } from "./model";
import { ARENA_GRADE_SYSTEM, ARENA_QUESTION_SYSTEM } from "./prompts";
import { ArenaGradeSchema, ScenarioQuestionSchema, type ScenarioQuestion } from "./schemas";
import { formatContext, hybridRetrieve, type Domain, type RetrievedChunk } from "@/lib/rag/hybrid";

/**
 * Contextual prompt augmentation: retrieve vetted theory for the topic, then ask the model to
 * turn it into a scenario-based, non-Googleable question grounded in those chunks.
 */
export async function generateScenarioQuestion(args: {
  topic: string;
  domain?: Domain;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  avoidTitles?: string[];
}): Promise<{ question: ScenarioQuestion; sources: RetrievedChunk[] }> {
  const sources = await hybridRetrieve(`${args.topic} internals failure modes trade-offs`, {
    k: 6,
    domains: args.domain ? [args.domain] : undefined,
  });
  const { model } = agentModel();
  const { object } = await generateObject({
    model,
    schema: ScenarioQuestionSchema,
    schemaName: "ScenarioQuestion",
    system: ARENA_QUESTION_SYSTEM,
    prompt: `Topic: ${args.topic}\nDifficulty: ${args.difficulty}\n${
      args.avoidTitles?.length ? `Do not repeat these previous questions: ${args.avoidTitles.join(" | ")}\n` : ""
    }\nCONTEXT:\n${formatContext(sources)}`,
    temperature: 0.8,
    maxTokens: 1500,
  });
  const valid = new Set(sources.map((s) => s.id));
  return { question: { ...object, sourceIds: object.sourceIds.filter((id) => valid.has(id)) }, sources };
}

export async function gradeArenaAnswer(args: { question: ScenarioQuestion; answer: string }) {
  const sources = await hybridRetrieve(`${args.question.title} ${args.question.question}`, { k: 5 });
  const { model } = agentModel();
  const { object } = await generateObject({
    model,
    schema: ArenaGradeSchema,
    schemaName: "ArenaGrade",
    system: ARENA_GRADE_SYSTEM,
    prompt: `SCENARIO:\n${args.question.scenario}\n\nQUESTION:\n${args.question.question}\n\nRUBRIC POINTS:\n${args.question.expectedPoints
      .map((p, i) => `${i + 1}. ${p}`)
      .join("\n")}\n\nCANDIDATE ANSWER:\n${args.answer}\n\nCONTEXT:\n${formatContext(sources)}`,
    temperature: 0.2,
    maxTokens: 1500,
  });
  return object;
}
