import Link from "next/link";
import { ArrowUpRight, AudioLines, Braces, Radar, Swords } from "lucide-react";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/user";
import { StartInterviewForm } from "@/components/StartInterviewForm";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [questions, user] = await Promise.all([
    prisma.question.findMany({ select: { slug: true, title: true, difficulty: true, topics: true }, orderBy: { title: "asc" } }),
    currentUser(),
  ]);
  const sessions = user
    ? await prisma.interviewSession.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { question: { select: { title: true } }, report: { select: { verdict: true, overallScore: true } } },
      })
    : [];

  return (
    <main className="relative grid-backdrop noise min-h-[calc(100vh-3rem)]">
      <div className="mx-auto grid max-w-[1200px] gap-12 px-6 py-16 lg:grid-cols-[1.15fr_1fr]">
        <section>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-signal">Live technical interview simulator</p>
          <h1 className="mt-4 font-display text-6xl leading-[0.95] tracking-tight text-ink-100 md:text-7xl">
            An interviewer that <em className="text-signal">notices</em> line 18.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-300">
            Talk through a real coding problem with a voice interviewer while an adversarial cross-examiner reads every edit you make —
            and interrupts when your queue is secretly quadratic.
          </p>
          <ul className="mt-10 grid max-w-xl gap-4 sm:grid-cols-2">
            {[
              { icon: AudioLines, t: "Speech-to-speech", d: "Realtime voice with barge-in: talk over the interviewer and it stops." },
              { icon: Swords, t: "Cross-examination", d: "A second agent diffs your code and injects pointed follow-ups." },
              { icon: Braces, t: "Hidden test suites", d: "Judge0 runs your code against edge cases you never see." },
              { icon: Radar, t: "Committee-grade report", d: "Five-axis radar plus line-by-line annotations." },
            ].map(({ icon: Icon, t, d }) => (
              <li key={t} className="rounded-lg border border-ink-800 bg-ink-900/60 p-4">
                <Icon className="h-4 w-4 text-signal" />
                <p className="mt-2 text-sm font-medium text-ink-100">{t}</p>
                <p className="mt-1 text-sm text-ink-400">{d}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-6">
          <StartInterviewForm questions={questions} defaultName={user?.name ?? ""} />
          {sessions.length > 0 && (
            <div className="rounded-xl border border-ink-800 bg-ink-900/70">
              <p className="border-b border-ink-800 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400">Your sessions</p>
              <ul className="divide-y divide-ink-800">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={s.report || s.status === "EVALUATING" ? `/report/${s.id}` : `/interview/${s.id}`}
                      className="flex items-center justify-between px-5 py-3 text-sm hover:bg-ink-850"
                    >
                      <span className="text-ink-200">{s.question.title}</span>
                      <span className="flex items-center gap-2">
                        {s.report ? (
                          <Badge tone={s.report.overallScore >= 7 ? "signal" : s.report.overallScore >= 5 ? "think" : "probe"}>
                            {s.report.verdict.replace(/_/g, " ")} · {s.report.overallScore.toFixed(1)}
                          </Badge>
                        ) : (
                          <Badge>{s.status === "CREATED" || s.status === "LIVE" ? "resume" : s.status.toLowerCase()}</Badge>
                        )}
                        <ArrowUpRight className="h-3.5 w-3.5 text-ink-400" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
