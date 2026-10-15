# Distributed Systems

## CAP and PACELC
During a network partition a system must choose between consistency (every read sees the latest write) and availability (every request to a non-failed node gets a response). PACELC extends this: Else, when there is no partition, the trade-off is between Latency and Consistency. Spanner is PC/EC (consistent, pays latency via synchronous replication and TrueTime commit wait); DynamoDB and Cassandra default to PA/EL with tunable consistency.

## Consistency models
Linearizability: operations appear to take effect instantaneously at some point between invocation and response, respecting real-time order. Sequential consistency drops the real-time requirement. Causal consistency preserves happens-before relationships (a reply is never seen before the message it replies to). Eventual consistency only guarantees convergence when updates stop. Read-your-writes and monotonic reads are session guarantees often implemented with sticky routing or by tracking a client's last-seen version.

## Quorums
With N replicas, a write quorum W and read quorum R satisfying R + W > N guarantee that every read overlaps the latest successful write. N = 3, W = 2, R = 2 tolerates one failure for both reads and writes. Sloppy quorums with hinted handoff (Dynamo) keep accepting writes during failures but break the overlap guarantee. Read repair and anti-entropy with Merkle trees reconcile divergent replicas.

## Consensus: Raft and Paxos
Raft elects a leader per term via randomized election timeouts; a candidate needs votes from a majority and only nodes with an up-to-date log can win. The leader appends entries and commits them once replicated on a majority. A 5-node cluster tolerates 2 failures; adding a 6th node does not improve fault tolerance (still needs 4 for a majority) and slows commits. Linearizable reads must either go through the log, use a read index confirmed by a heartbeat round, or rely on leader leases with bounded clock drift. etcd, Consul and CockroachDB use Raft; Zookeeper uses ZAB.

## Leader election and fencing
A paused leader (long GC pause, VM migration) can wake up still believing it holds a lease and write stale data. Fencing tokens — monotonically increasing numbers issued with each lease — let the storage layer reject writes carrying an older token. Distributed locks without fencing are unsafe for correctness (only acceptable for efficiency).

## Time and ordering
Physical clocks drift and NTP can step them backwards; never use wall-clock time to order events across machines. Lamport clocks give a total order consistent with causality but cannot detect concurrency. Vector clocks detect concurrent updates (neither vector dominates) at the cost of size proportional to the number of writers. Hybrid logical clocks combine physical time with a logical counter. Spanner's TrueTime exposes clock uncertainty bounds and waits them out at commit.

## Replication strategies
Single-leader: simple, writes bottleneck on one node, failover risks losing unreplicated writes. Multi-leader: writes accepted in several regions, requiring conflict resolution (last-writer-wins loses data; CRDTs merge deterministically). Leaderless (Dynamo style): clients write to several replicas directly with quorums.

## Partitioning and rebalancing
Hash partitioning with consistent hashing and virtual nodes moves only ~K/N keys when a node joins. A celebrity key (one hot partition) cannot be fixed by adding nodes — split the key (append a random suffix and fan-in reads) or cache it. Rebalancing should be throttled because data movement competes with production traffic.

## Distributed transactions
Two-phase commit: the coordinator asks participants to prepare (persist and vote), then commits if all vote yes. If the coordinator crashes after prepare, participants block holding locks until it recovers. Sagas split a transaction into local steps with compensating actions; they give up isolation, so intermediate states are visible. The outbox pattern writes the business change and the outgoing event in the same local transaction, and a relay publishes the event — avoiding dual-write inconsistency between a database and a message broker.

## Message delivery semantics
At-most-once may lose messages; at-least-once may duplicate; exactly-once processing is achieved end-to-end by at-least-once delivery plus idempotent consumers (deduplication keys, upserts) or transactional sinks. Kafka preserves order only within a partition; the consumer group's partition count caps consumer parallelism. Consumer lag growing without bound means producers outpace consumers — scale partitions/consumers or apply backpressure.

## Failure handling
Timeouts must be set from observed latency percentiles; retries need exponential backoff with jitter to avoid synchronized retry storms. Retry budgets and circuit breakers stop a struggling dependency from being overwhelmed. Retrying non-idempotent operations requires idempotency keys. Cascading failure: one slow dependency exhausts thread pools upstream; bulkheads (separate pools per dependency) contain it. Load shedding drops low-priority work early when queues grow, keeping latency bounded for the rest.

## Caching
Cache-aside: the application reads from cache, falls back to the database and populates the cache. Write-through updates both synchronously; write-back buffers writes in the cache (risk of loss). A cache stampede happens when a hot key expires and thousands of requests hit the database at once — request coalescing (single-flight), probabilistic early expiration, or serving stale-while-revalidate prevents it. Invalidation races can leave stale values forever: delete-after-write plus short TTLs bound staleness.

## Rate limiting
Token bucket allows bursts up to bucket size with a sustained refill rate; leaky bucket smooths output to a constant rate; sliding-window counters approximate per-window limits with little memory. Distributed rate limiting needs either a central store (Redis with atomic Lua scripts) or approximate local limits with periodic synchronization.
