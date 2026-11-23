# Matinee: Database Sharding & Horizontal Partitioning Architecture
## Technical Specification & High-Scale Growth Plan

> [!NOTE]
> Per the official Final Graduation Task brief (Part 2.4 Mobile Task B, line 194):
> **"SHARDING.md plan ONLY; no simulation needed."**
> This document specifies the architectural strategy, partitioning keys, concurrency co-location rules, and cross-shard trade-offs required to scale Matinee horizontally as theater volume expands across Nigeria and West Africa.

---

## 1. Sharding Motivation & Threshold Triggers

In a single-node PostgreSQL instance with PgBouncer connection pooling, Matinee comfortably handles metropolitan Lagos operations (up to 50 cinemas, 250 screens, and 50,000 daily bookings). However, scaling nationally to all major Nigerian commercial centers (Lagos, Abuja, Port Harcourt, Ibadan, Kano) introduces storage, connection, and write-throughput bottlenecks:

### Scaling Threshold Triggers for Horizontal Sharding
1. **Active Ticket Volume**: The `tickets` table exceeds **20,000,000 rows**, causing B-tree index degradation and bloated partial index vacuum overhead.
2. **Write Throughput Under Flash Demand**: Write IOPS on the primary database surpass 8,000 IOPS during simultaneous national premiere ticket drops across multiple theater chains.
3. **Database Connection Saturation**: Concurrent booking transaction locks exceed the connection pool capacity of a single primary writer node.

---

## 2. Table Classification: Sharded vs. Global Reference Data

Not all tables in the Matinee cinema schema should be sharded. Tables are split into **Global Reference Tables** (replicated to all nodes) and **High-Volume Sharded Tables**:

```
┌─────────────────────────────────────────────────────────────┐
│                 Global Reference Tables                     │
│  - Replicated across all shards via logical replication     │
│  - Low write frequency, high read frequency                 │
│  ---------------------------------------------------------  │
│  • movies (synced via TMDB BFF)                             │
│  • cinemas (theater locations, chains, neighborhoods)       │
│  • auditoriums (hall structures, total seats, formats)      │
│  • users (customer profiles, auth credentials)              │
└─────────────────────────────────────────────────────────────┘
                               ▲
                               │ Foreign Key References
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 High-Volume Sharded Tables                  │
│  - Partitioned horizontally across physical database nodes  │
│  - High write frequency, extreme concurrency contention     │
│  ---------------------------------------------------------  │
│  • showtimes                                                │
│  • seats (runtime allocation states)                        │
│  • bookings                                                 │
│  • tickets                                                  │
│  • payment_attempts                                         │
│  • processed_webhook_events                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Shard Key Evaluation & Selection

The selection of the shard key determines whether booking operations can execute within a single database node or require expensive, latency-inducing two-phase commits (2PC).

### Candidate Evaluation

| Candidate Shard Key | Evaluation & Trade-offs | Verdict |
|---|---|---|
| **`user_id`** | Customer bookings for different cinemas are co-located with the user. However, when 500 users compete for seats in the same auditorium, writes are scattered across 500 different shards. Enforcing the partial unique index on `(showtime_id, seat_id)` would require global distributed unique locking, destroying write throughput. | **REJECTED** |
| **`cinema_id`** | Co-locates all auditoriums and showtimes within a single physical cinema location. Good geographical affinity, but creates severe imbalance (e.g. Filmhouse IMAX Lekki receives $10\times$ the traffic of a suburban 2-screen hall). | **SECONDARY OPTION** |
| **`showtime_id`** | **Optimal**. Every seat reservation, ticket allocation, booking order, hold lease, and payment attempt is strictly bound to a single showtime session. All tables involved in the transactional booking boundary share the same `showtime_id`. | **SELECTED PRIMARY SHARD KEY** |

---

## 4. Showtime Locality & Transactional Consistency

By selecting `showtime_id` as the primary shard key (using hash-based partitioning: `shard_id = murmur3(showtime_id) % num_shards`):

1. **Zero Distributed Transactions**:
   - The entire booking checkout flow:
     ```sql
     BEGIN;
     INSERT INTO bookings (...) VALUES (...);
     INSERT INTO tickets (showtime_id, seat_id, ...) VALUES (...);
     INSERT INTO payment_attempts (...) VALUES (...);
     COMMIT;
     ```
     executes **100% locally** within a single shard. No distributed lock managers or two-phase commit protocols (2PC) are required.
2. **Local Unique Constraint Enforcement**:
   - The crucial double-booking prevention constraint:
     ```sql
     CREATE UNIQUE INDEX uq_active_showtime_seat
     ON tickets (showtime_id, seat_id)
     WHERE status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'REFUNDED_RESTRICTED');
     ```
     is validated entirely on the local shard's local B-tree index in microseconds.

---

## 5. The Hot-Shard Risk for Blockbuster Premieres

While `showtime_id` guarantees local transaction atomicity, it creates a well-known distributed systems challenge: **The Hot-Shard Problem**.

### The Vulnerability
When a global blockbuster (e.g. *Avatar: Fire and Ash*) drops tickets for Friday 8:00 PM at IMAX Lekki, 5,000 requests per second converge on the exact shard hosting that specific `showtime_id`. While the remaining shards remain idle, the hot shard's CPU and disk IOPS spike dramatically.

### Multi-Tier Hot-Shard Mitigations
1. **Redis Hold Buffering (Cache Absorption)**:
   - Contending traffic hits the Redis in-memory hold tier first.
   - Out of 500 virtual users competing for 50 seats, exactly 50 hold winners are permitted to reach the database shard. The remaining 450 requests are rejected in Redis memory (< 5ms) without generating a single database connection or write query on the hot shard.
2. **Read-Replica Offloading**:
   - Seat map browsing queries (`GET /api/v1/showtimes/:id/seats`) are directed to read replicas attached to that shard, shielding the primary writer node from read traffic.
3. **Queue Throttling / Waiting Room**:
   - If write throughput on a single showtime exceeds 150 transactions/second, the queue manager automatically activates the waiting room, pacing checkout finalization to match the shard's optimal write capacity.

---

## 6. Cross-Shard Querying & Reporting Trade-offs

Partitioning by `showtime_id` creates architectural trade-offs for cross-shard data access:

### Trade-off 1: User Booking History Across Multiple Cinemas
- **Problem**: When a customer opens "My Tickets" in the mobile app (`(tabs)/tickets.tsx`), their bookings may span multiple showtimes distributed across different physical shards.
- **Solution: Secondary Global Index / Event-Driven Consumer**:
  - A lightweight global mapping table (`user_id` $\to$ `booking_reference`, `showtime_id`, `shard_id`) is maintained in the user service.
  - Alternatively, bookings are published to an Apache Kafka / RabbitMQ event stream upon confirmation, populating a read-optimized query store (Elasticsearch / Redis Hashes) for immediate customer profile lookups.

### Trade-off 2: Box Office Financial & Settlement Reporting
- **Problem**: Cinema administrators need daily aggregate box office revenue across all screens in Lagos. Querying all shards via scatter-gather introduces latency.
- **Solution: Asynchronous Data Warehouse (ELT)**:
  - Shards stream change data (CDC via Debezium or PostgreSQL logical replication) to a centralized analytical warehouse (ClickHouse / Snowflake / BigQuery).
  - Financial reconciliation and box-office reports run against the analytical warehouse without impacting online transaction processing (OLTP) performance.

---

## 7. Migration Roadmap: From Single DB to Sharded Cluster

The transition from the current single-instance PostgreSQL topology to a sharded architecture follows a controlled phased migration:

```
[Phase 1: Current Architecture]
Single PostgreSQL Instance (Neon Serverless)
with PgBouncer Connection Pooling

                 │ (When tickets > 20M rows)
                 ▼
[Phase 2: Table Partitioning (Declarative)]
Native PostgreSQL Declarative Range/List Partitioning
by showtime_id (or showtime_month) on the single cluster

                 │ (When IOPS / write limits reached)
                 ▼
[Phase 3: Transparent Sharding Proxy]
Deploy Citus Data extension or Vitess proxy layer
Routing transparently by showtime_id to N worker nodes
Zero application rewriting required in Express API
```

### Conclusion
Sharding by `showtime_id` provides Matinee with a clear, technically sound scaling path from a single-city Lagos prototype to a continental African cinema platform, preserving ACID relational booking integrity without sacrificing flash-demand write performance.
