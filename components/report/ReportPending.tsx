"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const STEPS = [
  "Aligning transcript with code snapshots…",
  "Replaying test runs and hidden-suite results…",
  "Scoring the five rubric dimensions…",
  "Annotating your final solution line by line…",
  "Writing the hiring-committee summary…",
];

/** Polls until the Critic's report exists; triggers the idempotent fallback evaluator if it stalls. */
export function ReportPending({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const triggered = useRef(false);
  const started = useRef(Date.now());

  useEffect(() => {
    const ticker = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 2600);
    const poll = setInterval(async () => {
      const res = await fetch(`/api/sessions/${sessionId}/report`, { cache: "no-store" });
      if (!res.ok) return;
      const { status } = (await res.json()) as { status: string };
      if (status === "ready") {
        router.refresh();
        return;
      }
      // If the gateway never started (or crashed during) evaluation, run it via HTTP.
      if (!triggered.current && (status !== "evaluating" || Date.now() - started.current > 90_000)) {
        triggered.current = true;
        const r = await fetch(`/api/sessions/${sessionId}/evaluate`, { method: "POST" });
        if (r.ok) router.refresh();
        else if (r.status !== 202) setError(((await r.json()) as { error?: string }).error ?? "Evaluation failed.");
      }
    }, 3000);
    return () => {
      clearInterval(ticker);
      clearInterval(poll);
    };
  }, [router, sessionId]);

  return (
    <main className="grid min-h-[calc(100vh-3rem)] place-items-center grid-backdrop">
      <div className="text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-signal" />
        <p className="mt-5 font-display text-4xl italic text-ink-100">The committee is deliberating.</p>
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.16em] text-ink-400">{error ?? STEPS[step]}</p>
      </div>
    </main>
  );
}
