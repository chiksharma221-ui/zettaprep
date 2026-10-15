import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-[calc(100vh-3rem)] place-items-center grid-backdrop">
      <div className="text-center">
        <p className="font-display text-6xl italic text-ink-100">404</p>
        <p className="mt-2 text-ink-400">That session or page doesn’t exist — or isn’t yours.</p>
        <Link href="/" className="mt-6 inline-block text-signal hover:underline">Back to interviews</Link>
      </div>
    </main>
  );
}
