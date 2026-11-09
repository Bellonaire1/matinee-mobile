# ADR 0002: Critical Booking Invariants & Concurrency Guarantees

- **Status**: PROPOSED (Awaiting User Review)
- **Date**: 2026-11-09
- **Deciders**: Architecture Team, Backend Lead, Database Engineer

---

## 1. Context & The Double-Booking Challenge

In a cinema reservation system, high-demand events (e.g. premiere showtimes) trigger concurrent booking requests where hundreds or thousands of users may attempt to reserve the exact same seats within milliseconds.

A naive implementation that reads seat status and writes a booking without atomic isolation suffers from race conditions:
```
User A reads Seat 12 (Available) ────┐
                                     ├──> Both perceive seat as available!
User B reads Seat 12 (Available) ────┘
User A books Seat 12 ────────────────┐
                                     ├──> Double Booking Disaster!
User B books Seat 12 ────────────────┘
```

Matinee mandates **absolute zero tolerance for double bookings**. The architecture implements six critical invariants to guarantee correctness, fault tolerance, and idempotency.

---

## 2. The 6 Critical Booking Invariants

```
                                  CONCURRENCY PIPELINE

 [Mobile Client]
       │
       │ 1. POST /api/v1/holds (Seat Selection)
       ▼
 ┌──────────────┐   Atomic Lua Script
 │ Redis Engine │ ─────────────────────>  Hold Lease Granted (TTL: 600s)
 └──────────────┘  Keys: hold:{showtime}:{seat}  OR Rejection: 409 Conflict
       │
       │ 2. POST /api/v1/bookings (Idempotency-Key: <UUID>)
       ▼
 ┌──────────────┐   1. Check Idempotency Table
 │ Express API  │   2. Validate Redis Hold Ownership
 └──────────────┘   3. Create Payment Intent
       │
       │ 3. Webhook / Payment Succeeded
       ▼
 ┌──────────────┐   BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE
 │  PostgreSQL  │   - Insert Booking Record
 │  (Prisma)    │   - Insert Ticket Records: UNIQUE(showtime_id, seat_id)
 └──────────────┘   COMMIT
       │
       │ 4. Evict Redis Hold & Dispatch Async Jobs (BullMQ)
       ▼
 [BullMQ Worker] ──> QR Code Generation, Push Notification, Email Receipt
```

---

### Invariant 1: Redis Atomic Seat Holds with TTL

- **Objective**: Prevent database connection bloat while guaranteeing that during seat selection, only one user can hold a specific seat at any instant.
- **Mechanism**:
  - Key Pattern: `hold:{showtimeId}:{seatId}`
  - Value: `JSON { userId, holdToken, createdAt, expiresAt }`
  - TTL (Time-To-Live): **600 seconds (10 minutes)**.
  - **Atomic Lua Script**: When a user attempts to hold $N$ seats (e.g. `[G12, G13]`), the request is evaluated atomically inside Redis using a Lua script. If *all* requested seats are free of active holds, keys are set with `EXPIRE 600`. If *any* seat is already held or booked, the script aborts without setting partial holds and returns the conflicting seat IDs.
- **Guarantee**: Check-and-set happens within single Redis execution thread. No two clients can ever receive confirmation for the same seat hold lease.

---

### Invariant 2: Database-Level Double-Booking Prevention

- **Objective**: Even if Redis crashes, restarts, or loses memory state, the database must physically reject duplicate ticket creation at the engine level.
- **Mechanism**:
  - Database Schema Constraint:
    ```sql
    CREATE TABLE tickets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id UUID NOT NULL REFERENCES bookings(id),
        showtime_id UUID NOT NULL REFERENCES showtimes(id),
        seat_id UUID NOT NULL REFERENCES seats(id),
        status VARCHAR(20) NOT NULL, -- 'CONFIRMED', 'CANCELLED'
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_showtime_seat UNIQUE (showtime_id, seat_id)
    );
    ```
  - **Unique Composite Constraint**: `UNIQUE (showtime_id, seat_id)` guarantees at the B-tree index level that two active tickets for the same seat in the same showtime cannot exist simultaneously.
  - **Transactional Isolation**: Final booking execution runs in an ACID transaction:
    ```sql
    BEGIN;
    -- Verifies no ticket exists and inserts within transaction lock
    INSERT INTO tickets (booking_id, showtime_id, seat_id, status)
    VALUES ($booking_id, $showtime_id, $seat_id, 'CONFIRMED');
    COMMIT;
    ```
- **Guarantee**: If a race condition bypasses Redis, PostgreSQL throws constraint violation `23505 (unique_violation)`. The application catches this error and rejects the second transaction cleanly.

---

### Invariant 3: Payment Idempotency

- **Objective**: Prevent duplicate charges or duplicate booking records caused by network timeouts, client retries, or double taps on the mobile client.
- **Mechanism**:
  - Every checkout request must supply an HTTP Header:
    ```
    Idempotency-Key: <UUID-v4>
    ```
  - Backend maintains an `idempotency_keys` table in PostgreSQL:
    ```sql
    CREATE TABLE idempotency_keys (
        key VARCHAR(255) PRIMARY KEY,
        user_id UUID NOT NULL,
        request_path VARCHAR(255) NOT NULL,
        request_hash VARCHAR(64) NOT NULL,
        status VARCHAR(30) NOT NULL, -- 'IN_PROGRESS', 'COMPLETED', 'FAILED'
        response_code INTEGER,
        response_body JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    ```
  - Workflow:
    1. On incoming checkout, backend attempts an atomic insert into `idempotency_keys` with status `IN_PROGRESS`.
    2. If key exists with status `IN_PROGRESS`, return `409 Conflict: Request currently processing`.
    3. If key exists with status `COMPLETED`, return the cached `response_code` and `response_body` immediately without re-charging or re-booking.
    4. Once checkout finishes, status is updated to `COMPLETED` alongside response payload.

---

### Invariant 4: Verified Webhooks

- **Objective**: Ensure that booking confirmations originating from asynchronous payment gateways are authentic, untampered, and processed exactly once.
- **Mechanism**:
  - **Cryptographic Signature Verification**: Every webhook payload from the test-mode payment provider is validated against a shared webhook secret using HMAC-SHA256 before processing.
  - **Replay Protection**: Webhook headers must include a timestamp; payloads older than 5 minutes are rejected.
  - **Idempotent Webhook Handler**: Webhook events contain unique event IDs (e.g. `evt_test_12345`). Processed event IDs are stored in a `processed_webhooks` table. Subsequent identical webhook deliveries are acknowledged with `200 OK` but skipped without redundant execution.

---

### Invariant 5: Recoverable Failures & Session Resilience

- **Objective**: Handle abrupt disconnections, app crashes, or gateway errors gracefully without stranding user seats or funds.
- **Mechanism**:
  - **Client Re-hydration**: If the mobile app crashes or is killed during checkout, upon relaunch it checks for active holds belonging to the user (`GET /api/v1/holds/active`). If an active hold is found with remaining TTL, the app restores the Checkout screen with accurate remaining time.
  - **Hold Expiry Cleanup**: If a user abandons checkout, Redis TTL automatically evicts keys after 600s. No manual garbage collection required.
  - **Payment Reconciliation**: If a payment succeeds at the provider but the client disconnects before receiving response:
    - Webhook handler reconciles the booking autonomously.
    - When client reconnects and queries `/api/v1/bookings/my-bookings`, the confirmed booking is present with its digital QR ticket.

---

### Invariant 6: Asynchronous Background Processing

- **Objective**: Keep the critical checkout path sub-second (< 300ms) by offloading non-critical operations to asynchronous workers.
- **Mechanism**:
  - Core synchronous transaction: Validate hold -> Process payment intent -> Write DB records -> Release Redis key -> Return `201 Created` with booking reference.
  - Asynchronous Worker (BullMQ + Redis):
    - **QR Code Cryptographic Signing**: Generation of high-density QR payload with cinema validation signature.
    - **Notification Delivery**: Push notifications and transactional email receipts with embedded calendar invites.
    - **Analytics & Metrics**: Asynchronous event ingestion for dashboard metrics.
- **Guarantee**: Checkout response time is not degraded by email SMTP latency or image generation.

---

## 3. Implementation Boundary Reminder

> [!NOTE]
> Per task constraints, **no booking logic, database migrations, or server endpoints are implemented in this phase**.
> These invariants serve as the formal architectural specification that will govern implementation in subsequent tasks.
