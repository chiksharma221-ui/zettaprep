-- Run once after `prisma db push` (or put in a migration). Supabase: SQL editor.
CREATE EXTENSION IF NOT EXISTS vector;

-- HNSW index for cosine-distance ANN search over the knowledge corpus.
CREATE INDEX IF NOT EXISTS knowledge_chunk_embedding_hnsw
  ON "KnowledgeChunk" USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
