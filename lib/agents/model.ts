import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV1 } from "ai";
import { env } from "@/lib/env";

/** Returns the configured text model used by the Cross-Examiner, Critic, Hint and Arena agents. */
export function agentModel(): { model: LanguageModelV1; id: string } {
  const e = env();
  if (e.AGENT_PROVIDER === "anthropic") {
    const anthropic = createAnthropic({ apiKey: e.ANTHROPIC_API_KEY });
    return { model: anthropic(e.ANTHROPIC_MODEL), id: `anthropic:${e.ANTHROPIC_MODEL}` };
  }
  const openai = createOpenAI({ apiKey: e.OPENAI_API_KEY });
  // structuredOutputs = strict JSON-schema decoding on OpenAI.
  return { model: openai(e.OPENAI_AGENT_MODEL, { structuredOutputs: true }), id: `openai:${e.OPENAI_AGENT_MODEL}` };
}
