import { NextResponse } from "next/server";
import { z } from "zod";
import { DECKS } from "@/content/flashcards";
import { generateScenarioQuestion } from "@/lib/agents/arena";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  deck: z.string(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
  avoidTitles: z.array(z.string().max(120)).max(20).default([]),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const deck = DECKS.find((d) => d.slug === parsed.data.deck);
  if (!deck) return NextResponse.json({ error: "unknown deck" }, { status: 404 });
  try {
    const { question, sources } = await generateScenarioQuestion({
      topic: deck.deepDiveTopic,
      domain: deck.domain,
      difficulty: parsed.data.difficulty,
      avoidTitles: parsed.data.avoidTitles,
    });
    return NextResponse.json({
      question,
      sources: sources.map((s) => ({ id: s.id, heading: s.heading, sparseRank: s.sparseRank ?? null, denseRank: s.denseRank ?? null })),
    });
  } catch (err) {
    console.error("[arena/question]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
