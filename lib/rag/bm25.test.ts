import { test } from "node:test";
import assert from "node:assert/strict";
import { BM25Index } from "./bm25";
import { reciprocalRankFusion } from "./fusion";

test("bm25 ranks the topical document first", () => {
  const idx = new BM25Index([
    { id: "a", text: "B-tree indexes keep keys sorted and balanced across pages" },
    { id: "b", text: "TCP congestion control uses slow start and AIMD" },
    { id: "c", text: "Virtual memory pages are mapped by the page table and TLB" },
  ]);
  assert.equal(idx.search("how does a b-tree index work", 3)[0].id, "a");
  assert.equal(idx.search("tcp slow start", 3)[0].id, "b");
});

test("rrf rewards agreement between retrievers", () => {
  const fused = reciprocalRankFusion([
    { name: "sparse", weight: 1, results: ["x", "y", "z"] },
    { name: "dense", weight: 1, results: ["y", "x", "w"] },
  ]);
  assert.deepEqual(fused.slice(0, 2).map((f) => f.id).sort(), ["x", "y"]);
  assert.equal(fused.find((f) => f.id === "w")!.ranks.sparse, undefined);
});
