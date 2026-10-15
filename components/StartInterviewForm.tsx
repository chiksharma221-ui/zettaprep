"use client";

import { useFormStatus } from "react-dom";
import { Loader2, Mic } from "lucide-react";
import { createInterviewSession } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { LANGUAGES, LANGUAGE_KEYS } from "@/lib/languages";

interface Props {
  questions: { slug: string; title: string; difficulty: string; topics: string[] }[];
  defaultName: string;
}

const field = "w-full rounded-md border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-signal/60";
const label = "mb-1.5 block font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
      Enter the interview room
    </Button>
  );
}

export function StartInterviewForm({ questions, defaultName }: Props) {
  return (
    <form action={createInterviewSession} className="rounded-xl border border-ink-800 bg-ink-900/80 p-6 shadow-2xl shadow-black/40">
      <p className="font-display text-3xl italic text-ink-100">New session</p>
      <p className="mt-1 text-sm text-ink-400">~40 minutes · microphone required · headphones recommended</p>

      <div className="mt-6 space-y-4">
        <div>
          <label className={label} htmlFor="name">Your name</label>
          <input id="name" name="name" defaultValue={defaultName} placeholder="How the interviewer should address you" className={field} />
        </div>
        <div>
          <label className={label} htmlFor="questionSlug">Problem</label>
          <select id="questionSlug" name="questionSlug" className={field} defaultValue="random">
            <option value="random">Surprise me (recommended — like a real interview)</option>
            {questions.map((q) => (
              <option key={q.slug} value={q.slug}>
                {q.title} · {q.difficulty.toLowerCase()}
              </option>
            ))}
          </select>
          {questions.length === 0 && <p className="mt-1.5 text-xs text-probe">No questions found — run `npm run db:seed`.</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="language">Language</label>
            <select id="language" name="language" className={field} defaultValue="PYTHON">
              {LANGUAGE_KEYS.map((k) => (
                <option key={k} value={k}>{LANGUAGES[k].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="targetLevel">Target level</label>
            <select id="targetLevel" name="targetLevel" className={field} defaultValue="SDE-2">
              {["SDE-1", "SDE-2", "Senior", "Staff"].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="mt-6">
        <Submit />
      </div>
    </form>
  );
}
