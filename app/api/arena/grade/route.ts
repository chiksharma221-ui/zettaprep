import { NextResponse } from "next/server";
import { z } from "zod";
import { ScenarioQuestionSchema } from "@/lib/agents/schemas";
import { gradeArenaAnswer } from "@/lib/agents/arena";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ question: ScenarioQuestionSchema, answer: z.string().min(10).max(6000) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Answer must be at least 10 characters." }, { status: 400 });
  try {
    return NextResponse.json({ grade: await gradeArenaAnswer(parsed.data) });
  } catch (err) {
    console.error("[arena/grade]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
