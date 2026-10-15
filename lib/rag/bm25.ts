/**
 * Okapi BM25 sparse retriever. The corpus (a few thousand chunks) fits comfortably in memory,
 * so we build an inverted index in-process and refresh it on a TTL.
 */

const STOPWORDS = new Set(
  "a an and are as at be but by for from has have how if in into is it its of on or that the their then there these this to was what when where which while who why will with you your does do can".split(" "),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

/** Tiny suffix stemmer — enough to fold "indexes/indexing/indexed" together. */
function stem(w: string): string {
  if (w.length <= 4) return w;
  for (const suf of ["ations", "ation", "ings", "ing", "ies", "ed", "es", "s"]) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) return suf === "ies" ? w.slice(0, -3) + "y" : w.slice(0, -suf.length);
  }
  return w;
}

export interface BM25Doc {
  id: string;
  text: string;
}

export class BM25Index {
  private readonly k1: number;
  private readonly b: number;
  private postings = new Map<string, Map<number, number>>(); // term -> (docIdx -> tf)
  private docLen: number[] = [];
  private ids: string[] = [];
  private avgLen = 0;

  constructor(docs: BM25Doc[], opts: { k1?: number; b?: number } = {}) {
    this.k1 = opts.k1 ?? 1.2;
    this.b = opts.b ?? 0.75;
    docs.forEach((d, idx) => {
      const toks = tokenize(d.text);
      this.ids.push(d.id);
      this.docLen.push(toks.length);
      const tf = new Map<string, number>();
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const [t, f] of tf) {
        let p = this.postings.get(t);
        if (!p) this.postings.set(t, (p = new Map()));
        p.set(idx, f);
      }
    });
    this.avgLen = this.docLen.reduce((a, b) => a + b, 0) / Math.max(1, this.docLen.length);
  }

  get size() {
    return this.ids.length;
  }

  search(query: string, k: number, allow?: (id: string) => boolean): { id: string; score: number }[] {
    const N = this.ids.length;
    const scores = new Map<number, number>();
    for (const term of new Set(tokenize(query))) {
      const p = this.postings.get(term);
      if (!p) continue;
      const idf = Math.log(1 + (N - p.size + 0.5) / (p.size + 0.5));
      for (const [idx, tf] of p) {
        const norm = tf + this.k1 * (1 - this.b + (this.b * this.docLen[idx]) / this.avgLen);
        scores.set(idx, (scores.get(idx) ?? 0) + idf * ((tf * (this.k1 + 1)) / norm));
      }
    }
    return [...scores.entries()]
      .map(([idx, score]) => ({ id: this.ids[idx], score }))
      .filter((r) => !allow || allow(r.id))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
