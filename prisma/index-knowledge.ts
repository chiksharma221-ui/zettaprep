/**
 * Builds the hybrid-RAG corpus: chunks content/knowledge/*.md, embeds every chunk with OpenAI,
 * and writes rows + pgvector embeddings into KnowledgeChunk. BM25 is built in-process at query
 * time from the same rows, so no separate sparse index needs to be stored.
 *
 * Run: npm run db:index   (re-runnable — replaces each domain's chunks)
 */
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { chunkMarkdown } from "@/lib/rag/chunker";
import { embedDocuments, toVectorLiteral } from "@/lib/rag/embeddings";

const DIR = join(process.cwd(), "content", "knowledge");

async function main() {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
  const files = readdirSync(DIR).filter((f) => f.endsWith(".md"));
  let total = 0;

  for (const file of files) {
    const domain = basename(file, ".md");
    const chunks = chunkMarkdown(readFileSync(join(DIR, file), "utf8"));
    console.log(`→ ${domain}: ${chunks.length} chunks, embedding…`);
    const vectors = await embedDocuments(chunks.map((c) => c.content));

    await prisma.$transaction(async (tx) => {
      await tx.knowledgeChunk.deleteMany({ where: { domain } });
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const row = await tx.knowledgeChunk.create({
          data: { domain, topic: c.topic, heading: c.heading, content: c.content, tokenCount: c.tokenCount },
          select: { id: true },
        });
        await tx.$executeRaw(
          Prisma.sql`UPDATE "KnowledgeChunk" SET embedding = ${toVectorLiteral(vectors[i])}::vector WHERE id = ${row.id}`,
        );
      }
    }, { timeout: 120_000 });
    total += chunks.length;
  }

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS knowledge_chunk_embedding_hnsw ON "KnowledgeChunk" USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)`,
  );
  console.log(`Indexed ${total} chunks across ${files.length} domains.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
