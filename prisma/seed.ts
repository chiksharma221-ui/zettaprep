/**
 * Seeds the coding question bank (with visible + hidden test suites).
 * Run: npm run db:seed      (idempotent — upserts by slug)
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, type Difficulty } from "@prisma/client";

const prisma = new PrismaClient();

interface SeedQuestion {
  slug: string;
  title: string;
  difficulty: Difficulty;
  topics: string[];
  prompt: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  referenceNotes: string;
  optimalTime: string;
  optimalSpace: string;
  starterCode: Record<string, string>;
  visibleTests: { input: string; expected: string; label?: string }[];
  hiddenTests: { input: string; expected: string; label?: string }[];
}

async function main() {
  const questions = JSON.parse(readFileSync(join(__dirname, "seed-data", "questions.json"), "utf8")) as SeedQuestion[];
  for (const q of questions) {
    const data = {
      title: q.title,
      difficulty: q.difficulty,
      topics: q.topics,
      prompt: q.prompt,
      inputFormat: q.inputFormat,
      outputFormat: q.outputFormat,
      constraints: q.constraints,
      referenceNotes: q.referenceNotes,
      optimalTime: q.optimalTime,
      optimalSpace: q.optimalSpace,
      starterCode: q.starterCode,
      visibleTests: q.visibleTests,
      hiddenTests: q.hiddenTests,
    };
    await prisma.question.upsert({ where: { slug: q.slug }, create: { slug: q.slug, ...data }, update: data });
    console.log(`  ✓ ${q.slug} (${q.visibleTests.length} visible / ${q.hiddenTests.length} hidden tests)`);
  }
  console.log(`Seeded ${questions.length} questions.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
