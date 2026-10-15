"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, BookOpen, Check, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import type { Deck } from "@/content/flashcards";
import type { ArenaGrade, ScenarioQuestion } from "@/lib/agents/schemas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Source = { id: string; heading: string; sparseRank: number | null; denseRank: number | null };

export function ArenaDeck({ deck }: { deck: Deck }) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<string>>(new Set());

  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const [scenario, setScenario] = useState<{ question: ScenarioQuestion; sources: Source[] } | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [grade, setGrade] = useState<ArenaGrade | null>(null);
  const [loading, setLoading] = useState<"question" | "grade" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const card = deck.cards[idx];
  const go = (d: number) => {
    setFlipped(false);
    setIdx((i) => (i + d + deck.cards.length) % deck.cards.length);
  };
  const mark = (k: boolean) => {
    setKnown((prev) => {
      const n = new Set(prev);
      if (k) n.add(card.id);
      else n.delete(card.id);
      return n;
    });
    go(1);
  };

  async function newScenario() {
    setLoading("question");
    setError(null);
    setGrade(null);
    setAnswer("");
    try {
      const res = await fetch("/api/arena/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deck: deck.slug, difficulty, avoidTitles: history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not generate a question.");
      setScenario(data);
      setHistory((h) => [...h, data.question.title].slice(-20));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function submitAnswer() {
    if (!scenario) return;
    setLoading("grade");
    setError(null);
    try {
      const res = await fetch("/api/arena/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: scenario.question, answer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Grading failed.");
      setGrade(data.grade);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="grid-backdrop min-h-[calc(100vh-3rem)]">
      <div className="mx-auto max-w-[1200px] px-6 py-10">
        <Link href="/arena" className="inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-100">
          <ArrowLeft className="h-3.5 w-3.5" /> Arena
        </Link>
        <h1 className="mt-3 font-display text-5xl italic text-ink-100">{deck.title}</h1>

        <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          {/* Flashcards */}
          <section>
            <div className="mb-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.16em] text-ink-400">
              <span>
                Card {idx + 1} / {deck.cards.length}
              </span>
              <span className="text-signal">{known.size} known</span>
            </div>
            <button
              onClick={() => setFlipped((f) => !f)}
              className="relative block h-72 w-full [perspective:1200px]"
              aria-label={flipped ? "Show question" : "Reveal answer"}
            >
              <motion.div
                className="relative h-full w-full [transform-style:preserve-3d]"
                animate={{ rotateY: flipped ? 180 : 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
              >
                <div className="absolute inset-0 flex flex-col justify-between rounded-2xl border border-ink-700 bg-ink-900 p-7 text-left [backface-visibility:hidden]">
                  <Badge className="self-start">question</Badge>
                  <p className="font-display text-3xl leading-tight text-ink-100">{card.front}</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-600">click to flip</p>
                </div>
                <div className="absolute inset-0 flex flex-col justify-between rounded-2xl border border-signal/40 bg-ink-850 p-7 text-left [backface-visibility:hidden] [transform:rotateY(180deg)]">
                  <Badge tone="signal" className="self-start">
                    answer
                  </Badge>
                  <p className="text-lg leading-relaxed text-ink-100">{card.back}</p>
                  <span />
                </div>
              </motion.div>
            </button>
            <div className="mt-4 flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => go(-1)}>
                <ArrowLeft className="h-3.5 w-3.5" /> Prev
              </Button>
              <div className="flex gap-2">
                <Button variant="danger" size="sm" onClick={() => mark(false)}>
                  <X className="h-3.5 w-3.5" /> Review again
                </Button>
                <Button variant="primary" size="sm" onClick={() => mark(true)}>
                  <Check className="h-3.5 w-3.5" /> Got it
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => go(1)}>
                Next <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </section>

          {/* Deep dive */}
          <Card>
            <CardHeader>
              <CardTitle>Deep dive · RAG scenario</CardTitle>
              <div className="flex items-center gap-2">
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
                  className="h-8 rounded-md border border-ink-700 bg-ink-950 px-2 font-mono text-xs text-ink-100"
                  aria-label="Difficulty"
                >
                  <option>EASY</option>
                  <option>MEDIUM</option>
                  <option>HARD</option>
                </select>
                <Button size="sm" variant="primary" onClick={newScenario} disabled={loading !== null}>
                  {loading === "question" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : scenario ? <RotateCcw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {scenario ? "Another" : "Generate"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && <p className="rounded-md border border-probe/40 bg-probe/5 px-3 py-2 text-sm text-probe">{error}</p>}
              {!scenario && !loading && (
                <p className="text-sm text-ink-400">Generate a production-grounded scenario on {deck.title.toLowerCase()} and explain your reasoning like you would on-site.</p>
              )}
              <AnimatePresence mode="wait">
                {scenario && (
                  <motion.div key={scenario.question.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    <div className="flex items-center gap-2">
                      <p className="font-display text-2xl italic text-ink-100">{scenario.question.title}</p>
                      <Badge tone={scenario.question.difficulty === "HARD" ? "probe" : "think"}>{scenario.question.difficulty}</Badge>
                    </div>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-ink-300">{scenario.question.scenario}</p>
                    <p className="border-l-2 border-signal pl-3 text-[15px] text-ink-100">{scenario.question.question}</p>
                    <textarea
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      rows={7}
                      placeholder="Walk through the mechanism, how you'd diagnose it, and the fix with its trade-offs…"
                      className="w-full resize-y rounded-md border border-ink-700 bg-ink-950 p-3 text-sm text-ink-100 outline-none focus:border-signal/60"
                    />
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-400">
                        <BookOpen className="h-3 w-3" />
                        {scenario.sources.length} retrieved chunks
                      </span>
                      <Button size="sm" variant="primary" onClick={submitAnswer} disabled={loading !== null || answer.trim().length < 10}>
                        {loading === "grade" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Grade my answer
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {grade && scenario && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 border-t border-ink-800 pt-4">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("font-display text-5xl", grade.score >= 7 ? "text-signal" : grade.score >= 5 ? "text-think" : "text-probe")}>
                      {grade.score.toFixed(1)}
                    </span>
                    <span className="font-mono text-xs text-ink-400">/ 10</span>
                  </div>
                  <ul className="space-y-1.5 text-sm">
                    {scenario.question.expectedPoints.map((p) => {
                      const hit = grade.coveredPoints.some((c) => c.toLowerCase().includes(p.toLowerCase().slice(0, 24)) || p.toLowerCase().includes(c.toLowerCase().slice(0, 24)));
                      return (
                        <li key={p} className="flex gap-2">
                          {hit ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-signal" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-probe" />}
                          <span className={hit ? "text-ink-200" : "text-ink-400"}>{p}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {grade.misconceptions.length > 0 && (
                    <div className="rounded-md border border-probe/30 bg-probe/5 p-3 text-sm">
                      <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-probe">Misconceptions</p>
                      <ul className="list-inside list-disc text-ink-200">
                        {grade.misconceptions.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-ink-400">Model answer</p>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-ink-200">{grade.modelAnswer}</p>
                  </div>
                  <p className="rounded-md border border-ink-700 bg-ink-950 p-3 text-sm text-ink-100">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-signal">Follow-up · </span>
                    {grade.nextFollowUp}
                  </p>
                  <details className="text-xs text-ink-400">
                    <summary className="cursor-pointer font-mono uppercase tracking-wider">Retrieval trace</summary>
                    <ul className="mt-2 space-y-1 font-mono">
                      {scenario.sources.map((s) => (
                        <li key={s.id} className={cn(scenario.question.sourceIds.includes(s.id) && "text-signal")}>
                          {s.heading} · bm25 #{s.sparseRank ?? "–"} · dense #{s.denseRank ?? "–"}
                        </li>
                      ))}
                    </ul>
                  </details>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
