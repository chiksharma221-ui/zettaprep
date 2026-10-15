/**
 * Interview phase state machine.
 *
 *   INTRO ─▶ QUESTION_PROPOSAL ─▶ CODING_AND_PROBING ─▶ OPTIMIZATION_CROSS_EXAM ─▶ DEBRIEF ─▶ COMPLETED
 *                                        ▲   │                     │
 *                                        │   └──── (time-out) ─────┼──────────────▶ DEBRIEF
 *                                        └──── (re-implement) ─────┘
 *
 * The machine is pure (no I/O) so it can run identically in the gateway, in route handlers
 * and in unit tests. The gateway owns the live instance and persists every transition.
 */

export const PHASES = [
  "INTRO",
  "QUESTION_PROPOSAL",
  "CODING_AND_PROBING",
  "OPTIMIZATION_CROSS_EXAM",
  "DEBRIEF",
  "COMPLETED",
] as const;

export type Phase = (typeof PHASES)[number];

export type TransitionActor = "LEAD_AGENT" | "CANDIDATE" | "SYSTEM";

export interface PhaseContext {
  phase: Phase;
  sessionStartedAt: number;
  phaseEnteredAt: number;
  /** Number of candidate utterances in the current phase. */
  candidateTurnsInPhase: number;
  /** Best visible-test result so far. */
  visibleTestsPassed: boolean;
  /** Whether a hidden-test submission has been made. */
  submitted: boolean;
  /** Number of Cross-Examiner probes delivered in the current phase. */
  probesInPhase: number;
  /** Timebox warnings already emitted, keyed by phase. */
  timeboxWarned: Partial<Record<Phase, boolean>>;
}

export interface TransitionRecord {
  from: Phase;
  to: Phase;
  at: number;
  actor: TransitionActor;
  reason: string;
}

export type TransitionResult =
  | { ok: true; context: PhaseContext; record: TransitionRecord }
  | { ok: false; error: string };

/** Soft time budgets per phase (ms). Exceeding them produces a nudge, never a hard cut. */
export const TIMEBOX_MS: Record<Phase, number> = {
  INTRO: 2 * 60_000,
  QUESTION_PROPOSAL: 5 * 60_000,
  CODING_AND_PROBING: 25 * 60_000,
  OPTIMIZATION_CROSS_EXAM: 8 * 60_000,
  DEBRIEF: 4 * 60_000,
  COMPLETED: Number.POSITIVE_INFINITY,
};

/** Legal edges. Anything else is rejected, regardless of who asks. */
const EDGES: Record<Phase, Phase[]> = {
  INTRO: ["QUESTION_PROPOSAL", "COMPLETED"],
  QUESTION_PROPOSAL: ["CODING_AND_PROBING", "COMPLETED"],
  CODING_AND_PROBING: ["OPTIMIZATION_CROSS_EXAM", "DEBRIEF", "COMPLETED"],
  OPTIMIZATION_CROSS_EXAM: ["CODING_AND_PROBING", "DEBRIEF", "COMPLETED"],
  DEBRIEF: ["COMPLETED"],
  COMPLETED: [],
};

export function initialContext(now: number): PhaseContext {
  return {
    phase: "INTRO",
    sessionStartedAt: now,
    phaseEnteredAt: now,
    candidateTurnsInPhase: 0,
    visibleTestsPassed: false,
    submitted: false,
    probesInPhase: 0,
    timeboxWarned: {},
  };
}

export function canTransition(from: Phase, to: Phase): boolean {
  return EDGES[from].includes(to);
}

/**
 * Guard conditions. The Lead Interviewer can only move forward once the candidate has
 * actually done the work of the current phase, or once its timebox has run out. The
 * candidate (ending the interview) and the system (timeouts) bypass guards.
 */
function guard(ctx: PhaseContext, to: Phase, now: number): string | null {
  const inPhase = now - ctx.phaseEnteredAt;
  const timedOut = inPhase >= TIMEBOX_MS[ctx.phase];
  if (to === "COMPLETED") return null;

  switch (`${ctx.phase}->${to}`) {
    case "INTRO->QUESTION_PROPOSAL":
      return ctx.candidateTurnsInPhase >= 1 || timedOut
        ? null
        : "Let the candidate introduce themselves before presenting the problem.";
    case "QUESTION_PROPOSAL->CODING_AND_PROBING":
      return ctx.candidateTurnsInPhase >= 2 || timedOut
        ? null
        : "The candidate has not yet articulated an approach and its complexity. Ask them to before coding.";
    case "CODING_AND_PROBING->OPTIMIZATION_CROSS_EXAM":
      return ctx.visibleTestsPassed || ctx.submitted || timedOut
        ? null
        : "No passing run yet. Let the candidate get a working solution (or run out the coding timebox) first.";
    case "CODING_AND_PROBING->DEBRIEF":
      return timedOut ? null : "Only move from coding straight to debrief when the coding timebox is exhausted.";
    case "OPTIMIZATION_CROSS_EXAM->CODING_AND_PROBING":
      return null; // candidate wants to re-implement a better approach
    case "OPTIMIZATION_CROSS_EXAM->DEBRIEF":
      return ctx.probesInPhase >= 1 || ctx.candidateTurnsInPhase >= 2 || timedOut
        ? null
        : "Ask at least one optimization or trade-off question before debriefing.";
    case "DEBRIEF->COMPLETED":
      return null;
    default:
      return null;
  }
}

export function transition(
  ctx: PhaseContext,
  to: Phase,
  actor: TransitionActor,
  reason: string,
  now: number = Date.now(),
): TransitionResult {
  if (!canTransition(ctx.phase, to)) {
    return { ok: false, error: `Illegal transition ${ctx.phase} -> ${to}. Allowed: ${EDGES[ctx.phase].join(", ") || "none"}.` };
  }
  if (actor === "LEAD_AGENT") {
    const blocked = guard(ctx, to, now);
    if (blocked) return { ok: false, error: blocked };
  }
  const record: TransitionRecord = { from: ctx.phase, to, at: now, actor, reason };
  return {
    ok: true,
    record,
    context: {
      ...ctx,
      phase: to,
      phaseEnteredAt: now,
      candidateTurnsInPhase: 0,
      probesInPhase: 0,
    },
  };
}

export type PhaseEvent =
  | { type: "CANDIDATE_TURN" }
  | { type: "PROBE_DELIVERED" }
  | { type: "TESTS_RUN"; allVisiblePassed: boolean }
  | { type: "SUBMITTED" };

export function reduce(ctx: PhaseContext, event: PhaseEvent): PhaseContext {
  switch (event.type) {
    case "CANDIDATE_TURN":
      return { ...ctx, candidateTurnsInPhase: ctx.candidateTurnsInPhase + 1 };
    case "PROBE_DELIVERED":
      return { ...ctx, probesInPhase: ctx.probesInPhase + 1 };
    case "TESTS_RUN":
      return { ...ctx, visibleTestsPassed: ctx.visibleTestsPassed || event.allVisiblePassed };
    case "SUBMITTED":
      return { ...ctx, submitted: true };
  }
}

/**
 * Called on a timer by the gateway. Returns a one-shot nudge for the Lead Interviewer when the
 * current phase overruns its timebox.
 */
export function checkTimebox(ctx: PhaseContext, now: number): { context: PhaseContext; nudge: string | null } {
  if (ctx.phase === "COMPLETED" || ctx.timeboxWarned[ctx.phase]) return { context: ctx, nudge: null };
  if (now - ctx.phaseEnteredAt < TIMEBOX_MS[ctx.phase]) return { context: ctx, nudge: null };
  const next = EDGES[ctx.phase].find((p) => p !== "COMPLETED");
  const nudge = next
    ? `Timebox for ${ctx.phase} exceeded. Wrap up this phase briefly and call advance_phase to ${next}.`
    : null;
  return { context: { ...ctx, timeboxWarned: { ...ctx.timeboxWarned, [ctx.phase]: true } }, nudge };
}

/** The Cross-Examiner only watches code while the candidate is actually coding/optimizing. */
export function crossExaminerActive(phase: Phase): boolean {
  return phase === "CODING_AND_PROBING" || phase === "OPTIMIZATION_CROSS_EXAM";
}

export const PHASE_LABEL: Record<Phase, string> = {
  INTRO: "Intro",
  QUESTION_PROPOSAL: "Problem & approach",
  CODING_AND_PROBING: "Coding",
  OPTIMIZATION_CROSS_EXAM: "Optimization",
  DEBRIEF: "Debrief",
  COMPLETED: "Completed",
};

export function allowedNext(phase: Phase): Phase[] {
  return [...EDGES[phase]];
}
