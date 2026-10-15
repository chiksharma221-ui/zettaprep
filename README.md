# InterviewAI Studio

A voice-first, multi-agent technical interview simulator.

- **Lead Interviewer** speaks to you through the OpenAI Realtime API (speech-to-speech) and moves through the interview phases with tool calls.
- **Cross-Examiner** reads every code diff and interrupts with pointed questions, like *"Why `list.pop(0)` on line 18?"*
- **Evaluation Critic** turns the transcript, code history and hidden-test results into a five-axis report with line-by-line annotations.
- **Fundamentals Arena**: flashcards plus scenario questions built from hybrid BM25 + pgvector retrieval.

Architecture, sequence diagrams and the state machine are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Stack
Next.js 14 (App Router, TypeScript) · Tailwind · Framer Motion · Monaco · Recharts · Vercel AI SDK (`generateObject` + Zod) · OpenAI Realtime · Anthropic Claude or OpenAI for the text agents · Prisma + Postgres/pgvector (Supabase) · Judge0 CE · a Node `ws` gateway.

## Project layout
```
app/                      Next.js routes (home, interview room, report, arena, API)
components/interview/     InterviewRoom, SplitPane, AudioVisualizer, AIAvatar, StatusIndicator, CodeEditor, TestConsole…
components/report/        ReportView, RadarPanel, AnnotatedCode
components/arena/         Flashcards + RAG deep-dive
hooks/                    useInterviewSession (WS + audio engine), useAudioVisualizer
lib/agents/               prompts.ts, schemas.ts (Zod), realtime-tools.ts, cross-examiner, critic, hint, arena
lib/interview/            state-machine.ts (+ tests), protocol.ts, ticket.ts, question.ts
lib/rag/                  bm25.ts, fusion.ts (RRF), embeddings.ts, hybrid.ts, chunker.ts
lib/judge0/               batch execution client
lib/audio/                MicCapture (AudioWorklet), PcmPlayer (gapless + truncation)
server/gateway.ts         Realtime WebSocket gateway (voice ↔ agents ↔ Judge0 ↔ DB)
prisma/                   schema.prisma, seed.ts, index-knowledge.ts, seed-data/questions.json
content/                  knowledge base (markdown) + flashcard decks
public/worklets/          pcm-capture.js AudioWorklet
```

## Setup (Windows, macOS or Linux)

Requirements: Node 20+, a Postgres with pgvector (Supabase or the bundled `docker-compose.yml`), an OpenAI API key with Realtime access, optionally an Anthropic key, and a Judge0 endpoint.

```bash
npm install
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
# fill in DATABASE_URL, DIRECT_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY, JUDGE0_*, GATEWAY_SECRET
```

**Database**
- Local: `docker compose up -d` (Postgres 16 + pgvector on :5432; the defaults in `.env.example` already point at it).
- Supabase: enable the `vector` extension (Database → Extensions), then use the pooled connection string for `DATABASE_URL` and the direct one for `DIRECT_URL`.

```bash
npx prisma db push            # creates tables + vector extension
npm run db:seed               # 4 problems, each with visible and hidden test suites
npm run db:index              # chunks + embeds the CS knowledge base, builds the HNSW index
```

**Judge0**
- RapidAPI: set `JUDGE0_URL=https://judge0-ce.p.rapidapi.com`, plus `JUDGE0_API_KEY` and `JUDGE0_API_HOST`.
- Self-hosted: follow the Judge0 CE deployment guide, set `JUDGE0_URL=http://localhost:2358`, and leave the key empty.

**Run**
```bash
npm run dev                   # Next.js on :3000 and the gateway on :3001
```
Open http://localhost:3000, choose a problem, and put on headphones (otherwise the interviewer can hear itself through your speakers).

```bash
npm test                      # state machine + BM25/RRF unit tests
npm run typecheck
```

## Production notes
- Deploy the gateway as its own long-running service (Fly.io, Railway, ECS…) behind TLS, and set `NEXT_PUBLIC_GATEWAY_URL=wss://…`. Use the same `GATEWAY_SECRET` and `DATABASE_URL` for both the web app and the gateway.
- Users are guest identities bound to an httpOnly cookie (`lib/user.ts`). To add real accounts, swap `currentUser()` for your auth provider (NextAuth, Clerk or Supabase Auth); `User.email` is already in the schema.
- The text agents use `AGENT_PROVIDER` (`anthropic` or `openai`). Set the model ids with `ANTHROPIC_MODEL` / `OPENAI_AGENT_MODEL`.
- Prompts are versioned (`PROMPT_VERSION` in `lib/agents/prompts.ts`), and every report stores the version that produced it.
