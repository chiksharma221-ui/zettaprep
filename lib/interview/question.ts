import type { Question } from "@prisma/client";
import type { QuestionBrief } from "@/lib/agents/prompts";
import type { TestCase } from "@/lib/judge0/types";
import type { LanguageKey } from "@/lib/languages";

export function toQuestionBrief(q: Question): QuestionBrief {
  return {
    title: q.title,
    difficulty: q.difficulty,
    prompt: q.prompt,
    inputFormat: q.inputFormat,
    outputFormat: q.outputFormat,
    constraints: q.constraints,
    referenceNotes: q.referenceNotes,
    optimalTime: q.optimalTime,
    optimalSpace: q.optimalSpace,
  };
}

/** The candidate-safe projection of a question: no hidden tests, no reference notes. */
export interface PublicQuestion {
  id: string;
  slug: string;
  title: string;
  difficulty: string;
  topics: string[];
  prompt: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  starterCode: Record<LanguageKey, string>;
  visibleTests: TestCase[];
  hiddenTestCount: number;
}

export function toPublicQuestion(q: Question): PublicQuestion {
  return {
    id: q.id,
    slug: q.slug,
    title: q.title,
    difficulty: q.difficulty,
    topics: q.topics,
    prompt: q.prompt,
    inputFormat: q.inputFormat,
    outputFormat: q.outputFormat,
    constraints: q.constraints,
    starterCode: q.starterCode as Record<LanguageKey, string>,
    visibleTests: q.visibleTests as unknown as TestCase[],
    hiddenTestCount: (q.hiddenTests as unknown as TestCase[]).length,
  };
}
