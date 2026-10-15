import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { BM25Index } from "./bm25";
import { embedQuery, toVectorLiteral } from "./embeddings";
import { reciprocalRankFusion } from "./fusion";

export const DOMAINS = ["os", "dbms", "networks", "dsa", "distributed"] as const;
export type Domain = (typeof DOMAINS)[number];

export interface RetrievedChunk {
  id: string;
  domain: string;
  topic: string;
  heading: string;
  content: string;
  score: number;
  sparseRank?: number;
  denseRank?: number;
}

interface CorpusCache {
  builtAt: number;
  index: BM25Index;
  byId: Map<string, { id: string; domain: string; topic: string; heading: string; content: string }>;
}

let cache: CorpusCache | null = null;
const TTL_MS = 5 * 60_000;

async function corpus(): Promise<CorpusCache> {
  if (cache && Date.now() - cache.builtAt < TTL_MS) return cache;
  const rows = await prisma.knowledgeChunk.findMany({
    select: { id: true, domain: true, topic: true, heading: true, content: true },
  });
  cache = {
    builtAt: Date.now(),
    // Headings are repeated to up-weight them in the sparse index.
    index: new BM25Index(rows.map((r) => ({ id: r.id, text: `${r.heading} ${r.heading} ${r.content}` }))),
    byId: new Map(rows.map((r) => [r.id, r])),
  };
  return cache;
}

/**
 * Hybrid retrieval: BM25 (exact terminology like "MVCC", "TIME_WAIT") + pgvector cosine
 * (paraphrases like "why do my reads see stale rows") fused with weighted RRF.
 */
export async function hybridRetrieve(
  query: string,
  opts: { k?: number; domains?: Domain[]; sparseWeight?: number; denseWeight?: number } = {},
): Promise<RetrievedChunk[]> {
  const k = opts.k ?? 6;
  const candidates = k * 4;
  const { index, byId } = await corpus();
  const allow = opts.domains?.length ? (id: string) => opts.domains!.includes(byId.get(id)?.domain as Domain) : undefined;

  const sparse = index.search(query, candidates, allow);

  let dense: { id: string }[] = [];
  try {
    const vec = toVectorLiteral(await embedQuery(query));
    const domainFilter = opts.domains?.length
      ? Prisma.sql`AND domain = ANY(${opts.domains}::text[])`
      : Prisma.empty;
    dense = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id
      FROM "KnowledgeChunk"
      WHERE embedding IS NOT NULL ${domainFilter}
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${candidates}
    `);
  } catch (err) {
    // Degrade gracefully to sparse-only retrieval if embeddings/pgvector are unavailable.
    console.warn("[rag] dense retrieval failed, falling back to BM25:", (err as Error).message);
  }

  const fused = reciprocalRankFusion([
    { name: "sparse", weight: opts.sparseWeight ?? 1, results: sparse.map((s) => s.id) },
    { name: "dense", weight: opts.denseWeight ?? 1.2, results: dense.map((d) => d.id) },
  ]);

  return fused
    .filter((f) => byId.has(f.id))
    .slice(0, k)
    .map((f) => ({ ...byId.get(f.id)!, score: f.score, sparseRank: f.ranks.sparse, denseRank: f.ranks.dense }));
}

/** Formats retrieved chunks as a CONTEXT block for prompt augmentation. */
export function formatContext(chunks: RetrievedChunk[]): string {
  return chunks.map((c) => `<chunk id="${c.id}" domain="${c.domain}">\n${c.content}\n</chunk>`).join("\n\n");
}

export function invalidateCorpusCache() {
  cache = null;
}
