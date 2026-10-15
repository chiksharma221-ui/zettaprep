import type { Domain } from "@/lib/rag/hybrid";

export interface Flashcard {
  id: string;
  front: string;
  back: string;
}

export interface Deck {
  slug: string;
  title: string;
  domain: Domain;
  blurb: string;
  /** Topic string passed to the RAG scenario generator for "Deep dive". */
  deepDiveTopic: string;
  cards: Flashcard[];
}

export const DECKS: Deck[] = [
  {
    slug: "memory-management",
    title: "Memory Management",
    domain: "os",
    blurb: "Paging, TLBs, faults, allocators, the OOM killer.",
    deepDiveTopic: "virtual memory, page faults, TLB and memory allocation in production services",
    cards: [
      { id: "mm1", front: "Why does a TLB miss matter if the page is already in RAM?", back: "A miss forces a page-table walk — up to 4 dependent memory loads on x86-64 — before the real access. Huge pages cut misses by covering 2 MiB per entry." },
      { id: "mm2", front: "Minor vs major page fault?", back: "Minor: page is in memory but not mapped for this process (shared lib, COW). Major: requires disk I/O (swap or evicted file-backed page) — milliseconds, not microseconds." },
      { id: "mm3", front: "Why can Redis's memory nearly double during BGSAVE?", back: "fork() shares pages copy-on-write; every page the parent writes during the snapshot gets copied. Write-heavy load ⇒ most pages duplicated." },
      { id: "mm4", front: "RSS keeps growing but the live heap is flat. Likely cause?", back: "Allocator fragmentation / memory not returned to the OS (glibc arenas). jemalloc/tcmalloc with decay-based purging or reducing arena count helps." },
      { id: "mm5", front: "Why does recursive DFS crash on a 100k-node path graph?", back: "Stack depth is O(h) = O(n) on skewed input; thread stacks are 1–8 MiB. Use an explicit heap-allocated stack." },
      { id: "mm6", front: "How does a container OOM differ from a host OOM?", back: "The cgroup memory limit triggers the cgroup OOM killer, which only considers processes inside that cgroup — the host may have plenty of free memory." },
    ],
  },
  {
    slug: "threading",
    title: "Threading & Concurrency",
    domain: "os",
    blurb: "Locks, deadlock, memory models, false sharing.",
    deepDiveTopic: "threads, locks, deadlock, memory ordering and false sharing",
    cards: [
      { id: "th1", front: "Name the four Coffman conditions.", back: "Mutual exclusion, hold-and-wait, no preemption, circular wait. Global lock ordering breaks circular wait." },
      { id: "th2", front: "Why must condition-variable waits be in a loop?", back: "Spurious wakeups and stolen wakeups: another thread may consume the state change before you reacquire the mutex. Always re-check the predicate." },
      { id: "th3", front: "What is false sharing?", back: "Threads writing different variables on the same 64-byte cache line force the line to bounce between cores. Pad or use per-core counters." },
      { id: "th4", front: "Why is naive double-checked locking broken?", back: "Without acquire/release ordering, another thread can observe the reference before the object's constructor writes are visible. Use volatile/atomics." },
      { id: "th5", front: "When is a spinlock better than a mutex?", back: "Only when the critical section is shorter than a context switch and the holder can't be preempted (e.g. kernel with interrupts disabled)." },
      { id: "th6", front: "What is priority inversion and its fix?", back: "Low-priority task holds a lock a high-priority task needs while a medium task preempts it. Priority inheritance temporarily boosts the holder." },
    ],
  },
  {
    slug: "indexes",
    title: "Database Indexes",
    domain: "dbms",
    blurb: "Composite indexes, covering scans, selectivity.",
    deepDiveTopic: "database index design, composite indexes and query planning",
    cards: [
      { id: "ix1", front: "Index on (a, b, c). Which predicates can use it?", back: "Leftmost prefixes: a; a,b; a,b,c. A range on b stops c from being used for filtering/ordering." },
      { id: "ix2", front: "Why might Postgres ignore an index on a boolean column?", back: "Low selectivity: fetching half the table via random heap reads is slower than a sequential scan. A partial index on the rare value works." },
      { id: "ix3", front: "What makes an index-only scan actually index-only in Postgres?", back: "All needed columns in the index AND the page marked all-visible in the visibility map (maintained by VACUUM); otherwise heap fetches still happen." },
      { id: "ix4", front: "Why do UUIDv4 primary keys hurt write performance?", back: "Random inserts hit every leaf ⇒ page splits, ~50–70% fill, working set ≫ RAM. Time-ordered UUIDv7/ULID restores locality." },
      { id: "ix5", front: "Secondary index lookup cost in InnoDB?", back: "Two B+tree traversals: secondary index → primary key → clustered index row. Wide PKs bloat every secondary index." },
      { id: "ix6", front: "A query became slow right after a bulk load. First check?", back: "Stale statistics — run ANALYZE. The planner may be choosing a nested loop based on old row estimates." },
    ],
  },
  {
    slug: "b-trees",
    title: "B-Trees & Storage Engines",
    domain: "dbms",
    blurb: "B+trees vs LSM trees, WAL, MVCC.",
    deepDiveTopic: "B+tree vs LSM tree storage engines, write-ahead logging and MVCC",
    cards: [
      { id: "bt1", front: "Why do B+trees stay 3–4 levels deep for a billion rows?", back: "Fan-out of hundreds per 8–16 KiB page: 500³ ≈ 1.25×10⁸, 500⁴ ≈ 6×10¹⁰. Top levels stay cached ⇒ ~1 I/O per lookup." },
      { id: "bt2", front: "B+tree vs LSM tree — the core trade-off?", back: "B+tree: in-place updates, fast reads, random writes. LSM: sequential writes, compaction write-amplification, reads check multiple SSTables (Bloom filters help)." },
      { id: "bt3", front: "What does the WAL guarantee?", back: "Log record fsynced before commit is acknowledged; data pages can be flushed lazily. Crash recovery replays (redo) and rolls back uncommitted work (undo)." },
      { id: "bt4", front: "How does a long-running transaction cause Postgres bloat?", back: "It holds back the xmin horizon; VACUUM can't remove dead tuples newer than it, so tables and indexes keep growing." },
      { id: "bt5", front: "Why are Cassandra reads slow on delete-heavy partitions?", back: "Deletes are tombstones read and merged until compaction purges them (after gc_grace_seconds)." },
      { id: "bt6", front: "What causes periodic I/O spikes at checkpoints?", back: "Flushing many dirty pages at once. Spread writes over the interval (checkpoint_completion_target) or checkpoint more often." },
    ],
  },
  {
    slug: "tcp-ip",
    title: "TCP/IP & HTTP",
    domain: "networks",
    blurb: "Handshakes, congestion control, HOL blocking, TLS.",
    deepDiveTopic: "TCP congestion control, connection lifecycle, HTTP/2 vs HTTP/3 and TLS",
    cards: [
      { id: "tc1", front: "Why does a 64 KiB window cap throughput on a 100 ms link?", back: "Throughput ≤ window/RTT = 64 KiB / 0.1 s ≈ 5 Mbit/s. Window scaling raises the cap toward the bandwidth-delay product." },
      { id: "tc2", front: "What causes the classic 40 ms request stall?", back: "Nagle (sender waits for ACK before sending small segment) + delayed ACK (receiver waits ~40 ms). Coalesce writes or set TCP_NODELAY." },
      { id: "tc3", front: "Why does HTTP/2 still suffer head-of-line blocking?", back: "All streams share one TCP byte stream; one lost segment stalls every stream until retransmitted. QUIC makes streams independent." },
      { id: "tc4", front: "Why does TIME_WAIT exist and when does it hurt?", back: "2×MSL wait prevents old segments corrupting a new connection with the same 4-tuple. Hurts clients opening many short outbound connections ⇒ port exhaustion." },
      { id: "tc5", front: "Small requests work, large responses hang. Suspect?", back: "PMTU black hole: ICMP 'fragmentation needed' dropped by a firewall, so oversized packets vanish silently." },
      { id: "tc6", front: "Why is TLS 1.3 0-RTT data dangerous?", back: "It can be replayed by an attacker; only send idempotent requests in early data." },
    ],
  },
  {
    slug: "distributed-systems",
    title: "Distributed Systems",
    domain: "distributed",
    blurb: "Consensus, quorums, clocks, failure handling.",
    deepDiveTopic: "consensus, replication, quorums, clocks and failure handling in distributed systems",
    cards: [
      { id: "ds1", front: "Why doesn't a 6-node Raft cluster tolerate more failures than 5?", back: "Majority of 6 is 4 ⇒ still tolerates 2 failures, but every commit now waits on more replicas." },
      { id: "ds2", front: "R + W > N — what does it guarantee and what breaks it?", back: "Every read quorum overlaps the latest write quorum. Sloppy quorums / hinted handoff break the overlap." },
      { id: "ds3", front: "What problem do fencing tokens solve?", back: "A paused ex-leader with an expired lease writing stale data. Storage rejects writes with a token older than the newest seen." },
      { id: "ds4", front: "How do you get 'exactly-once' processing?", back: "At-least-once delivery + idempotent consumers (dedupe keys/upserts) or transactional sinks. Delivery itself can't be exactly-once." },
      { id: "ds5", front: "Why add jitter to exponential backoff?", back: "Without it, clients that failed together retry together, creating synchronized retry storms." },
      { id: "ds6", front: "What is the outbox pattern for?", back: "Avoid dual writes: write the business row and the event in one local DB transaction; a relay publishes events to the broker." },
    ],
  },
];
