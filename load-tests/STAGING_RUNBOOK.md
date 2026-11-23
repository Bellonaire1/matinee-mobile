# Matinee: Staging Deployment & 500-VU Load-Test Execution Runbook
## Milestone M05.10A — Disposable Staging Architecture & Concurrency Verification

---

### Executive Overview & Strict Safety Preconditions

> [!CAUTION]
> **ABSOLUTE SAFETY GATE — PROTECTED NEON MAIN BRANCH**:
> - **Neon Project Name**: `gentle-sound-76994085`
> - **Protected Production Branch**: `main` (Branch ID: `br-small-frog-bjztb5yj`)
> - **MANDATORY INVARIANT**: **NEVER under any circumstances run load tests, synthetic traffic, seed scripts, or schema migrations against `br-small-frog-bjztb5yj`!**
> - The load test must execute **only** against a disposable, temporary Neon database branch created specifically for the test and deleted immediately afterward.

---

### Section A: Disposable Neon PostgreSQL Branch & Independent Verification

#### 1. Branch Creation
Create an isolated, disposable branch from `main`:
- **Via Neon Console**: Go to project `gentle-sound-76994085` -> Branches -> **Create Branch**
  - Branch Name: `staging-loadtest-01`
  - Parent Branch: `main`
  - Compute: Shared / Autoscaling (0.25 CU to 1 CU)
- **Via Neon CLI** (if installed):
  ```bash
  neon branches create --name staging-loadtest-01 --project-id gentle-sound-76994085
  ```

#### 2. Independent Provider-Side Verification
Before configuring the backend or running migrations, the operator must independently verify provider metadata:
1. In the Neon Console, navigate to **Branches** -> `staging-loadtest-01`.
2. Inspect the **Compute Details** / **Connection Details** panel.
3. Identify the Compute Endpoint hostname (e.g. `ep-disposable-staging-987654-pooler.us-east-2.aws.neon.tech`).
4. **Mandatory Safety Check**:
   - Verify that the endpoint prefix is **NOT** `ep-small-frog`.
   - Verify that the branch ID is **NOT** `br-small-frog-bjztb5yj`.
   - Verify that the project ID is confirmed (the preferred long-term target is a dedicated empty staging project).
5. Extract the unique endpoint prefix: e.g. `ep-disposable-staging-987654`.

#### 3. Connection String Acquisition & Fail-Closed Guard
Retrieve the pooled connection string (`-pooler` endpoint) for `staging-loadtest-01`:
```
postgresql://[user]:[password]@ep-[unique-endpoint]-pooler.[region].aws.neon.tech/matinee_db?sslmode=require&pgbouncer=true
```

**Automated Backend Startup Gate (`server/src/config/databaseIsolation.ts`)**:
- Setting `APP_ENV=staging`, `STAGING_ENV_ID=staging-run-01`, and `EXPECTED_NEON_BRANCH_ENDPOINT=ep-[unique-endpoint]` activates the fail-closed startup gate.
- The server checks these invariants **before** calling `app.listen()`. If any check fails, the process immediately exits with code 1 without opening the HTTP port.

---

### Section B: Dedicated Staging Redis Instance

#### 1. Redis Protocol Requirement (RESP via TCP)
The Matinee backend utilizes **`ioredis`** (`server/src/services/redis/ioredisClient.ts`):
```typescript
new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 2000, lazyConnect: true, enableOfflineQueue: false })
```
- **CRITICAL PROTOCOL INVARIANT**: The Redis service **must** support the standard Redis serialization protocol (RESP) over TCP (`redis://` or `rediss://`).
- **INCOMPATIBILITY WARNING**: HTTP-only REST APIs (such as Upstash REST API `https://...`) are **strictly incompatible** with `ioredis`. If using Upstash, you must use their standard Redis TCP connection string (`rediss://default:[password]@[endpoint]:6379`).

#### 2. Candidate Staging Redis Providers & Free-Tier Performance Constraints
> [!WARNING]
> **Free-Tier Performance Constraints for 500-VU Tests**:
> Free tiers often enforce strict concurrency limits, command-per-second throttling, and connection caps (e.g., Upstash free tier limits daily commands and concurrent TCP connections; Redis Cloud free tier has memory/connection caps). A high-concurrency burst of 500 VUs may saturate free-tier connection pools or trigger provider-level rate limits (resulting in false 503/timeout readings). Ensure selected tier supports at least 500 concurrent connections or connection pooling before running.

| Provider | Protocol Supported | Staging Plan / Limitations | Account / Approval Requirements |
|---|---|---|---|
| **Upstash Redis** | Standard TCP (`rediss://...`) on port 6379 | Free tier (10,000 commands/day, 256MB). TLS enabled. | Free account at upstash.com. Explicit user approval required to create database. |
| **Redis Cloud (Redis Ltd.)** | Standard TCP (`redis://...` / `rediss://...`) | 30MB free tier. Standard Redis 7.2. | Free account at redis.com. Explicit user approval required. |
| **Aiven for Redis** | Standard TCP (`rediss://...`) | Free trial available. Dedicated compute. | Account at aiven.io. Explicit user approval required. |
| **Railway Redis** | Standard TCP (`redis://...`) | Ephemeral / credit-based usage. Low latency. | Account at railway.app. Explicit user approval required. |

*Note on Costs*: Free tiers exist across providers, but pricing and billing terms vary based on duration, active usage, and provider rate policies at time of provisioning. Actual costs should be verified on the provider's pricing page prior to provisioning. Provisioning any cloud resource requires explicit user approval and is strictly out of scope for preparation tasks.

---

### Section C: Dedicated Backend Deployment

#### 1. Candidate Staging Hosts
- **Candidate 1: Render Web Service** ([render.com](https://render.com))
  - Native GitHub integration with `Bellonaire1/matinee-mobile`.
  - Supports subdirectory builds (`server/`).
  - Supports custom environment variables and secret management.
  - Automatically provisions public HTTPS endpoint (e.g. `https://matinee-backend-staging.onrender.com`).
  - *Free-Tier Caveat*: Free instances on Render spin down after 15 minutes of inactivity and take 50+ seconds to cold start; they are constrained to 512MB RAM and shared CPU, which may bottleneck under 500 concurrent VUs. A paid/starter instance or dedicated local staging runner may be preferred for load testing.
- **Candidate 2: Railway** ([railway.app](https://railway.app))
  - Fast container builds from repository root or subdirectory.
  - Generates instant public domain.
  - Less aggressive cold starts; usage billed against account credit.
- **Candidate 3: Fly.io** ([fly.io](https://fly.io))
  - Dockerfile-based deployment with global edge routing.
  - Good raw performance for burst traffic.

#### 2. Render Build & Start Configuration (If Render Selected)
- **Root Directory**: `server`
- **Environment**: Node
- **Build Command**:
  ```bash
  npm install && npx prisma generate && npm run build
  ```
- **Start Command**:
  ```bash
  npm run start
  ```
- **Pricing & Approvals**: Do not rely on speculative fixed $0 or hourly cost figures; cost depends on provider tier, compute instance size, and active runtime duration. Provisioning any cloud host requires explicit user approval and is strictly out of scope for this task.

---

### Section D: Environment Variables & Secret Handling

Configure these variables in the staging service environment settings (NEVER commit secrets to Git):

```bash
# Node Runtime & Deployment Mode (MANDATORY: APP_ENV=staging must be explicit)
NODE_ENV=production
APP_ENV=staging
PORT=4000
API_PREFIX=/api/v1

# Staging Identity & Database Isolation Gates (MANDATORY IN STAGING)
STAGING_ENV_ID=staging-run-01
EXPECTED_NEON_BRANCH_ENDPOINT=ep-[unique-staging-endpoint-prefix]
STAGING_VERIFY_DISPOSABLE_DB=true

# Staging CORS: allow mobile app and testing harnesses
CORS_ORIGIN=http://localhost:3000,http://localhost:8081,https://staging-app.matinee.internal

# PostgreSQL Connection (points strictly to disposable Neon branch matching EXPECTED_NEON_BRANCH_ENDPOINT)
DATABASE_URL=postgresql://[user]:[password]@ep-[unique-staging-endpoint-prefix]-pooler.[region].aws.neon.tech/matinee_db?sslmode=require&pgbouncer=true

# Redis Connection (points strictly to dedicated staging Redis via standard TCP RESP)
REDIS_URL=rediss://default:[password]@[staging-redis-endpoint]:6379

# JWT & Auth Secrets (staging placeholders)
JWT_SECRET=staging-jwt-secret-do-not-use-in-production-min-16-chars
JWT_EXPIRES_IN=7d

# TMDB Proxy (optional for hold/booking load test)
TMDB_API_KEY=placeholder_tmdb_api_key
TMDB_ACCESS_TOKEN=placeholder_tmdb_access_token

# Payment Safety Gate (STRICTLY DISABLED IN STAGING)
PAYMENT_ENABLED=false
PAYMENT_PROVIDER=TEST_GATEWAY
```

---

### Section E: Database Migration & Synthetic Test-Data Preparation

#### 1. Synthetic Test-Data Requirements
> [!IMPORTANT]
> - **Zero Production PII / Real Data**: Real customer information, production ticket records, and real payment references must **never** be imported into staging.
> - **Isolated Synthetic Fixtures**: Staging must be populated exclusively with synthetic fixtures: one test cinema, one synthetic reference auditorium, one dedicated test showtime, and 320 synthetic seat entities.
> - **Target Isolation**: The preferred long-term isolation target is a separate, dedicated empty Neon project for staging. When using a branch within `gentle-sound-76994085`, verify it is a disposable branch and never the main branch.

#### 2. Migration Execution
Execute from an authorized local machine or CI/CD worker targeting the **disposable branch**:

```bash
# 1. Set staging database URL temporarily in shell (DO NOT touch server/.env)
export DATABASE_URL="postgresql://[user]:[password]@ep-[staging-pooler].[region].aws.neon.tech/matinee_db?sslmode=require"

# 2. Deploy baseline migrations to disposable branch
npx --prefix server prisma migrate deploy

# 3. Seed synthetic test cinema, auditorium, showtime, and 320 physical seats
# (Run dedicated staging seed script or insert via SQL)
```

---

### Section F: 50 Legitimate Staging Seat IDs

1. Open `load-tests/audit.sql`.
2. Connect to the disposable database via `psql`:
   ```bash
   psql "$DATABASE_URL" -f load-tests/audit.sql
   ```
3. Run Section 2 of `load-tests/audit.sql` specifying the test showtime UUID.
4. Copy the JSON output into `load-tests/fixtures/seats.staging.json`.
5. Verify that `seats.staging.json` contains:
   - Real showtime UUID (not `11111111-...`)
   - Exactly 50 unique seat UUIDs (not `00000000-...`)

---

### Section G: Read-Only Pre/Post-Run Database Verification

#### Pre-Run Verification (Before k6)
Run Section 1 and Section 3 of `load-tests/audit.sql`:
- Verify database branch identity:
  ```sql
  SELECT current_database(), current_user, inet_server_addr();
  ```
- Verify zero active tickets exist for the 50 seats on this showtime:
  ```sql
  SELECT COUNT(*) FROM tickets WHERE showtime_id = :showtime_id AND status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'REFUNDED_RESTRICTED');
  -- Expected: 0
  ```

#### Post-Run Verification (After k6)
Run Section 4 of `load-tests/audit.sql`:
- Critical duplicate detection:
  ```sql
  SELECT showtime_id, seat_id, COUNT(*) FROM tickets
  WHERE showtime_id = :showtime_id AND status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'REFUNDED_RESTRICTED')
  GROUP BY showtime_id, seat_id HAVING COUNT(*) > 1;
  -- MUST RETURN: ZERO ROWS
  ```
- Total active tickets count:
  ```sql
  SELECT status, COUNT(*) FROM tickets WHERE showtime_id = :showtime_id GROUP BY status;
  -- Expected: PENDING_PAYMENT = 50
  ```

---

### Section H: Startup Gate Refusal & Dual-Probe Verification

#### 1. Verifying Startup Refusal (Negative Safety Testing)
Operators should independently confirm that the fail-closed startup gate halts execution when misconfigured:
- **Test A: Missing Staging Endpoint**: Start backend with `APP_ENV=staging` but omit `EXPECTED_NEON_BRANCH_ENDPOINT`.
  - Expected: Process aborts immediately with code 1; logs `[Matinee Startup Guard] CRITICAL: Server startup aborted. STARTUP SAFETY REJECTION: Staging deployment requires EXPECTED_NEON_BRANCH_ENDPOINT...`
  - Port 4000 remains closed.
- **Test B: Protected Branch Injection**: Start backend with `DATABASE_URL` pointing to `ep-small-frog`.
  - Expected: Process aborts immediately with code 1; logs `STARTUP SAFETY VIOLATION: Target database points to protected Neon production main branch...`
  - Port 4000 remains closed.

#### 2. Liveness Probe (`GET /api/v1/health`)
Verifies the Express process is running and accepting HTTP requests:
```bash
curl -i https://[staging-backend-url]/api/v1/health
```
- **Expected Status**: `HTTP 200 OK`
- **Payload**: Confirms service name, uptime, and explicitly marks external subsystems as unconnected (non-blocking).

#### 3. Readiness Probe (`GET /api/v1/ready`)
Verifies live dependency connectivity and branch isolation:
```bash
curl -i https://[staging-backend-url]/api/v1/ready
```
- **Checks Executed**:
  1. PostgreSQL live read-only query: `SELECT 1` (bounded timeout $\le 2500$ ms).
  2. Redis live protocol ping: `PING -> PONG` (bounded timeout $\le 2500$ ms).
  3. Database isolation: rejects connections to protected Neon main branch (`br-small-frog-bjztb5yj` / `ep-small-frog`).
- **Expected Success Status**: `HTTP 200 OK`
  ```json
  {
    "ready": true,
    "status": "ready",
    "timestamp": "2026-...",
    "uptimeSeconds": 42,
    "checks": {
      "database": "healthy",
      "redis": "healthy"
    }
  }
  ```
- **Failure Status**: `HTTP 503 Service Unavailable` if either dependency is offline, unreachable, or points to the protected main branch. Sanitized diagnostics are returned without leaking credentials. k6 preflight `setup()` will automatically abort if HTTP 200 is not received.

---

### Section I: k6 Execution & Results Collection

Execute k6 with all mandatory safety flags:

```powershell
# PowerShell (Windows)
$env:MATINEE_ALLOW_LOAD_TEST="true"
$env:CONFIRM_DISPOSABLE_DATABASE="true"
$env:DISPOSABLE_ENV_ID="staging-run-01"
$env:BASE_URL="https://[staging-backend-url]"
$env:SHOWTIME_ID="[real-staging-showtime-uuid]"
$env:SEAT_FIXTURE_PATH="./fixtures/seats.staging.json"
$env:VUS="500"

k6 run load-tests/concurrency_500_vu.js
```

1. Inspect terminal report output.
2. Confirm `load-tests/summary.json` was generated.
3. Review metrics:
   - `successful_holds`: exactly 50
   - `successful_bookings`: exactly 50
   - `duplicate_seat_collisions`: strictly 0
   - `server_errors_5xx`: strictly 0
   - `service_unavailable_503`: strictly 0

---

### Section J: Resource Shutdown & Cleanup

Immediately after capturing test evidence:

1. **Delete Disposable Neon Branch**:
   - Go to Neon Console -> Branches -> `staging-loadtest-01` -> **Delete Branch**.
   - Guarantees zero residual database compute costs and prevents accidental reuse.
2. **Deprovision Staging Redis**:
   - Delete test Redis database on provider dashboard.
3. **Deprovision Backend Web Service**:
   - Delete or suspend staging Web Service on Render / Railway.
4. **Preserve Evidence**:
   - Commit `load-tests/summary.json` and post-run SQL audit log to the evidence register.
