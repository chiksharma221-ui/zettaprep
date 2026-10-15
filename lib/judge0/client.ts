import { env } from "@/lib/env";
import { LANGUAGES, type LanguageKey } from "@/lib/languages";
import type { CaseResult, CaseStatus, RunSummary, TestCase } from "./types";

/**
 * Judge0 CE client using the batch API: one HTTP call to enqueue every test case, then polling
 * until all finish. Output comparison happens here (not via Judge0's expected_output) so hidden
 * expectations are never echoed back in any response the client could see.
 */

interface Judge0Submission {
  token: string;
  status: { id: number; description: string };
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  time: string | null;
  memory: number | null;
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const unb64 = (s: string | null) => (s ? Buffer.from(s, "base64").toString("utf8") : "");

function headers(): Record<string, string> {
  const e = env();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (e.JUDGE0_API_KEY) {
    h["X-RapidAPI-Key"] = e.JUDGE0_API_KEY;
    if (e.JUDGE0_API_HOST) h["X-RapidAPI-Host"] = e.JUDGE0_API_HOST;
  }
  return h;
}

/** Whitespace-tolerant comparison: trailing spaces per line and trailing blank lines ignored. */
export function outputsMatch(actual: string, expected: string): boolean {
  const norm = (s: string) =>
    s
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((l) => l.trimEnd())
      .join("\n")
      .trimEnd();
  return norm(actual) === norm(expected);
}

function mapStatus(id: number): CaseStatus {
  if (id === 3 || id === 4) return "PASSED"; // refined by our own comparison below
  if (id === 5) return "TIME_LIMIT";
  if (id === 6) return "COMPILE_ERROR";
  if (id >= 7 && id <= 12) return "RUNTIME_ERROR";
  return "INTERNAL_ERROR";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runAgainstTests(args: {
  language: LanguageKey;
  code: string;
  visible: TestCase[];
  hidden?: TestCase[];
  mode: RunSummary["mode"];
}): Promise<RunSummary> {
  const e = env();
  const cases = [
    ...args.visible.map((t, i) => ({ ...t, hidden: false, label: t.label ?? `Example ${i + 1}` })),
    ...(args.hidden ?? []).map((t, i) => ({ ...t, hidden: true, label: t.label ?? `Hidden ${i + 1}` })),
  ];
  if (cases.length === 0) throw new Error("No test cases supplied");
  if (args.code.length > 64_000) throw new Error("Source too large (64KB max)");

  const languageId = LANGUAGES[args.language].judge0Id;
  const createRes = await fetch(`${e.JUDGE0_URL}/submissions/batch?base64_encoded=true`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      submissions: cases.map((c) => ({
        language_id: languageId,
        source_code: b64(args.code),
        stdin: b64(c.input),
        cpu_time_limit: 2,
        wall_time_limit: 5,
        memory_limit: 256_000,
        enable_network: false,
        // GCC 9.2 defaults to gnu++14; candidates expect modern C++.
        ...(args.language === "CPP" ? { compiler_options: "-std=c++17 -O2" } : {}),
      })),
    }),
  });
  if (!createRes.ok) throw new Error(`Judge0 enqueue failed: ${createRes.status} ${await createRes.text()}`);
  const created = (await createRes.json()) as { token?: string; error?: string }[];
  const tokens = created.map((c) => {
    if (!c.token) throw new Error(`Judge0 rejected submission: ${c.error ?? "unknown"}`);
    return c.token;
  });

  // Poll with backoff, capped at ~20s total.
  const fields = "token,status,stdout,stderr,compile_output,message,time,memory";
  let subs: Judge0Submission[] = [];
  const deadline = Date.now() + 20_000;
  let delay = 400;
  while (Date.now() < deadline) {
    await sleep(delay);
    const res = await fetch(
      `${e.JUDGE0_URL}/submissions/batch?tokens=${tokens.join(",")}&base64_encoded=true&fields=${fields}`,
      { headers: headers() },
    );
    if (!res.ok) throw new Error(`Judge0 poll failed: ${res.status}`);
    subs = ((await res.json()) as { submissions: Judge0Submission[] }).submissions;
    if (subs.every((s) => s.status.id > 2)) break;
    delay = Math.min(delay * 1.5, 1500);
  }
  if (!subs.length || subs.some((s) => s.status.id <= 2)) throw new Error("Judge0 timed out while executing tests");

  let compileOutput: string | null = null;
  const results: CaseResult[] = subs.map((s, i) => {
    const c = cases[i];
    const stdout = unb64(s.stdout);
    const stderr = unb64(s.stderr) || unb64(s.message);
    let status = mapStatus(s.status.id);
    if (status === "COMPILE_ERROR") compileOutput = unb64(s.compile_output);
    if (status === "PASSED" && !outputsMatch(stdout, c.expected)) status = "WRONG_ANSWER";
    if (status === "RUNTIME_ERROR" && /memory/i.test(stderr)) status = "MEMORY_LIMIT";
    const passed = status === "PASSED";
    const base: CaseResult = {
      label: c.label,
      hidden: c.hidden,
      passed,
      status,
      timeMs: s.time ? Math.round(parseFloat(s.time) * 1000) : null,
      memoryKb: s.memory,
    };
    return c.hidden
      ? base
      : { ...base, input: c.input, expected: c.expected, stdout: stdout.slice(0, 4000), stderr: stderr.slice(0, 4000) };
  });

  const times = results.map((r) => r.timeMs ?? 0);
  const mems = results.map((r) => r.memoryKb ?? 0);
  return {
    mode: args.mode,
    passed: results.filter((r) => r.passed).length,
    total: results.length,
    compileOutput,
    results,
    maxTimeMs: times.length ? Math.max(...times) : null,
    maxMemoryKb: mems.length ? Math.max(...mems) : null,
  };
}
