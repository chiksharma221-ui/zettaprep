import { generateObject } from "ai";
import type { Verdict } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatClock } from "@/lib/utils";
import { agentModel } from "./model";
import { CRITIC_SYSTEM, criticUserPrompt, PROMPT_VERSION } from "./prompts";
import { EvaluationSchema, type Evaluation } from "./schemas";
import { toQuestionBrief } from "@/lib/interview/question";
import { LANGUAGES } from "@/lib/languages";
import type { RunSummary } from "@/lib/judge0/types";

const VERDICT_ORDER: Verdict[] = ["NO_HIRE", "LEAN_NO_HIRE", "LEAN_HIRE", "HIRE", "STRONG_HIRE"];

/**
 * Post-Session Critic: gathers transcript, code evolution and runs, asks the model for a strict
 * EvaluationSchema object, applies deterministic policy caps, and persists an EvaluationReport.
 * Idempotent: returns the existing report if one was already produced.
 */
export async function evaluateSession(sessionId: string) {
  const existing = await prisma.evaluationReport.findUnique({ where: { sessionId } });
  if (existing) return existing;

  const session = await prisma.interviewSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      user: true,
      question: true,
      transcript: { orderBy: { offsetMs: "asc" } },
      snapshots: { orderBy: { offsetMs: "asc" } },
    },
  });

  await prisma.interviewSession.update({ where: { id: sessionId }, data: { status: "EVALUATING" } });

  const transcript = session.transcript
    .map((t) => `[${formatClock(t.offsetMs)}|${t.offsetMs}ms] ${t.speaker} (${t.phase})${t.interrupted ? " [interrupted]" : ""}: ${t.text}`)
    .join("\n");

  const edits = session.snapshots.filter((s) => s.diff.trim().length > 0);
  // Keep the prompt bounded: the most recent 40 diffs carry nearly all of the signal.
  const snapshots = edits
    .slice(-40)
    .map((s) => `### [${formatClock(s.offsetMs)}] ${s.kind}\n${s.diff.slice(0, 2500)}`)
    .join("\n\n");

  const runs = session.snapshots.filter((s) => s.kind !== "EDIT" && s.runResult);
  const runsText = runs
    .map((s) => {
      const r = s.runResult as unknown as RunSummary;
      const failed = r.results.find((x) => !x.passed && !x.hidden);
      const failures = r.results
        .filter((x) => !x.passed)
        .map((x) => (x.hidden ? `hidden:${x.label}` : `visible:${x.label}`))
        .join(", ");
      return `[${formatClock(s.offsetMs)}] ${s.kind}: ${r.passed}/${r.total} passed${failures ? ` | failed: ${failures}` : ""}${
        r.compileOutput ? ` | compile: ${r.compileOutput.slice(0, 300)}` : ""
      }${failed?.stderr ? ` | stderr: ${failed.stderr.slice(0, 300)}` : ""}`;
    })
    .join("\n");

  const finalSnapshot = session.snapshots[session.snapshots.length - 1];
  const finalCode = finalSnapshot?.code ?? "";

  const firstPassing = runs.find((s) => {
    const r = s.runResult as unknown as RunSummary;
    return r.total > 0 && r.passed === r.total;
  });
  const lastSubmit = [...runs].reverse().find((s) => s.kind === "SUBMIT");
  const submitResult = lastSubmit ? (lastSubmit.runResult as unknown as RunSummary) : null;
  const durationMs =
    session.startedAt && (session.endedAt ?? finalSnapshot?.createdAt)
      ? (session.endedAt ?? finalSnapshot!.createdAt).getTime() - session.startedAt.getTime()
      : 0;

  const metrics: Record<string, string | number> = {
    "total duration": formatClock(durationMs),
    "time to first fully-passing run": firstPassing ? formatClock(firstPassing.offsetMs) : "never",
    "number of runs": runs.filter((r) => r.kind === "RUN").length,
    "hidden tests (last submit)": submitResult ? `${submitResult.passed}/${submitResult.total}` : "not submitted",
    "hints used": session.hintsUsed,
    "cross-exam probes": (session.probesAsked as string[]).length,
    "barge-ins (interviewer interrupted)": session.transcript.filter((t) => t.interrupted).length,
  };

  const { model, id } = agentModel();
  const { object } = await generateObject({
    model,
    schema: EvaluationSchema,
    schemaName: "Evaluation",
    system: CRITIC_SYSTEM,
    prompt: criticUserPrompt({
      question: toQuestionBrief(session.question),
      targetLevel: session.user.targetLevel,
      language: LANGUAGES[session.language].label,
      transcript,
      snapshots,
      runs: runsText,
      finalCode,
      metrics,
    }),
    temperature: 0.2,
    maxTokens: 6000,
  });

  const evaluation = applyPolicy(object, submitResult, finalCode);
  const d = evaluation.dimensions;
  const overall =
    (d.codeCorrectness.score + d.algorithmicComplexity.score + d.edgeCaseHandling.score + d.communicationClarity.score + d.speed.score) / 5;

  const report = await prisma.evaluationReport
    .create({
    data: {
      sessionId,
      verdict: evaluation.verdict,
      overallScore: Math.round(overall * 10) / 10,
      codeCorrectness: d.codeCorrectness.score,
      complexity: d.algorithmicComplexity.score,
      edgeCases: d.edgeCaseHandling.score,
      communication: d.communicationClarity.score,
      speed: d.speed.score,
      payload: { ...evaluation, finalCode, language: session.language, promptVersion: PROMPT_VERSION, metrics },
      model: id,
    },
  })
    .catch(async (err: { code?: string }) => {
      // Two evaluators raced (gateway + HTTP fallback): keep the first report.
      if (err.code === "P2002") return prisma.evaluationReport.findUniqueOrThrow({ where: { sessionId } });
      throw err;
    });
  await prisma.interviewSession.update({ where: { id: sessionId }, data: { status: "EVALUATED", phase: "COMPLETED" } });
  return report;
}

/** Deterministic guardrails layered on top of the model's judgment. */
function applyPolicy(e: Evaluation, submit: RunSummary | null, finalCode: string): Evaluation {
  const lineCount = Math.max(1, finalCode.split("\n").length);
  const out: Evaluation = {
    ...e,
    // Drop annotations pointing outside the final file (models occasionally cite stale lines).
    lineAnnotations: e.lineAnnotations
      .filter((a) => a.line <= lineCount)
      .map((a) => ({ ...a, endLine: a.endLine && a.endLine >= a.line && a.endLine <= lineCount ? a.endLine : null })),
  };
  const passRate = submit && submit.total > 0 ? submit.passed / submit.total : null;
  if (passRate !== null && passRate < 0.5) {
    const cap = VERDICT_ORDER.indexOf("LEAN_NO_HIRE");
    if (VERDICT_ORDER.indexOf(out.verdict) > cap) out.verdict = "LEAN_NO_HIRE";
    out.dimensions.codeCorrectness.score = Math.min(out.dimensions.codeCorrectness.score, 4);
  }
  if (!finalCode.trim()) {
    out.verdict = "NO_HIRE";
    out.dimensions.codeCorrectness.score = 0;
  }
  return out;
}
