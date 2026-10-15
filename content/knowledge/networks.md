# Computer Networks

## TCP connection lifecycle
Three-way handshake: SYN, SYN-ACK, ACK — costs one round trip before data flows (TCP Fast Open can carry data in the SYN for repeat clients). Termination uses FIN/ACK in each direction. The side that closes first enters TIME_WAIT for 2×MSL (60 s on Linux) so delayed segments from the old connection cannot corrupt a new one with the same 4-tuple. A client making thousands of short-lived outbound connections to the same backend exhausts ephemeral ports stuck in TIME_WAIT — connection pooling/keep-alive fixes it; tcp_tw_reuse helps for outbound connections.

SYN flood: attackers send SYNs without completing the handshake, filling the SYN backlog. SYN cookies encode connection state in the initial sequence number so the server keeps no state until the final ACK.

## TCP reliability and flow control
Sequence numbers and cumulative ACKs give in-order reliable delivery; selective ACKs (SACK) report non-contiguous received blocks. The receiver advertises a receive window; the sender may not have more than that many unacknowledged bytes in flight (flow control). Throughput ≤ window / RTT, so a 64 KiB window over a 100 ms RTT link caps at ~5 Mbit/s regardless of bandwidth — window scaling raises the limit. Bandwidth-delay product = bandwidth × RTT is the amount of data needed in flight to fill the pipe.

## Congestion control
Slow start doubles the congestion window every RTT until a threshold or loss; congestion avoidance then grows it additively (AIMD) and halves it on loss. Fast retransmit triggers on three duplicate ACKs without waiting for the retransmission timeout. CUBIC (Linux default) grows the window as a cubic function of time since the last loss, suited to high-BDP links. BBR models bottleneck bandwidth and min RTT instead of reacting to loss, performing much better on lossy long-haul links but can be unfair to CUBIC flows.

New connections start in slow start, so short-lived HTTP requests over fresh connections never reach full bandwidth — another reason for connection reuse.

## Nagle's algorithm and delayed ACK
Nagle buffers small writes until the previous segment is acknowledged. The receiver's delayed ACK waits up to ~40 ms hoping to piggyback the ACK on response data. Together they cause a classic 40 ms latency stall for request/response protocols that send a request in two small writes. TCP_NODELAY disables Nagle; coalescing writes into one send is the better fix.

## Head-of-line blocking and HTTP versions
HTTP/1.1 allows one outstanding request per connection (pipelining is effectively unused), so browsers open ~6 connections per origin. HTTP/2 multiplexes many streams over one TCP connection with HPACK header compression, but a single lost TCP segment stalls every stream (TCP-level head-of-line blocking). HTTP/3 runs over QUIC on UDP: streams are independent at the transport layer, the handshake combines transport and TLS 1.3 (1-RTT, 0-RTT for resumption), and connection IDs survive client IP changes (Wi-Fi to cellular).

## TLS
TLS 1.3 completes the handshake in one round trip: the client sends key shares in ClientHello, the server responds with its share, certificate and Finished. Forward secrecy comes from ephemeral (EC)DHE keys. 0-RTT resumption data is replayable, so it must only carry idempotent requests. Certificate validation checks the chain to a trusted root, hostname (SAN) match, and expiry; OCSP stapling avoids an extra client round trip to check revocation. TLS termination at a load balancer offloads crypto but means traffic to backends is plaintext unless re-encrypted.

## DNS
Resolution goes stub resolver → recursive resolver → root → TLD → authoritative server; answers are cached for their TTL. Low TTLs enable fast failover but increase resolver load and latency; many clients and JVMs cache longer than the TTL (Java's networkaddress.cache.ttl), delaying failover. DNS uses UDP by default and falls back to TCP for large responses. Negative answers (NXDOMAIN) are also cached.

## Load balancing
L4 load balancers forward TCP/UDP flows based on the 5-tuple and cannot inspect HTTP; L7 balancers terminate the connection and route by path, header or cookie. Algorithms: round robin, least connections, consistent hashing (session affinity, cache locality), power-of-two-choices (pick the less loaded of two random backends — near-optimal with little coordination). Long-lived HTTP/2 or gRPC connections defeat L4 balancing because all requests ride one connection — use L7/per-request balancing or client-side balancing.

Health checks remove failed backends; aggressive checks can cause flapping, and if every backend fails the check simultaneously (e.g. a shared dependency is down), fail-open avoids taking the whole service offline.

## IP, routing and NAT
IPv4 packets are routed hop by hop using longest-prefix match. MTU is usually 1500 bytes on Ethernet; Path MTU discovery relies on ICMP "fragmentation needed" messages — firewalls that drop ICMP create black holes where small requests work but large responses hang. NAT rewrites source addresses and ports; NAT tables time out idle connections, which silently breaks long-lived idle TCP connections unless keep-alives are sent more often than the NAT timeout.

## Sockets and backlog
listen(backlog) bounds the accept queue of fully-established connections. If the application calls accept() too slowly, the queue overflows and new connections are dropped or reset, showing up as client connect timeouts while the server's CPU looks idle. SO_REUSEPORT lets multiple processes/threads bind the same port with kernel-level load balancing across their accept queues.
