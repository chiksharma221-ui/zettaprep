import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DECKS } from "@/content/flashcards";

const DOMAIN_LABEL: Record<string, string> = { os: "Operating systems", dbms: "Databases", networks: "Networking", distributed: "Distributed systems", dsa: "DSA" };

export default function ArenaPage() {
  return (
    <main className="grid-backdrop min-h-[calc(100vh-3rem)]">
      <div className="mx-auto max-w-[1200px] px-6 py-14">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-signal">CS fundamentals & system design arena</p>
        <h1 className="mt-3 max-w-3xl font-display text-6xl leading-[0.95] text-ink-100">
          Questions you can’t <em>Google</em>.
        </h1>
        <p className="mt-5 max-w-2xl text-ink-300">
          Warm up with flashcards, then take a deep dive: hybrid retrieval (BM25 + pgvector) pulls vetted theory, and the model turns it into a production
          scenario with numbers and symptoms. Your answer is graded against a rubric grounded in the same sources.
        </p>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DECKS.map((d) => (
            <Link key={d.slug} href={`/arena/${d.slug}`} className="group rounded-xl border border-ink-800 bg-ink-900/70 p-6 transition-colors hover:border-signal/50">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">{DOMAIN_LABEL[d.domain]}</p>
              <p className="mt-2 flex items-center justify-between font-display text-3xl italic text-ink-100">
                {d.title}
                <ArrowUpRight className="h-5 w-5 text-ink-600 transition-colors group-hover:text-signal" />
              </p>
              <p className="mt-2 text-sm text-ink-400">{d.blurb}</p>
              <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-600">{d.cards.length} cards · deep dive</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
