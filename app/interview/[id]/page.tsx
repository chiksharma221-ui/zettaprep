import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { currentUser } from "@/lib/user";
import { issueTicket } from "@/lib/interview/ticket";
import { InterviewRoom } from "@/components/interview/InterviewRoom";

export const dynamic = "force-dynamic";

export default async function InterviewPage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) redirect("/");
  const session = await prisma.interviewSession.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true, status: true, phase: true },
  });
  if (!session) notFound();
  if (session.phase === "COMPLETED" || session.status === "EVALUATING" || session.status === "EVALUATED") redirect(`/report/${session.id}`);

  // Short-lived, session-scoped credential for the realtime gateway.
  const ticket = issueTicket(session.id, user.id, env().GATEWAY_SECRET);
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "ws://localhost:3001";

  return <InterviewRoom sessionId={session.id} ticket={ticket} gatewayUrl={gatewayUrl} candidateName={user.name} />;
}
