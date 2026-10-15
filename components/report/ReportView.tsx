"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, CircleSlash, Clock, Gauge, MessageCircle, Swords, Target } from "lucide-react";
import type { Evaluation } from "@/lib/agents/schemas";
import { LANGUAGES, type LanguageKey } from "@/lib/languages";
import { cn, formatClock } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadarPanel } from "./RadarPanel";
import { AnnotatedCode } from "./AnnotatedCode";

interface Props {
  evaluation: Evaluation;
  overall: number;
  finalCode: string;
  language: LanguageKey;
  metrics: Record<string, string | number>;
  question: { title: string; difficulty: string; optimalTime: string; optimalSpace: string };
  durationMs: number | null;
  model: string;
  createdAt: string;
}

const VERDICT_STYLE: Record<Evaluation["verdict"], string> = {
  STRONG_HIRE: "text-signal",
  HIRE: "text-signal",
  LEAN_HIRE: "text-think",
  LEAN_NO_HIRE: "text-amber-300",
  NO_HIRE: "text-probe",
};

const DIMENSIONS: { key: keyof Evaluation["dimensions"]; label: string; short: string }[] = [
  { key: "codeCorrectness", label: "Code Correctness", short: "Correctness" },
  { key: "algorithmicComplexity", label: "Algorithmic Complexity", short: "Complexity" },
  { key: "edgeCaseHandling", label: "Edge Case Handling", short: "Edge cases" },
  { key: "communicationClarity", label: "Communication Clarity", short: "Communication" },
  { key: "speed", label: "Speed", short: "Speed" },
];

export function ReportView({ evaluation: e, overall, finalCode, language, metrics, question, durationMs, model, createdAt }: Props) {
  const radar = DIMENSIONS.map((d) => ({ dimension: d.short, score: e.dimensions[d.key].score, bar: 5 }));

  return (
    <main className="grid-backdrop min-h-[calc(100vh-3rem)]">
      <div className="mx-auto max-w-[1280px] space-y-6 px-6 py-10">
        {/* Header */}
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-400">
              Evaluation · {question.title} · {LANGUAGES[language].label}
            </p>
            <h1 className={cn("mt-3 font-display text-6xl italic leading-none", VERDICT_STYLE[e.verdict])}>{e.verdict.replace(/_/g, " ").toLowerCase()}</h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-ink-200">{e.summary}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {durationMs !== null && (
                <Badge>
                  <Clock className="h-3 w-3" /> {formatClock(durationMs)}
                </Badge>
              )}
              {Object.entries(metrics).map(([k, v]) => (
                <Badge key={k}>
                  {k}: {v}
                </Badge>
              ))}
            </div>
          </div>
          <Card className="flex items-center gap-6 p-6">
            <div className="text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">Overall</p>
              <p className="font-display text-7xl leading-none text-ink-100">{overall.toFixed(1)}</p>
              <p className="font-mono text-xs text-ink-400">/ 10</p>
            </div>
            <div className="flex-1 space-y-3 border-l border-ink-800 pl-6 text-sm">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-ink-400" />
                <span className="text-ink-300">Final:</span>
                <span className="font-mono text-ink-100">
                  {e.finalComplexity.time} / {e.finalComplexity.space}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-ink-400" />
                <span className="text-ink-300">Optimal:</span>
                <span className="font-mono text-ink-100">
                  {question.optimalTime} / {question.optimalSpace}
                </span>
              </div>
              <div className="flex items-start gap-2">
                {e.finalComplexity.isOptimal ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-signal" /> : <CircleSlash className="mt-0.5 h-4 w-4 text-probe" />}
                <span className="text-ink-300">{e.finalComplexity.explanation}</span>
              </div>
            </div>
          </Card>
        </motion.section>

        {/* Radar + dimensions */}
        <section className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle>Competency radar</CardTitle>
              <span className="flex items-center gap-3 font-mono text-[10px] text-ink-400">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 bg-signal" /> you
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0 w-4 border-t border-dashed border-ink-400" /> hiring bar
                </span>
              </span>
            </CardHeader>
            <CardContent>
              <RadarPanel data={radar} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Dimension breakdown</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-ink-800">
              {DIMENSIONS.map((d) => {
                const dim = e.dimensions[d.key];
                return (
                  <li key={d.key} className="px-5 py-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-ink-100">{d.label}</span>
                      <span className="font-mono text-sm tabular-nums text-ink-200">{dim.score.toFixed(1)}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${dim.score * 10}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className={cn("h-full rounded-full", dim.score >= 7 ? "bg-signal" : dim.score >= 5 ? "bg-think" : "bg-probe")}
                      />
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-ink-300">{dim.justification}</p>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>

        {/* Code annotations */}
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Line-by-line review of your final solution</CardTitle>
            <span className="font-mono text-[10px] text-ink-400">{e.lineAnnotations.length} annotations</span>
          </CardHeader>
          <AnnotatedCode code={finalCode} annotations={e.lineAnnotations} />
        </Card>

        {/* Conversation + cross-exam */}
        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Conversation breakdown</CardTitle>
              <MessageCircle className="h-4 w-4 text-ink-400" />
            </CardHeader>
            <ol className="relative space-y-5 px-5 py-5 before:absolute before:bottom-5 before:left-[29px] before:top-5 before:w-px before:bg-ink-800">
              {e.conversationBreakdown.map((m, i) => (
                <li key={i} className="relative pl-8">
                  <span
                    className={cn(
                      "absolute left-[5px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-ink-900",
                      m.assessment === "strong" ? "bg-signal" : m.assessment === "adequate" ? "bg-think" : "bg-probe",
                    )}
                  />
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-400">
                    {formatClock(m.offsetMs)} · {m.phase.replace(/_/g, " ").toLowerCase()} · {m.assessment}
                  </p>
                  <blockquote className="mt-1 border-l-2 border-ink-700 pl-3 text-sm italic text-ink-200">“{m.quote}”</blockquote>
                  <p className="mt-2 text-sm text-ink-300">{m.observation}</p>
                  <p className="mt-1 flex gap-1.5 text-sm text-signal">
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {m.suggestion}
                  </p>
                </li>
              ))}
              {e.conversationBreakdown.length === 0 && <li className="text-sm text-ink-400">No notable moments recorded.</li>}
            </ol>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Cross-examination</CardTitle>
                <Swords className="h-4 w-4 text-probe" />
              </CardHeader>
              <ul className="divide-y divide-ink-800">
                {e.crossExamPerformance.map((c, i) => (
                  <li key={i} className="px-5 py-4 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-ink-100">{c.probe}</p>
                      <Badge tone={c.handled === "well" ? "signal" : c.handled === "partially" ? "think" : "probe"}>{c.handled}</Badge>
                    </div>
                    <p className="mt-1.5 text-ink-400">{c.response}</p>
                  </li>
                ))}
                {e.crossExamPerformance.length === 0 && <li className="px-5 py-4 text-sm text-ink-400">No probes were injected this session.</li>}
              </ul>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Strengths</CardTitle>
              </CardHeader>
              <ul className="space-y-2 px-5 py-4">
                {e.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink-200">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
                    {s}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>What to work on next</CardTitle>
          </CardHeader>
          <div className="grid gap-px bg-ink-800 md:grid-cols-2 lg:grid-cols-3">
            {e.improvements.map((imp, i) => (
              <div key={i} className="bg-ink-900 p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-probe">0{i + 1}</p>
                <p className="mt-1 font-medium text-ink-100">{imp.title}</p>
                <p className="mt-2 text-sm text-ink-300">{imp.detail}</p>
                <p className="mt-3 rounded-md border border-ink-700 bg-ink-950 p-3 text-xs text-ink-200">
                  <span className="font-mono uppercase tracking-wider text-signal">Drill · </span>
                  {imp.drill}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <footer className="flex flex-wrap items-center justify-between gap-3 pb-6 text-xs text-ink-400">
          <span className="font-mono">
            critic: {model} · {new Date(createdAt).toLocaleString()}
          </span>
          <div className="flex gap-2">
            <Link href="/arena">
              <Button variant="outline" size="sm">
                Drill fundamentals
              </Button>
            </Link>
            <Link href="/">
              <Button variant="primary" size="sm">
                New interview <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
