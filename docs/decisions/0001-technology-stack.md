# ADR 0001: Technology Stack Selection & Trade-off Analysis

- **Status**: PROPOSED (Awaiting User Review)
- **Date**: 2026-11-09
- **Deciders**: Architecture Team, Mobile Lead, Product Engineering

---

## 1. Context & Objectives

Matinee requires a high-performance, real-time cinema ticket reservation mobile system. The platform must handle high-concurrency ticket drops (e.g. blockbuster premiere releases), enforce zero double-bookings, deliver a 60fps pan/zoom seat selection experience across 300+ seat auditoriums, and guarantee seamless checkout.

---

## 2. Proposed Technology Stack

| Layer | Proposed Technology | Primary Role in Matinee |
| :--- | :--- | :--- |
| **Mobile Client** | **Expo / React Native / TypeScript** | Cross-platform iOS & Android mobile application with shared TypeScript types |
| **Backend API** | **Node.js / Express / TypeScript** | REST API gateway, authentication, booking coordinator, TMDB proxy |
| **Primary Database**| **PostgreSQL / Prisma ORM** | ACID transactional store for users, cinemas, auditoriums, showtimes, tickets, and bookings |
| **Cache & Holds** | **Redis** | Sub-millisecond atomic seat holds, distributed locks, session management, and rate limiting |
| **Movie Metadata**| **TMDB API via Backend Proxy** | Movie discovery, synopses, cast/crew, posters/backdrops with backend Redis caching |
| **Payments** | **Test-Mode Payment Provider** | Secure test payment gateway simulating 3D Secure, success, and decline scenarios |
| **Load Testing** | **k6 (Grafana)** | Concurrency simulation, seat hold contention testing, stress testing booking APIs |

---

## 3. Layer Evaluation, Alternatives & Risk Analysis

### 3.1 Mobile Client: Expo / React Native / TypeScript
- **Selected**: Expo SDK (Managed Workflow with Prebuild support) + TypeScript.
- **Why**:
  - Rapid cross-platform delivery for iOS and Android with single code-base.
  - Native gesture performance via `react-native-gesture-handler` and `react-native-reanimated` is essential for fluid 300+ seat maps.
  - Excellent developer ergonomics (Fast Refresh, EAS updates, TypeScript type safety matching backend).
- **Alternatives Considered**:
  - *Flutter*: High rendering performance via Impeller, but requires Dart (splitting language ecosystem from backend TypeScript) and lacks rich React ecosystem libraries.
  - *Native Swift / Kotlin*: Highest possible performance, but doubles engineering overhead and maintenance cost for an independent product.
- **Risks & Mitigations**:
  - *Risk*: Heavy SVG/Canvas seat maps with 300+ interactive seats could drop frames on low-end Android devices.
  - *Mitigation*: Utilize React Native Skia or virtualized canvas rendering, memoizing individual seat nodes, and decoupling gesture state from React component state trees.

### 3.2 Backend Service: Node.js / Express / TypeScript
- **Selected**: Node.js runtime with Express.js and TypeScript.
- **Why**:
  - End-to-end TypeScript sharing models, validation schemas (Zod), and API contract types between mobile app and server.
  - Mature ecosystem for Redis scripting, Prisma database integration, and webhook handling.
  - Lightweight and battle-tested in microservice and modular monolith architectures.
- **Alternatives Considered**:
  - *Fastify*: Slightly higher raw HTTP throughput, but Express offers wider middleware maturity and simpler onboarding. (Can be migrated if raw routing throughput becomes a bottleneck).
  - *Go / Gin*: Extremely high CPU concurrency and low memory, but sacrifices unified TypeScript type sharing across frontend/backend.
  - *NestJS*: Strong enterprise structure, but adds excessive decorator/boilerplate overhead for Matinee's focused scope.
- **Risks & Mitigations**:
  - *Risk*: Single-threaded event loop blocking on heavy JSON payload serialization.
  - *Mitigation*: Strict payload bounding, pagination, offloading PDF/ticket generation to asynchronous background workers.

### 3.3 Database & ORM: PostgreSQL / Prisma ORM
- **Selected**: PostgreSQL 16+ managed database with Prisma ORM.
- **Why**:
  - Cinema bookings are inherently relational: `Cinema -> Auditorium -> Seat -> Showtime -> Booking -> Ticket`.
  - True ACID transaction isolation (Read Committed / Serializable) required to enforce that two users cannot book the same seat under any circumstance.
  - Native JSONB support for flexible auditorium layout matrices.
  - Prisma provides type-safe query generation and migration safety.
- **Alternatives Considered**:
  - *MongoDB / Document DB*: Lacks relational foreign key guarantees and row-level locking needed for multi-seat atomic reservations.
  - *TypeORM / Kysely*: Kysely is lighter, but Prisma provides superior DX, auto-generated TypeScript clients, and robust schema migrations.
- **Risks & Mitigations**:
  - *Risk*: Prisma query engine connection pool exhaustion during sudden spikes in concurrent booking attempts.
  - *Mitigation*: Tune Prisma connection pools; protect database with Redis hold tier so database transactions only execute for confirmed checkouts.

### 3.4 In-Memory Cache & Distributed Holds: Redis
- **Selected**: Redis 7+ (In-Memory Key-Value store with Lua scripting).
- **Why**:
  - Atomic seat holding with auto-expiring keys (TTL).
  - Single-threaded command execution guarantees that two concurrent hold requests for the same seat cannot both succeed.
  - Lua scripts run atomically, allowing multi-seat check-and-hold in one round trip.
- **Alternatives Considered**:
  - *Database Row Locks (`SELECT ... FOR UPDATE`)*: Holding database connections open for 10 minutes while a user enters credit card details exhausts database connection pools instantly.
  - *Memcached*: Lacks atomic Lua scripting and native expiration key event notifications.
- **Risks & Mitigations**:
  - *Risk*: Redis node failover or network partition could lose active holds.
  - *Mitigation*: Treat Redis holds as advisory temporary leases; PostgreSQL remains the ultimate source of truth via unique constraints.

### 3.5 Movie Metadata: TMDB API Proxied via Matinee Backend
- **Selected**: The Movie Database (TMDB) API consumed strictly through Matinee backend proxy.
- **Why**:
  - Protects TMDB API keys from mobile binary extraction.
  - Allows backend caching (Redis TTL 6–24 hours) of static film metadata (synopses, posters, cast), reducing external latency and rate limit risks.
  - Enables Matinee to map TMDB movie IDs to internal local cinema showtimes.
- **Alternatives Considered**:
  - *Direct Mobile TMDB Calls*: Exposes API keys in client bundles, causes redundant client queries, and prevents internal cinema-to-movie mapping.
- **Risks & Mitigations**:
  - *Risk*: TMDB API downtime or rate limiting.
  - *Mitigation*: Cache responses aggressively in Redis and PostgreSQL; serve stale cache during upstream TMDB outages.

### 3.6 Payments: Test-Mode Payment Provider
- **Selected**: Test-Mode Gateway (e.g. Stripe Test Mode / Mock Payment Engine).
- **Why**:
  - Safe, production-grade API simulation without financial risk.
  - Supports simulated 3D Secure challenges, instant confirmations, and edge-case declines (e.g., insufficient funds, expired cards).
  - Enforces webhook signature validation and idempotency key workflows identically to production.
- **Risks & Mitigations**:
  - *Risk*: Behavioral divergence between test mode and real production gateways.
  - *Mitigation*: Follow standard payment provider webhook structures and RFC idempotency specs.

### 3.7 Load Testing: k6 (Grafana)
- **Selected**: k6 open-source load testing tool.
- **Why**:
  - Scriptable in JavaScript/TypeScript.
  - Capable of simulating thousands of virtual users (VUs) simultaneously competing for the same auditorium seats.
  - Measures API p95/p99 latency, failure rates, and double-booking detection under stress.
- **Alternatives Considered**:
  - *JMeter*: Heavy Java GUI, cumbersome version control.
  - *Artillery*: Good, but k6 has superior performance and metrics integration.

---

## 4. Architectural Decision Summary

The proposed stack establishes a modern, type-safe, resilient foundation. By pairing an Expo/React Native front-end with an Express/Redis/PostgreSQL backend, Matinee achieves:
1. End-to-end type safety across mobile and server.
2. Complete database protection against connection exhaustion via Redis temporary holds.
3. Strict ACID transactional booking finalization.
4. Scalable load-testing readiness with k6.
