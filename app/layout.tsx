import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "InterviewAI Studio",
  description: "Voice-first, multi-agent technical interview simulator with live cross-examination.",
};

export const viewport: Viewport = { themeColor: "#07080c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen">
        <header className="sticky top-0 z-40 border-b border-ink-800/80 bg-ink-950/80 backdrop-blur">
          <div className="mx-auto flex h-12 max-w-[1600px] items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-[6px] bg-signal text-[11px] font-bold text-ink-950">AI</span>
              <span className="font-display text-xl italic leading-none">InterviewAI</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-400">Studio</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm text-ink-300">
              <Link className="rounded-md px-3 py-1.5 hover:bg-ink-850 hover:text-ink-100" href="/">
                Interviews
              </Link>
              <Link className="rounded-md px-3 py-1.5 hover:bg-ink-850 hover:text-ink-100" href="/arena">
                Fundamentals Arena
              </Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
