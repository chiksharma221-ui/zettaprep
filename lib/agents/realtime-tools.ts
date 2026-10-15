import { z } from "zod";

/**
 * Function-calling definitions exposed to the Lead Interviewer inside the OpenAI Realtime
 * session. Realtime tools take raw JSON Schema, so we declare Zod schemas (used to validate the
 * model's arguments in the gateway) alongside their JSON Schema form.
 */

export const AdvancePhaseArgs = z.object({
  to: z.enum(["QUESTION_PROPOSAL", "CODING_AND_PROBING", "OPTIMIZATION_CROSS_EXAM", "DEBRIEF"]),
  reason: z.string().min(3).max(300),
});

export const GetHintArgs = z.object({
  level: z.enum(["nudge", "directional", "concrete"]).optional(),
  reason: z.string().max(200).optional(),
});

export const LookupFundamentalsArgs = z.object({
  query: z.string().min(3).max(200),
  domain: z.enum(["os", "dbms", "networks", "dsa", "distributed"]).optional(),
});

export const EndInterviewArgs = z.object({
  reason: z.string().max(200),
});

export const REALTIME_TOOLS = [
  {
    type: "function",
    name: "advance_phase",
    description:
      "Move the interview to the next phase once the current phase's goal is met. Returns ok or an error explaining what is still missing.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", enum: ["QUESTION_PROPOSAL", "CODING_AND_PROBING", "OPTIMIZATION_CROSS_EXAM", "DEBRIEF"] },
        reason: { type: "string", description: "Why the phase goal is met, e.g. 'candidate stated O(n) deque approach'." },
      },
      required: ["to", "reason"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_hint",
    description: "Generate a graduated hint (never code) when the candidate is stuck or asks for help. Paraphrase the result aloud.",
    parameters: {
      type: "object",
      properties: {
        level: { type: "string", enum: ["nudge", "directional", "concrete"] },
        reason: { type: "string" },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "lookup_fundamentals",
    description:
      "Hybrid search over vetted OS / DBMS / networking / DSA / distributed-systems notes, to ground a scenario-based follow-up question.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        domain: { type: "string", enum: ["os", "dbms", "networks", "dsa", "distributed"] },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "end_interview",
    description: "End the interview after the debrief, or if the candidate asks to stop.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
] as const;
