import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/user";
import { evaluateSession } from "@/lib/agents/critic";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Idempotent fallback trigger for the Post-Session Critic. The gateway normally starts the
 * evaluation when the interview ends; the report page calls this if no report has appeared.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await prisma.interviewSession.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true, endedAt: true, phase: true, report: { select: { id: true } }, updatedAt: true, status: true },
  });
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (session.report) return NextResponse.json({ status: "ready" });

  // Avoid duplicate work while the gateway's evaluation is still within its normal window.
  const evaluatingRecently = session.status === "EVALUATING" && Date.now() - session.updatedAt.getTime() < 90_000;
  if (evaluatingRecently) return NextResponse.json({ status: "evaluating" }, { status: 202 });

  if (!session.endedAt) {
    await prisma.interviewSession.update({ where: { id: session.id }, data: { endedAt: new Date(), phase: "COMPLETED" } });
  }
  try {
    await evaluateSession(session.id);
    return NextResponse.json({ status: "ready" });
  } catch (err) {
    console.error("[evaluate]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
