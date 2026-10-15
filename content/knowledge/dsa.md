# Data Structures and Algorithms

## Amortized analysis
A dynamic array doubles its capacity when full; a single append may copy n elements, but the total cost of n appends is O(n), so each append is amortized O(1). Growing by a constant amount instead of a factor makes appends amortized O(n). The potential method assigns "stored credit" to the data structure; the accounting method charges cheap operations extra to pay for expensive ones. Amortized bounds are not worst-case bounds: a latency-sensitive system can still see an individual O(n) resize.

## Deques and monotonic queues
A deque supports O(1) push/pop at both ends; implementations use a ring buffer (Java ArrayDeque) or a linked list of blocks (Python collections.deque, C++ std::deque). Removing from the front of a plain dynamic array (Python list.pop(0), JavaScript Array.shift) is O(n) because every element shifts — a hidden quadratic inside a BFS or sliding-window loop.

A monotonic deque keeps indices whose values are decreasing; the front is always the window maximum. Each index enters and leaves once, so the sliding-window maximum runs in O(n) total. Storing indices (not values) is essential to know when the front has left the window, especially with duplicate values.

## Heaps and priority queues
A binary heap stored in an array gives O(log n) push/pop and O(1) peek; building a heap from n items with sift-down is O(n). Most library heaps do not support decrease-key; Dijkstra implementations instead push a new entry and skip stale ones when popped (lazy deletion), giving O((V + E) log V) with up to E heap entries. A Fibonacci heap has O(1) amortized decrease-key but large constants. For top-k of a stream, keep a min-heap of size k: O(n log k) time, O(k) space.

## Hash tables
Average O(1) lookup with a good hash and load factor below ~0.75. Chaining stores collisions in buckets; open addressing (linear/quadratic probing, Robin Hood) stores them in the table itself and is more cache-friendly but degrades sharply at high load. Adversarial inputs can force all keys into one bucket (hash-flooding DoS); randomized seeds (SipHash) or tree-ified buckets (Java 8 HashMap converts long chains to red-black trees) bound the worst case. Resizing rehashes everything: an O(n) pause.

## Balanced binary search trees
AVL trees keep heights within 1 (faster lookups); red-black trees allow more imbalance (fewer rotations on update) — used by C++ std::map and Java TreeMap. All operations O(log n), plus ordered iteration, floor/ceiling and range queries that hash tables cannot do. An unbalanced BST degenerates into a linked list on sorted input: O(n) per operation and O(n) recursion depth.

## Tree traversal and recursion depth
Recursive DFS on a tree uses O(h) stack space, where h is the height: O(log n) for a balanced tree but O(n) for a skewed one. Python's default recursion limit is 1000; JVM default thread stacks overflow around 10^4–10^5 frames. An explicit stack, or Morris traversal (O(1) extra space by temporarily threading right pointers), avoids overflow.

## Graph representations
An adjacency list uses O(V + E) space and is right for sparse graphs; an adjacency matrix uses O(V²) space but answers edge queries in O(1) and suits dense graphs or Floyd–Warshall. BFS finds shortest paths in unweighted graphs in O(V + E). 0-1 BFS with a deque handles edge weights of 0 or 1 in linear time.

## Topological sorting
Kahn's algorithm repeatedly removes nodes with in-degree zero; if fewer than V nodes are removed, the graph has a cycle. Using a min-heap instead of a FIFO queue yields the lexicographically smallest order in O((V + E) log V). DFS-based topological sort (reverse post-order) is O(V + E) but does not produce the lexicographically smallest order and needs care with recursion depth. Three-colour DFS (white/grey/black) detects cycles: an edge to a grey node is a back edge.

## Shortest paths
Dijkstra requires non-negative edge weights; a node's distance is final when popped from the heap. With negative weights a later relaxation can improve an already-finalized node, so Dijkstra is wrong. Bellman–Ford handles negative weights in O(VE) and detects negative cycles with a V-th relaxation round. Floyd–Warshall computes all pairs in O(V³). A* adds an admissible heuristic to focus the search toward the target.

## Union-Find
Disjoint Set Union with path compression and union by rank/size gives near-constant amortized operations, O(α(n)). It powers Kruskal's minimum spanning tree, connectivity queries and cycle detection in undirected graphs. It cannot efficiently support deleting edges — process deletions offline in reverse as additions.

## Sorting
Comparison sorts have an Ω(n log n) lower bound. Quicksort is fast in practice but O(n²) worst case on adversarial or already-sorted input with naive pivots; introsort falls back to heapsort. Mergesort is stable and O(n log n) worst case with O(n) extra space; Timsort (Python, Java objects) exploits existing runs and is O(n) on nearly-sorted data. Counting/radix sort beat the bound for bounded integer keys: O(n + k).

## Interval problems
Sort by start, then sweep, tracking the current block's end with max() to handle nested intervals. Meeting-rooms (minimum rooms) uses a min-heap of end times or two sorted arrays of starts and ends. Watch for inclusive vs exclusive ends ("touching" intervals) and integer overflow when end values exceed 2^31 − 1 in Java/C++.

## Sliding window and two pointers
Variable-size windows expand the right pointer and shrink the left while a constraint is violated; each pointer moves at most n times, so the loop is O(n) despite nesting. Requires the constraint to be monotonic (adding elements never makes it easier to satisfy) — with negative numbers, "subarray sum ≥ k" is not monotonic and needs prefix sums with a monotonic deque instead.

## Dynamic programming
Identify state, transition and base case; memoization (top-down) computes only reachable states but risks recursion depth; tabulation (bottom-up) allows rolling arrays to cut space, e.g. O(n·W) → O(W) for 0/1 knapsack by iterating capacity downward. Many "exponential" problems become polynomial once overlapping subproblems are recognized.
