import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await prisma.interviewSession.findFirst({
    where: { id: params.id, userId: user.id },
    select: { status: true, updatedAt: true, report: { select: { id: true } } },
  });
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ status: session.report ? "ready" : session.status.toLowerCase(), updatedAt: session.updatedAt });
}
