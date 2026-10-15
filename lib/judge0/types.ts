export interface TestCase {
  input: string;
  expected: string;
  label?: string;
}

export type CaseStatus =
  | "PASSED"
  | "WRONG_ANSWER"
  | "COMPILE_ERROR"
  | "RUNTIME_ERROR"
  | "TIME_LIMIT"
  | "MEMORY_LIMIT"
  | "INTERNAL_ERROR";

export interface CaseResult {
  label: string;
  hidden: boolean;
  passed: boolean;
  status: CaseStatus;
  /** Only populated for visible cases — hidden I/O never leaves the server. */
  input?: string;
  expected?: string;
  stdout?: string;
  stderr?: string;
  timeMs: number | null;
  memoryKb: number | null;
}

export interface RunSummary {
  mode: "RUN" | "SUBMIT" | "CUSTOM";
  passed: number;
  total: number;
  compileOutput: string | null;
  results: CaseResult[];
  maxTimeMs: number | null;
  maxMemoryKb: number | null;
}
