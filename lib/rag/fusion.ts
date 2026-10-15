export interface RankedList {
  name: string;
  weight: number;
  results: string[]; // ids, best first
}

export interface FusedHit {
  id: string;
  score: number;
  ranks: Record<string, number | undefined>;
}

/**
 * Weighted Reciprocal Rank Fusion (Cormack et al., 2009): score(d) = Σ w_i / (k + rank_i(d)).
 * Rank-based fusion avoids having to calibrate BM25 scores against cosine similarities.
 */
export function reciprocalRankFusion(lists: RankedList[], k = 60): FusedHit[] {
  const acc = new Map<string, FusedHit>();
  for (const list of lists) {
    list.results.forEach((id, i) => {
      const hit = acc.get(id) ?? { id, score: 0, ranks: {} };
      hit.score += list.weight / (k + i + 1);
      hit.ranks[list.name] = i + 1;
      acc.set(id, hit);
    });
  }
  return [...acc.values()].sort((a, b) => b.score - a.score);
}
