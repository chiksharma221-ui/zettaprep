import { z } from "zod";

/**
 * Server-side environment, validated lazily so that `next build` does not require secrets.
 * Call `env()` inside request handlers / the gateway, never at module top level.
 */
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime"),
  OPENAI_REALTIME_VOICE: z.string().default("marin"),
  OPENAI_TRANSCRIBE_MODEL: z.string().default("gpt-4o-mini-transcribe"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  AGENT_PROVIDER: z.enum(["anthropic", "openai"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5-5"),
  OPENAI_AGENT_MODEL: z.string().default("gpt-4.1"),
  JUDGE0_URL: z.string().url().default("https://judge0-ce.p.rapidapi.com"),
  JUDGE0_API_KEY: z.string().optional(),
  JUDGE0_API_HOST: z.string().optional(),
  GATEWAY_PORT: z.coerce.number().int().default(3001),
  GATEWAY_SECRET: z.string().min(16, "GATEWAY_SECRET must be at least 16 characters"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example`);
  }
  if (parsed.data.AGENT_PROVIDER === "anthropic" && !parsed.data.ANTHROPIC_API_KEY) {
    throw new Error("AGENT_PROVIDER=anthropic requires ANTHROPIC_API_KEY");
  }
  cached = parsed.data;
  return cached;
}
