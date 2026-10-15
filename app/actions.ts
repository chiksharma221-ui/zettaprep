"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/user";

const CreateSessionInput = z.object({
  questionSlug: z.string().min(1),
  language: z.enum(["PYTHON", "CPP", "JAVA", "JAVASCRIPT"]),
  name: z.string().trim().max(60).optional(),
  targetLevel: z.enum(["SDE-1", "SDE-2", "Senior", "Staff"]),
});

export async function createInterviewSession(formData: FormData) {
  const input = CreateSessionInput.parse({
    questionSlug: formData.get("questionSlug"),
    language: formData.get("language"),
    name: formData.get("name") || undefined,
    targetLevel: formData.get("targetLevel"),
  });

  const user = await currentUser({ create: true, name: input.name, targetLevel: input.targetLevel });
  const question =
    input.questionSlug === "random"
      ? await randomQuestion()
      : await prisma.question.findUniqueOrThrow({ where: { slug: input.questionSlug }, select: { id: true } });

  const session = await prisma.interviewSession.create({
    data: { userId: user.id, questionId: question.id, language: input.language },
    select: { id: true },
  });
  redirect(`/interview/${session.id}`);
}

async function randomQuestion() {
  const count = await prisma.question.count();
  if (count === 0) throw new Error("No questions seeded. Run `npm run db:seed`.");
  const [q] = await prisma.question.findMany({ select: { id: true }, skip: Math.floor(Math.random() * count), take: 1 });
  return q;
}
