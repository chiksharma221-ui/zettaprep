import { createOpenAI } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";
import { env } from "@/lib/env";

export const EMBEDDING_DIMS = 1536;

function embeddingModel() {
  const e = env();
  return createOpenAI({ apiKey: e.OPENAI_API_KEY }).embedding(e.OPENAI_EMBEDDING_MODEL);
}

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({ model: embeddingModel(), value: text });
  return embedding;
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  // Batch to stay well under per-request token limits.
  for (let i = 0; i < texts.length; i += 64) {
    const { embeddings } = await embedMany({ model: embeddingModel(), values: texts.slice(i, i + 64) });
    out.push(...embeddings);
  }
  return out;
}

/** pgvector literal: '[0.1,0.2,...]' */
export function toVectorLiteral(v: number[]): string {
  if (v.length !== EMBEDDING_DIMS) throw new Error(`Expected ${EMBEDDING_DIMS}-dim embedding, got ${v.length}`);
  return `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(7) : "0")).join(",")}]`;
}
