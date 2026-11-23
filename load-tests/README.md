# Matinee Concurrency & Load-Testing Harness (k6)
## Part 2.4 Mobile Task B — 500-Virtual-User Contention Scenario

---

### 1. Overview & Purpose

This directory contains the automated **k6** load-testing harness for the Matinee cinema booking platform, built specifically to fulfill **Part 2.4 Mobile Task B (Graduation Requirement #16)**:

> *"500 virtual users competing for the same 50 seats, demonstrating zero double-bookings, response times, and error rates."*

---

### 2. Dual-Layer Defense Architecture Tested

The load-test harness verifies the two independent layers protecting Matinee against flash-demand ticket overbooking:

```
┌────────────────────────────────────────────────────────────────────────┐
│  Layer 1: Redis In-Memory Hold Leases (Fast Contention Gate)           │
│  - Endpoint: POST /api/v1/holds                                        │
│  - Mechanism: Atomic Lua script executing SET NX EX 600                │
│  - Fail-Closed Policy: If Redis is unreachable, backend returns 503    │
│    (HOLD_SERVICE_UNAVAILABLE) to prevent uncoordinated local holds    │
│  - Expected Outcome: Exactly 50 VUs win holds; ~450 losers receive     │
│    HTTP 409 (SEAT_HOLD_CONFLICT) without touching database storage     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Hold Winners Only)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Layer 2: PostgreSQL Partial Unique Index (Storage Safety Net)         │
│  - Endpoint: POST /api/v1/bookings (with X-Hold-Token header)          │
│  - Mechanism: Index uq_active_showtime_seat ON tickets(showtime, seat) │
│    WHERE status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', ...) │
│  - Expected Outcome: 50 winning holds transition to PENDING bookings;  │
│    any theoretical duplicate is rejected by PostgreSQL with P2002     │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 3. Critical Architectural Distinctions

To ensure honest engineering assessment, the load test distinguishes three distinct phases:

1. **Hold Contention**: The temporary 10-minute seat lock in Redis. Does not create permanent tickets or process money.
2. **Confirmed Booking Uniqueness**: The transactional creation of `Booking` (status `PENDING`) and `Ticket` (status `PENDING_PAYMENT`) records in PostgreSQL, protected by the partial unique index.
3. **Payment & Ticket Issuance**: The webhook settlement (Paystack) transitioning tickets to `CONFIRMED` and generating cryptographic `qrPayload` data.

---

### 4. Strict Safety Guardrails & Preconditions

> [!CAUTION]
> **STRICT SAFETY INVARIANT**:
> **NEVER execute this 500-VU load test against the production environment or the protected Neon main database branch (`br-small-frog-bjztb5yj`)!**

The harness enforces strict fail-closed safety checks:
1. **`MATINEE_ALLOW_LOAD_TEST=true`**: Required flag confirming test authorization.
2. **`CONFIRM_DISPOSABLE_DATABASE=true`**: Required flag confirming target database is a disposable test branch.
3. **`DISPOSABLE_ENV_ID`**: Required staging identifier (rejects `main`, `prod`, `production`, `br-small-frog-bjztb5yj`).
4. **Production URL Blocklist**: Automatically aborts if `BASE_URL` contains `neon.tech`, `production`, `prod.`, `matinee.ng`, or `api.matinee.com`.
5. **No Placeholder UUIDs**: Aborts if `SHOWTIME_ID` or fixture `seatIds` contain placeholder UUIDs (`11111111-...` or `00000000-...`).
6. **Mandatory Post-Test Audit**: Requires running `load-tests/audit.sql` to verify that active ticket allocations in PostgreSQL match expectations and have zero duplicates.

---

### 5. Prerequisites & k6 Installation

k6 is required to execute this load test. If k6 is not installed on your system:

- **Windows (Chocolatey)**: `choco install k6`
- **Windows (Winget)**: `winget install k6 --source winget`
- **macOS (Homebrew)**: `brew install k6`
- **Linux (Debian/Ubuntu)**:
  ```bash
  sudo gpg -k
  sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
  echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
  sudo apt-get update && sudo apt-get install k6
  ```

---

### 6. Executing the Load Test (Step-by-Step)

Follow the complete step-by-step procedure detailed in [STAGING_RUNBOOK.md](file:///c:/Users/USER/matinee-mobile/load-tests/STAGING_RUNBOOK.md):

#### Step 1: Pre-Run Database Verification
Run Section 1 and Section 2 of `load-tests/audit.sql` to verify database branch identity and generate `load-tests/fixtures/seats.staging.json` containing 50 real seat UUIDs.

#### Step 2: Configure Environment Variables & Run

```powershell
# PowerShell (Windows)
$env:MATINEE_ALLOW_LOAD_TEST="true"
$env:CONFIRM_DISPOSABLE_DATABASE="true"
$env:DISPOSABLE_ENV_ID="staging-run-01"
$env:BASE_URL="https://staging-api.matinee.internal"
$env:SHOWTIME_ID="<real-staging-showtime-uuid>"
$env:SEAT_FIXTURE_PATH="./fixtures/seats.staging.json"
$env:VUS="500"

k6 run load-tests/concurrency_500_vu.js
```

```bash
# Bash (Linux / macOS)
export MATINEE_ALLOW_LOAD_TEST="true"
export CONFIRM_DISPOSABLE_DATABASE="true"
export DISPOSABLE_ENV_ID="staging-run-01"
export BASE_URL="https://staging-api.matinee.internal"
export SHOWTIME_ID="<real-staging-showtime-uuid>"
export SEAT_FIXTURE_PATH="./fixtures/seats.staging.json"
export VUS="500"

k6 run load-tests/concurrency_500_vu.js
```

#### Step 3: Mandatory Post-Run Database Audit
Run Section 4 of `load-tests/audit.sql` directly against PostgreSQL to confirm zero duplicate active tickets exist for the showtime.

---

### 7. Target Pass / Fail / Incomplete Criteria

| Metric | Target | Rationale |
|---|---|---|
| **Duplicate Allocations** | **Strictly 0** | Core graduation concurrency requirement. |
| **Successful Holds** | **Exactly 50** | All 50 contested seats held (empty runs flagged `INCOMPLETE`). |
| **Successful Bookings** | **Exactly 50** | All 50 held seats converted to `PENDING` bookings. |
| **Clean Conflicts** | **$\approx 450$** | Losing VUs receive clean HTTP 409 without server crashes. |
| **Unexpected 5xx Errors** | **Strictly 0** | Zero unhandled exceptions or connection crashes. |
| **Service Down 503s** | **Strictly 0** | Proves Redis remained healthy under 500-concurrency burst. |
| **Rate-Limited 429s** | **0** | Confirms rate-limiting did not starve the contention test. |
| **p95 Request Duration** | **$< 1,000\text{ ms}$** | Target SLO under sudden 500-VU spike. |

---

### 8. Output Artifacts

Upon completion, the test generates:
1. **Console Terminal Report**: Standard k6 summary with custom metrics and explicit verdict.
2. **`load-tests/summary.json`**: Machine-readable JSON output for automated CI/CD evaluation and graduation demo evidence.
3. **Database Audit Evidence**: Output of `load-tests/audit.sql` confirming zero database duplicate active tickets.
