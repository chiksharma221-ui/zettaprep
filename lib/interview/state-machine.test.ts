import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTimebox, initialContext, reduce, transition, TIMEBOX_MS, type PhaseContext } from "./state-machine";

test("rejects illegal edges for every actor", () => {
  const ctx = initialContext(0);
  const r = transition(ctx, "DEBRIEF", "SYSTEM", "skip", 1);
  assert.equal(r.ok, false);
});

test("lead agent is blocked from leaving INTRO before the candidate speaks", () => {
  const ctx = initialContext(0);
  const blocked = transition(ctx, "QUESTION_PROPOSAL", "LEAD_AGENT", "go", 1000);
  assert.equal(blocked.ok, false);
  const spoken = reduce(ctx, { type: "CANDIDATE_TURN" });
  const ok = transition(spoken, "QUESTION_PROPOSAL", "LEAD_AGENT", "go", 1000);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.context.phase, "QUESTION_PROPOSAL");
    assert.equal(ok.context.candidateTurnsInPhase, 0);
  }
});

test("coding -> optimization requires a passing run or timeout", () => {
  let ctx: PhaseContext = { ...initialContext(0), phase: "CODING_AND_PROBING" };
  assert.equal(transition(ctx, "OPTIMIZATION_CROSS_EXAM", "LEAD_AGENT", "x", 10).ok, false);
  ctx = reduce(ctx, { type: "TESTS_RUN", allVisiblePassed: true });
  assert.equal(transition(ctx, "OPTIMIZATION_CROSS_EXAM", "LEAD_AGENT", "x", 10).ok, true);
  const timedOut = { ...initialContext(0), phase: "CODING_AND_PROBING" as const };
  assert.equal(transition(timedOut, "OPTIMIZATION_CROSS_EXAM", "LEAD_AGENT", "x", TIMEBOX_MS.CODING_AND_PROBING).ok, true);
});

test("candidate can always end the interview", () => {
  const ctx = initialContext(0);
  assert.equal(transition(ctx, "COMPLETED", "CANDIDATE", "ended", 1).ok, true);
});

test("timebox nudge fires once per phase", () => {
  const ctx = initialContext(0);
  const first = checkTimebox(ctx, TIMEBOX_MS.INTRO + 1);
  assert.ok(first.nudge);
  const second = checkTimebox(first.context, TIMEBOX_MS.INTRO + 5000);
  assert.equal(second.nudge, null);
});
