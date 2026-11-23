# Matinee Concurrency & Load-Testing Harness (k6)
## Part 2.4 Mobile Task B — 500-Virtual-User Contention Scenario

---

### 1. Overview & Purpose

This directory contains the automated **k6** load-testing suite for the Matinee cinema booking platform, built specifically to fulfill **Part 2.4 Mobile Task B (Graduation Requirement #16)**:

> *"500 virtual users competing for the same 50 seats, demonstrating zero double-bookings, response times, and error rates."*

---

### 2. Dual-Layer Defense Architecture Tested

The load-test harness verifies the two independent layers protecting Matinee against flash-demand ticket overbooking:

```
┌────────────────────────────────────────────────────────────────────────┐
│  Layer 1: Redis In-Memory Hold Leases (Fast Contention Gate)           │
│  - Endpoint: POST /api/v1/holds                                        │
│  - Mechanism: Atomic Lua script executing SET NX EX 600                │
│  - Outcome: Exactly 50 VUs win holds; ~450 losers receive HTTP 409     │
│    (SEAT_HOLD_CONFLICT) within < 10ms without database overhead        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Hold Winners Only)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Layer 2: PostgreSQL Partial Unique Index (Storage Safety Net)         │
│  - Endpoint: POST /api/v1/bookings (with X-Hold-Token header)          │
│  - Mechanism: Index uq_active_showtime_seat ON tickets(showtime, seat) │
│    WHERE status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', ...) │
│  - Outcome: Even if a cache lease failed, the database rejects any     │
│    duplicate allocation with error code P2002 (HTTP 409)               │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 3. Critical Architectural Distinctions

To ensure honest engineering assessment, the load test distinguishes three distinct phases:

1. **Hold Contention**: The temporary 10-minute seat lock in Redis. Does not create permanent tickets or process money.
2. **Confirmed Booking Uniqueness**: The transactional creation of `Booking` (status `PENDING`) and `Ticket` (status `PENDING_PAYMENT`) records in PostgreSQL, protected by the partial unique index.
3. **Payment & Ticket Issuance**: The webhook settlement (Paystack) transitioning tickets to `CONFIRMED` and generating cryptographic `qrPayload` data.

---

### 4. Safety Guardrails & Preconditions

> [!CAUTION]
> **STRICT SAFETY INVARIANT**:
> **NEVER execute this 500-VU load test against the production environment or the protected Neon main database!**

The test harness enforces two mandatory safety checks:
1. **`MATINEE_ALLOW_LOAD_TEST=true`**: If this environment variable is missing, the script aborts immediately.
2. **Production URL Filter**: If `BASE_URL` contains `neon.tech`, `production`, `prod.`, `matinee.ng`, or `api.matinee.com`, the script aborts immediately.

---

### 5. Prerequisites & k6 Installation

k6 is required to execute this load test. If k6 is not installed on your system:

- **Windows (Chocolatey)**:
  ```powershell
  choco install k6
  ```
- **Windows (Winget)**:
  ```powershell
  winget install k6 --source winget
  ```
- **macOS (Homebrew)**:
  ```bash
  brew install k6
  ```
- **Linux (Debian/Ubuntu)**:
  ```bash
  sudo gpg -k
  sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
  echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
  sudo apt-get update && sudo apt-get install k6
  ```

---

### 6. Executing the Load Test

#### Step 1: Prepare Disposable Staging Environment
Deploy the backend to a disposable staging container or local environment connected to a disposable test database branch and test Redis instance. Ensure a test screening session exists with at least 50 available seats.

#### Step 2: Configure Environment Variables
Set the target parameters:

```powershell
# PowerShell (Windows)
$env:MATINEE_ALLOW_LOAD_TEST="true"
$env:BASE_URL="http://localhost:3000"
$env:SHOWTIME_ID="11111111-2222-3333-4444-555555555555"
$env:VUS="500"

k6 run load-tests/concurrency_500_vu.js
```

```bash
# Bash (Linux / macOS)
export MATINEE_ALLOW_LOAD_TEST="true"
export BASE_URL="https://staging-api.matinee.internal"
export SHOWTIME_ID="11111111-2222-3333-4444-555555555555"
export VUS="500"

k6 run load-tests/concurrency_500_vu.js
```

---

### 7. Target Pass / Fail Thresholds

| Metric | Target | Rationale |
|---|---|---|
| **Duplicate Allocations** | **Strictly 0** | Core graduation concurrency requirement. |
| **Successful Holds** | **$\le 50$** | Cannot exceed the 50 contested seats. |
| **Clean Conflicts** | **$\approx 450$** | Losing VUs receive clean HTTP 409 without server crashing. |
| **Unexpected 5xx Errors** | **Strictly 0** | Zero unhandled exceptions or connection crashes. |
| **p95 Request Duration** | **$< 1,000\text{ ms}$** | Responsive API even under sudden 500-user spike. |

---

### 8. Output Artifacts

Upon completion, the test generates:
1. **Console Terminal Report**: Standard k6 summary with custom metrics.
2. **`load-tests/summary.json`**: Machine-readable JSON output for automated CI/CD evaluation and graduation demo evidence.
