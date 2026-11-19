# Matinee Backend API & Database Service

The backend foundation and database architecture for the **Matinee Cinema Ticket Booking Platform**. Built with Node.js, Express 4, TypeScript, and Prisma ORM targeting PostgreSQL.

---

## 1. System Architecture & Objectives

Matinee bridges a high-performance Expo React Native mobile client with a resilient cinema reservation backend. The backend architecture enforces:

1. **ACID Transactional Finality**: Definitive ticket booking execution with PostgreSQL.
2. **Zero Double-Bookings**: Guaranteed at both the database level (via partial unique index `uq_active_showtime_seat`) and application level.
3. **Integer Kobo Accounting**: All monetary values are strictly tracked in integer kobo (minor units: 100 kobo = ₦1 NGN) to eliminate floating-point drift.
4. **Decoupled Application Lifecycle**: Express app instance creation is separated from network socket binding, enabling port-free unit/integration testing.
5. **Security & Data Minimization**: PCI-DSS compliant storage (strictly NO PAN, NO CVV stored). Centralized error handlers prevent credential or stack leakage.
6. **Hardened CORS Policy**: Strict origin whitelisting with credential protection; prevents arbitrary origin reflection while preserving native mobile app access.
7. **Offline Migration Workflow**: Complete PostgreSQL DDL generated and extended with database-level triggers and partial indexes without requiring a live database.
8. **Reproducible Idempotent Seeding**: Standalone seed script matching the 320-seat Lagos cinema layout and mobile test fixtures.

---

## 2. Directory & File Layout

```
server/
├── prisma/
│   ├── migrations/
│   │   └── 0_init/
│   │       └── migration.sql   # Offline PostgreSQL DDL with custom constraints & triggers
│   ├── schema.prisma           # Relational schema (11 models, 12 enums, PostgreSQL)
│   └── seed.ts                 # Idempotent seed script (320 seats, 4 cinemas, demo bookings)
├── src/
│   ├── config/
│   │   └── env.ts              # Zod-validated environment configuration
│   ├── controllers/
│   │   └── healthController.ts # Public service health probe controller
│   ├── middleware/
│   │   ├── errorHandler.ts     # Centralized error handler & AppError abstraction
│   │   ├── notFoundHandler.ts  # 404 handler for unknown routes
│   │   └── validate.ts         # Zod schema validation middleware factory
│   ├── routes/
│   │   ├── health.ts           # GET /health probe router
│   │   └── index.ts            # Root API v1 router (/api/v1)
│   ├── app.ts                  # Express application factory & CORS pipeline
│   └── index.ts                # Server entry point with graceful shutdown
├── tests/
│   ├── helpers/
│   │   └── testRequest.ts      # Port-free in-memory HTTP test harness
│   ├── config.test.ts          # Environment parsing & validation tests
│   ├── cors.test.ts            # Whitelist, mobile, and disallowed origin CORS tests
│   ├── error.test.ts           # 404, AppError, and Zod middleware tests
│   └── health.test.ts          # Public health endpoint invariant tests
├── .env.example                # Documented configuration template
├── .gitignore                  # Exclusion rules (node_modules, dist, .env)
├── package.json                # Scripts, prisma.seed entry, & verified dependencies
├── tsconfig.json               # TypeScript ES2022 / NodeNext configuration
├── vitest.config.ts            # Test runner configuration
└── README.md                   # This documentation
```

---

## 3. Installation & Getting Started

### Prerequisites
- Node.js `v20.x` or `v24.x` (verified on Node `v24.16.0`)
- npm `v10.x`+

### Setup Commands

```bash
# 1. Navigate to server directory
cd server

# 2. Copy environment variables template
cp .env.example .env

# 3. Install dependencies
npm install

# 4. Validate Prisma schema
npm run prisma:validate

# 5. Generate Prisma Client
npm run prisma:generate

# 6. Run automated test suite (17/17 passing)
npm test

# 7. Typecheck & build
npm run typecheck
npm run build

# 8. Start development server (with auto-reload)
npm run dev
```

---

## 4. Environment Variables Reference

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Enum (`development` / `production` / `test`) | `development` | Runtime environment mode |
| `PORT` | Integer | `4000` | Port for the HTTP listener |
| `API_PREFIX` | String | `/api/v1` | URL mount prefix for all routes |
| `CORS_ORIGIN` | String | `http://localhost:3000,http://localhost:8081` | Comma-separated allowed origins (explicit whitelist) |
| `DATABASE_URL` | String (URL) | `postgresql://...` | PostgreSQL connection string (Neon pooled endpoint in prod) |
| `REDIS_URL` | String (URL) | `redis://localhost:6379` | Redis connection URL for hold engine |
| `JWT_SECRET` | String (min 16 chars) | `...` | Secret for customer session tokens |
| `JWT_EXPIRES_IN`| String | `7d` | Token expiration duration |
| `TMDB_API_KEY` | String | `placeholder` | The Movie Database v3 API key |
| `TMDB_ACCESS_TOKEN` | String | `placeholder` | TMDB v4 read-access bearer token |
| `TMDB_BASE_URL` | String (URL) | `https://api.themoviedb.org/3` | Upstream TMDB REST endpoint |
| `TMDB_IMAGE_BASE_URL` | String (URL) | `https://image.tmdb.org/t/p` | Upstream TMDB CDN base |
| `PAYMENT_PROVIDER` | String | `TEST_GATEWAY` | Active payment provider descriptor |
| `PAYMENT_TEST_SECRET_KEY` | String | `placeholder` | Test-mode secret key |
| `PAYMENT_WEBHOOK_SECRET` | String | `placeholder` | Webhook HMAC cryptographic verification secret |

---

## 5. Security & CORS Architecture

### Controlled Cross-Origin Resource Sharing (CORS)
In production, enabling `credentials: true` alongside wildcard reflection is a severe vulnerability. The backend implements a hardened policy via `isOriginAllowed()`:
1. **Native Mobile App Access**: Requests originating from the native React Native / Expo application, server-to-server calls, CLI scripts, and curl send **no `Origin` header** (`origin === undefined`). These are always permitted.
2. **Explicit Whitelist Matching**: When a browser sends an `Origin` header, it is checked against `CORS_ORIGIN` (case-insensitively).
3. **No Arbitrary Origin Reflection**: If an origin is not in the whitelist, the middleware calls `callback(null, false)`, omitting the `Access-Control-Allow-Origin` header so browsers block cross-origin script access.
4. **Wildcard Disallowance**: Wildcard `*` is explicitly disabled when credentials are enabled.

---

## 6. Cascade Deletion Audit & Retention Semantics

A critical security and accounting audit was performed on all entity relations:

| Relation | Foreign Key | Policy | Architectural Rationale |
| :--- | :--- | :--- | :--- |
| `Booking -> Ticket` | `bookingId` | **`onDelete: Restrict`** | **CRITICAL**: Bookings must NEVER cascade-delete tickets. Deleting a booking record would destroy financial ledger history, price audit trails, ticket QR codes, and active seat allocation tracking. Cancellations must be performed via soft-status transitions (`BookingStatus.CANCELLED`, `TicketStatus.CANCELLED`). |
| `Booking -> PaymentAttempt` | `bookingId` | **`onDelete: Restrict`** | **CRITICAL**: Payment audit transactions must NEVER be deleted. They are permanent financial transaction records for reconciliation and fraud auditing. |
| `Showtime -> Booking` | `showtimeId` | **`onDelete: Restrict`** | A showtime cannot be deleted if customer bookings exist. |
| `Showtime -> Ticket` | `showtimeId` | **`onDelete: Restrict`** | A showtime cannot be deleted if tickets have been issued. |
| `Seat -> Ticket` | `seatId` | **`onDelete: Restrict`** | A physical seat cannot be dropped if tickets reference it. |
| `Movie -> Showtime` | `movieId` | **`onDelete: Restrict`** | A catalog movie cannot be deleted if screenings are scheduled. |
| `Auditorium -> Showtime` | `auditoriumId` | **`onDelete: Restrict`** | An auditorium cannot be dropped if showtimes are attached. |
| `Cinema -> Auditorium` | `cinemaId` | **`onDelete: Cascade`** | Venue hierarchy template deletion in dev/staging. If showtimes exist, the `Showtime -> Auditorium` `Restrict` policy prevents accidental deletion. |
| `Auditorium -> Seat` | `auditoriumId` | **`onDelete: Cascade`** | Allows dropping an un-booked auditorium with its 320 seats cleanly without orphaned seats. Once tickets exist, `Seat -> Ticket` `Restrict` protects the seats. |
| `Seat -> Seat` (Couple pair) | `couplePartnerId` | **`onDelete: SetNull`** | Self-relation for couple pair pods. |

---

## 7. Ticket Status Lifecycle & Resale Rules

To prevent inventory errors and unauthorized resale of tickets, financial refund states are decoupled from inventory release states:

| Status | In `uq_active_showtime_seat`? | Inventory State | Business Semantic |
| :--- | :---: | :--- | :--- |
| `PENDING_PAYMENT` | **YES** | **Blocked** | Active checkout hold session (TTL). Prevents double-booking. |
| `CONFIRMED` | **YES** | **Blocked** | Valid, paid ticket. Prevents double-booking. |
| `CHECKED_IN` | **YES** | **Blocked** | Scanned at cinema entrance gate. |
| `CANCELLED` | NO | **Released** | Reservation was cancelled before payment or expired. Seat is released back to inventory for others to book. |
| `REFUNDED_RELEASED` | NO | **Released** | Customer refunded before cutoff / showtime cancelled by cinema with seats explicitly made available for resale. |
| `REFUNDED_RESTRICTED` | **YES** | **Blocked** | Customer refunded after showtime, during dispute, or due to a defective physical seat (e.g. broken recliner). **The seat remains strictly BLOCKED** at database level so it cannot be resold. |

---

## 8. Offline Migration Plan & Database Constraints

The initial database migration (`prisma/migrations/0_init/migration.sql`) was generated entirely offline using `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` and extended with native PostgreSQL constraints:

### Custom Database Constraints Added
1. **Active Allocation Partial Unique Index**:
   ```sql
   CREATE UNIQUE INDEX "uq_active_showtime_seat"
   ON "tickets" ("showtime_id", "seat_id")
   WHERE "status" IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'REFUNDED_RESTRICTED');
   ```
2. **Booking Seat Count Limit Check (1–8 Seats)**:
   ```sql
   ALTER TABLE "bookings"
   ADD CONSTRAINT "chk_booking_seat_count"
   CHECK ("seat_count" >= 1 AND "seat_count" <= 8);
   ```
3. **Cross-Table Auditorium Consistency Trigger**:
   ```sql
   CREATE OR REPLACE FUNCTION verify_ticket_auditorium()
   RETURNS TRIGGER AS $$
   DECLARE
       v_showtime_auditorium_id TEXT;
       v_seat_auditorium_id TEXT;
   BEGIN
       SELECT "auditorium_id" INTO v_showtime_auditorium_id
       FROM "showtimes" WHERE "id" = NEW."showtime_id";

       SELECT "auditorium_id" INTO v_seat_auditorium_id
       FROM "seats" WHERE "id" = NEW."seat_id";

       IF v_showtime_auditorium_id IS NULL OR v_seat_auditorium_id IS NULL THEN
           RAISE EXCEPTION 'Showtime % or Seat % does not exist', NEW."showtime_id", NEW."seat_id";
       END IF;

       IF v_showtime_auditorium_id <> v_seat_auditorium_id THEN
           RAISE EXCEPTION 'Auditorium mismatch: Showtime % is in auditorium % but Seat % is in auditorium %',
               NEW."showtime_id", v_showtime_auditorium_id, NEW."seat_id", v_seat_auditorium_id;
       END IF;

       RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;

   CREATE TRIGGER "trg_verify_ticket_auditorium"
   BEFORE INSERT OR UPDATE ON "tickets"
   FOR EACH ROW
   EXECUTE FUNCTION verify_ticket_auditorium();
   ```
4. **Monetary Non-Negativity Checks**:
   ```sql
   ALTER TABLE "bookings" ADD CONSTRAINT "chk_booking_total_non_negative"
   CHECK ("subtotal_kobo" >= 0 AND "booking_fee_kobo" >= 0 AND "total_kobo" >= 0);

   ALTER TABLE "tickets" ADD CONSTRAINT "chk_ticket_price_positive"
   CHECK ("price_kobo" >= 0);

   ALTER TABLE "payment_attempts" ADD CONSTRAINT "chk_payment_amount_positive"
   CHECK ("amount_kobo" >= 0);
   ```

### Safe Deployment to Production / Staging
When a dedicated PostgreSQL database is provisioned:
```bash
# Apply pending migrations safely in CI/CD or production
npx prisma migrate deploy
```
*(Never use `prisma db push` in production as it bypasses migration history and may cause data loss).*

---

## 9. Seed Data Architecture (`prisma/seed.ts`)

The seed script is registered via `"prisma": { "seed": "tsx prisma/seed.ts" }` in `package.json`.

### Physical Seating Layout (Exact Mobile Agreement)
- **Rows**: 20 rows A through V, strictly omitting letters 'I' and 'O' (`['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V']`).
- **Columns**: 16 columns per row (20 × 16 = 320 seats total).
- **Tiers**:
  - **Accessible (4 seats)**: Row A, columns 1, 2, 15, 16 (`isAccessible: true`).
  - **Standard (140 seats)**: Row A, columns 3–14 (12 companion seats) + Rows B–J (8 rows × 16 cols = 128 seats).
  - **VIP Recliner (112 seats)**: Rows K–R (7 rows × 16 cols).
  - **Couple Lounger (64 seats / 32 pair pods)**: Rows S–V (4 rows × 16 cols). Coupled atomically via `couplePartnerId`.
  - **Total**: 4 + 140 + 112 + 64 = **320 seats**.

### Seed Entities
- **4 Lagos Cinemas**: Filmhouse IMAX Lekki, Genesis Deluxe Palms, EbonyLife VI, Silverbird Ikeja.
- **Movies**: Dune: Part Two, Interstellar, Oppenheimer, Deadpool & Wolverine.
- **Showtimes**: Dune: Part Two at 14:30 and 17:45 with approved kobo tier pricing.
- **Demo Data**: Clearly labelled with `[DEMO]` and `DEMO-` prefixes:
  - `DEMO-MAT-8942-X7`: Confirmed booking with sold tickets for E7 and E8.
  - `DEMO-MAT-CANC-01`: Cancelled booking demonstrating inventory release (`TicketStatus.CANCELLED`).
  - `DEMO-MAT-REFD-01`: Refunded booking demonstrating inventory retention (`TicketStatus.REFUNDED_RESTRICTED`).
