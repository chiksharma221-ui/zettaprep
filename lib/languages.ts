import type { Language } from "@prisma/client";

export type LanguageKey = Language;

export interface LanguageMeta {
  key: LanguageKey;
  label: string;
  monaco: string;
  /** Judge0 CE language ids. */
  judge0Id: number;
}

// Judge0 CE ids: 71 Python 3.8, 54 C++ (GCC 9.2), 62 Java (OpenJDK 13), 63 JavaScript (Node 12).
export const LANGUAGES: Record<LanguageKey, LanguageMeta> = {
  PYTHON: { key: "PYTHON", label: "Python 3", monaco: "python", judge0Id: 71 },
  CPP: { key: "CPP", label: "C++17", monaco: "cpp", judge0Id: 54 },
  JAVA: { key: "JAVA", label: "Java", monaco: "java", judge0Id: 62 },
  JAVASCRIPT: { key: "JAVASCRIPT", label: "JavaScript", monaco: "javascript", judge0Id: 63 },
};

export const LANGUAGE_KEYS = Object.keys(LANGUAGES) as LanguageKey[];
