import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/user";
import { ReportPending } from "@/components/report/ReportPending";
import { ReportView } from "@/components/report/ReportView";
import { EvaluationSchema } from "@/lib/agents/schemas";
import type { LanguageKey } from "@/lib/languages";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) redirect("/");
  const session = await prisma.interviewSession.findFirst({
    where: { id: params.id, userId: user.id },
    include: { question: { select: { title: true, difficulty: true, optimalTime: true, optimalSpace: true } }, report: true },
  });
  if (!session) notFound();
  if (!session.report) return <ReportPending sessionId={session.id} />;

  const raw = session.report.payload as Record<string, unknown>;
  // Validate on read too: reports persisted by older prompt versions fail loudly rather than render garbage.
  const evaluation = EvaluationSchema.parse(raw);
  const durationMs = session.startedAt && session.endedAt ? session.endedAt.getTime() - session.startedAt.getTime() : null;

  return (
    <ReportView
      evaluation={evaluation}
      overall={session.report.overallScore}
      finalCode={String(raw.finalCode ?? "")}
      language={(raw.language as LanguageKey) ?? session.language}
      metrics={(raw.metrics as Record<string, string | number>) ?? {}}
      question={session.question}
      durationMs={durationMs}
      model={session.report.model}
      createdAt={session.report.createdAt.toISOString()}
    />
  );
}
