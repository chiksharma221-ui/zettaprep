# Operating Systems

## Virtual memory and paging
Every process sees a private, contiguous virtual address space. The MMU translates virtual pages (typically 4 KiB) to physical frames using a multi-level page table (4 levels on x86-64: PML4 → PDPT → PD → PT). A full walk costs up to four memory accesses, so the Translation Lookaside Buffer (TLB) caches recent translations. A TLB miss on a cold path can cost 10–100 ns; a context switch between processes flushes non-global TLB entries unless PCIDs/ASIDs tag them.

Huge pages (2 MiB / 1 GiB) cut TLB pressure for large heaps such as databases and JVMs. Transparent Huge Pages can cause latency spikes because the kernel's khugepaged compacts memory in the background; many databases (Redis, MongoDB) recommend disabling THP.

## Page faults
A minor fault occurs when the page is in memory but not mapped for this process (e.g. shared library page, copy-on-write after fork). A major fault requires disk I/O (page was swapped out or a file-backed mmap page is not in the page cache) and costs milliseconds. A latency spike every few seconds on a process that mmaps a large file is frequently major faults after the page cache was evicted under memory pressure.

Copy-on-write: after fork(), parent and child share pages marked read-only; the first write by either triggers a fault and a private copy. Redis's BGSAVE relies on this — a write-heavy workload during a snapshot can nearly double resident memory.

## Memory allocation and fragmentation
malloc implementations (glibc ptmalloc, jemalloc, tcmalloc) keep per-thread arenas or caches to avoid lock contention. External fragmentation leaves free memory split into chunks too small to satisfy requests; internal fragmentation wastes space inside allocated blocks due to size classes. Long-running services that allocate many differently-sized objects can see RSS grow even though live heap is flat — jemalloc's decay-based purging returns memory to the OS more aggressively.

The OOM killer picks a victim by oom_score (largely proportional to RSS, adjusted by oom_score_adj). In containers, the cgroup memory limit triggers the cgroup OOM killer, which only considers processes in that cgroup.

## Stack vs heap
Each thread has its own stack (default 8 MiB main thread on Linux, often 1–2 MiB for others; JVM -Xss). Deep recursion — for example DFS over a 100,000-node path graph — overflows it. Iterative traversal with an explicit stack moves that storage to the heap. Heap allocation costs more than stack allocation because the allocator must find a free block and may take locks; escape analysis in JVMs can stack-allocate objects that do not escape.

## Processes vs threads
A process owns an address space, file descriptor table and credentials; threads share all of these but each has its own stack, registers and thread-local storage. Creating a thread is cheaper than fork because no page tables are copied. A crash (segfault) in any thread kills the whole process; separate processes isolate failures, which is why Chrome uses a multi-process architecture.

Context switch cost: saving/restoring registers is cheap (~1 µs), but the indirect cost — cold caches and TLB — dominates. Thousands of runnable threads cause thrashing; event loops (epoll) or green threads/goroutines (M:N scheduling) avoid that.

## CPU scheduling
Linux CFS (and its successor EEVDF in 6.6+) tracks per-task virtual runtime and always runs the task with the smallest, giving fair share weighted by nice value. Real-time classes (SCHED_FIFO, SCHED_RR) preempt normal tasks. In containers, CPU quotas (cfs_quota_us) are enforced per 100 ms period: a multi-threaded service can burn its whole quota in 20 ms and then be throttled for 80 ms, producing p99 latency spikes even at low average CPU usage.

## Synchronization primitives
A mutex provides mutual exclusion; a spinlock busy-waits and is only appropriate when the critical section is shorter than a context switch and the holder cannot be preempted. Linux futexes make uncontended lock/unlock purely user-space atomic operations; only contention calls into the kernel.

Semaphores count permits; condition variables let a thread sleep until a predicate becomes true and must always be waited on in a loop because of spurious wakeups. Reader–writer locks help read-heavy workloads but can starve writers or readers depending on policy.

## Deadlock
Four Coffman conditions must all hold: mutual exclusion, hold-and-wait, no preemption, circular wait. Breaking any one prevents deadlock. Lock ordering (always acquire locks in a global order) breaks circular wait; tryLock with timeout and back-off breaks hold-and-wait. Livelock: threads keep changing state in response to each other without progress (e.g. both back off and retry in lockstep) — randomized back-off fixes it. Priority inversion: a low-priority task holds a lock needed by a high-priority task while a medium-priority task preempts the low one; priority inheritance solves it (famous Mars Pathfinder bug).

## Memory models and atomics
Modern CPUs and compilers reorder memory operations. Without proper synchronization, one thread may observe another's writes out of order. Acquire/release semantics order operations around a synchronization point; sequential consistency is strongest and slowest. Double-checked locking is broken without volatile (Java) / atomics (C++) because a partially-constructed object can be published. False sharing: two threads writing different variables on the same 64-byte cache line ping-pong that line between cores; padding or per-core counters fix it.

## I/O models
Blocking I/O ties up a thread per connection. Non-blocking I/O with readiness notification (select/poll/epoll/kqueue) lets one thread manage thousands of sockets — the basis of Nginx, Node.js and Redis. epoll is O(1) per ready event vs O(n) for select. io_uring (Linux 5.1+) uses shared submission/completion ring buffers to batch syscalls and supports true async file I/O.

The page cache buffers file reads/writes; write() returns once data is in the page cache, not on disk. fsync forces durability and can take tens of milliseconds on spinning disks; databases group-commit to amortize it. O_DIRECT bypasses the page cache when the application manages its own buffer pool.

## File systems
Inodes store metadata and block pointers; directories map names to inode numbers. Journaling file systems (ext4, XFS) write metadata intent to a journal first so a crash leaves the FS consistent; data=ordered mode writes data blocks before committing the metadata that references them. Copy-on-write file systems (btrfs, ZFS) never overwrite in place, enabling cheap snapshots. Running out of inodes produces "No space left on device" even with free blocks — common with millions of tiny files.
