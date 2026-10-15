# Database Systems

## B-tree and B+tree indexes
A B+tree stores keys in sorted order across fixed-size pages (8 KiB in Postgres, 16 KiB in InnoDB). Internal nodes hold only separator keys and child pointers, giving a fan-out of hundreds; leaves hold keys plus row pointers (or the row itself in a clustered index) and are linked for range scans. A table with a billion rows needs only 3–4 levels, and the top levels stay cached, so a point lookup costs ~1 random I/O.

Inserts into a full page split it into two half-full pages and push a separator up. Monotonically increasing keys (auto-increment, timestamps) always hit the right-most leaf: great for page fill, but a hot spot under concurrency. Random keys such as UUIDv4 scatter inserts across all leaves, causing page splits, ~50–70% fill and a working set much larger than RAM — UUIDv7 or ULIDs restore locality.

## Clustered vs secondary indexes
InnoDB stores rows inside the primary-key B+tree (clustered). Secondary indexes store the primary key as the row pointer, so a secondary lookup is two tree traversals, and a wide primary key bloats every secondary index. Postgres stores rows in an unordered heap; every index points to a tuple id (ctid). A covering index (INCLUDE columns, or composite index containing all selected columns) enables index-only scans that skip the heap entirely — in Postgres only if the visibility map marks the page all-visible, which depends on VACUUM.

## Composite indexes and selectivity
A composite index on (a, b, c) can serve predicates on a, (a, b), or (a, b, c) — the leftmost-prefix rule. A range predicate on a column stops the index from being used for ordering/filtering on later columns. Put equality columns first, then the range column. Low-selectivity indexes (e.g. a boolean column) are rarely used because a sequential scan is cheaper than many random heap fetches; partial indexes (WHERE status = 'pending') index only the rows that matter.

## LSM trees
Log-structured merge trees (RocksDB, Cassandra, LevelDB) buffer writes in an in-memory memtable, flush sorted runs (SSTables) to disk, and merge them in background compaction. Writes are sequential and fast; reads may check several SSTables, mitigated by Bloom filters and block caches. Write amplification (bytes written to disk per byte of user data) and space amplification depend on compaction strategy: leveled compaction favors reads and space; size-tiered favors write throughput. Deletes are tombstones that are only purged on compaction — a tombstone-heavy partition makes Cassandra reads slow.

## Transactions and ACID
Atomicity: all or nothing (undo log / shadow paging). Consistency: invariants hold. Isolation: concurrent transactions behave as if serialized to some degree. Durability: committed data survives crashes (write-ahead log fsynced before commit acknowledgement).

Write-ahead logging: changes are appended to the WAL before data pages are modified on disk. On crash, ARIES-style recovery redoes logged changes and undoes uncommitted ones. Checkpoints bound recovery time; a checkpoint storm (flushing many dirty pages at once) causes periodic I/O and latency spikes — Postgres spreads it with checkpoint_completion_target.

## Isolation levels and anomalies
Read Uncommitted allows dirty reads. Read Committed (Postgres default) prevents dirty reads but allows non-repeatable reads. Repeatable Read prevents non-repeatable reads; in Postgres it is snapshot isolation and also prevents phantoms but allows write skew. Serializable prevents all anomalies; Postgres implements Serializable Snapshot Isolation (SSI) which aborts transactions with dangerous read-write dependency cycles, so clients must retry on serialization failures.

Lost update: two transactions read a counter, both increment and write back. Fix with SELECT … FOR UPDATE, atomic UPDATE x = x + 1, or optimistic concurrency (version column checked in the WHERE clause). Write skew: two doctors both check "at least one other doctor is on call" and both go off call — only Serializable or explicit locking of the checked rows prevents it.

## MVCC
Multi-version concurrency control keeps old row versions so readers never block writers. Postgres writes a new tuple version on every UPDATE and marks the old one dead (xmax); VACUUM later reclaims space. Long-running transactions hold back the xmin horizon, so VACUUM cannot remove dead tuples — table and index bloat grow, and queries slow down. Transaction ID wraparound (32-bit xids) forces aggressive anti-wraparound vacuum. InnoDB instead updates in place and stores previous versions in undo logs; a long-running read view makes the history list grow.

## Locking
Two-phase locking (2PL): a growing phase acquiring locks and a shrinking phase releasing them; strict 2PL holds write locks until commit, guaranteeing serializability at the cost of blocking. Row locks, gap locks and next-key locks (InnoDB, Repeatable Read) prevent phantom inserts into a scanned range — and frequently cause surprising deadlocks between concurrent inserts. Databases detect deadlocks with a wait-for graph and abort one victim.

## Query planning
The optimizer estimates cardinalities from statistics (histograms, most-common values, n_distinct) and picks join orders and algorithms. Nested loop join is best when the outer side is small and the inner side is indexed; hash join for large unsorted equi-joins (needs memory: work_mem); merge join when both sides are already sorted. Stale statistics after a bulk load make the planner pick a nested loop over millions of rows — ANALYZE fixes it. Correlated columns (city and zip code) break the independence assumption; extended statistics help.

## Connection management
Each Postgres connection is a separate OS process using several MiB; thousands of connections waste memory and suffer from lock contention on shared structures. A pooler (PgBouncer in transaction mode) multiplexes many client connections onto a small pool. Transaction pooling breaks session-level features: prepared statements (pre-1.21 PgBouncer), SET, advisory locks and LISTEN/NOTIFY.

## Replication
Physical (WAL streaming) replication ships the byte-level log; logical replication ships row changes and allows different schemas/versions. Asynchronous replicas lag — reading your own write from a replica can return stale data; route read-after-write to the primary or wait for the replica to reach the commit LSN. Synchronous replication waits for at least one replica to confirm before acknowledging commit: no data loss on failover but higher commit latency. Split brain: two nodes both believe they are primary; fencing (STONITH) and consensus-based leader election prevent it.

## Sharding and partitioning
Range partitioning keeps related keys together (good for range scans, risk of hot spots on the newest range). Hash partitioning spreads load evenly but range queries hit every shard. Consistent hashing with virtual nodes limits data movement when nodes join or leave to ~1/N of keys. Cross-shard transactions require two-phase commit or saga patterns; choose a shard key that keeps most transactions single-shard (e.g. tenant_id).
