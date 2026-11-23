/**
 * Matinee: High-Concurrency 500-VU Seat Reservation Load-Test Harness
 *
 * SPECIFICATION (Bootcamp Final Graduation Task — Part 2.4 Mobile Task B):
 * - 500 Virtual Users (VUs) simultaneously competing for the same 50 seats.
 * - Proves zero double-booking invariant under extreme contention.
 * - Demonstrates dual-layer defense:
 *     Layer 1: Redis atomic Lua hold reservation (SET NX EX 600)
 *     Layer 2: PostgreSQL partial unique index (uq_active_showtime_seat) on active tickets
 * - Reports p95 latency, throughput, error rates, clean conflict rejections, and rate limits.
 *
 * SAFETY GUARDRAILS (STRICT FAIL-CLOSED POLICY):
 * - Requires explicit MATINEE_ALLOW_LOAD_TEST=true
 * - Requires explicit CONFIRM_DISPOSABLE_DATABASE=true
 * - Requires explicit non-production DISPOSABLE_ENV_ID
 * - Rejects all placeholder/example UUIDs (showtime and seats)
 * - Rejects any BASE_URL pointing to production or Neon main branches
 * - Requires independent post-run database verification via load-tests/audit.sql
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// ---------------------------------------------------------------------------
// 1. SAFETY PRECONDITIONS & DISPOSABLE ENVIRONMENT VALIDATION
// ---------------------------------------------------------------------------

const ALLOW_LOAD_TEST = __ENV.MATINEE_ALLOW_LOAD_TEST === 'true';
const CONFIRM_DISPOSABLE_DB = __ENV.CONFIRM_DISPOSABLE_DATABASE === 'true';
const DISPOSABLE_ENV_ID = (__ENV.DISPOSABLE_ENV_ID || '').trim();
const BASE_URL = (__ENV.BASE_URL || '').trim().replace(/\/+$/, '');
const SHOWTIME_ID = (__ENV.SHOWTIME_ID || '').trim();
const SEAT_FIXTURE_PATH = (__ENV.SEAT_FIXTURE_PATH || './fixtures/seats.staging.json').trim();
const TOTAL_VUS = parseInt(__ENV.VUS || '500', 10);
const CONTESTED_SEAT_COUNT = 50;

// Mandatory authorization flags
if (!ALLOW_LOAD_TEST) {
  throw new Error(
    '================================================================================\n' +
    'SAFETY BLOCK: MATINEE_ALLOW_LOAD_TEST=true is REQUIRED.\n' +
    'This safeguard prevents accidental execution without explicit engineer intent.\n' +
    '================================================================================'
  );
}

if (!CONFIRM_DISPOSABLE_DB) {
  throw new Error(
    '================================================================================\n' +
    'SAFETY BLOCK: CONFIRM_DISPOSABLE_DATABASE=true is REQUIRED.\n' +
    'You must explicitly confirm that the target backend connects to a DISPOSABLE\n' +
    'database branch, NEVER the protected Neon main branch (br-small-frog-bjztb5yj).\n' +
    '================================================================================'
  );
}

if (!DISPOSABLE_ENV_ID || DISPOSABLE_ENV_ID.length < 3) {
  throw new Error(
    '================================================================================\n' +
    'SAFETY BLOCK: DISPOSABLE_ENV_ID environment variable is missing or too short.\n' +
    'Specify a unique disposable environment identifier (e.g. DISPOSABLE_ENV_ID="staging-run-01").\n' +
    '================================================================================'
  );
}

const FORBIDDEN_ENV_NAMES = [
  'main',
  'prod',
  'production',
  'live',
  'br-small-frog-bjztb5yj',
  'gentle-sound-76994085',
  'default',
];

for (const forbidden of FORBIDDEN_ENV_NAMES) {
  if (DISPOSABLE_ENV_ID.toLowerCase().includes(forbidden)) {
    throw new Error(
      `SAFETY BLOCK: DISPOSABLE_ENV_ID contains forbidden keyword '${forbidden}'.\n` +
      'Load tests may NEVER target production or the protected main database branch.'
    );
  }
}

// Mandatory target URL validation
if (!BASE_URL) {
  throw new Error(
    'SAFETY BLOCK: BASE_URL is required (e.g. BASE_URL="https://staging-api.example.com").\n' +
    'Localhost or staging URLs must be explicitly passed and verified.'
  );
}

const FORBIDDEN_URL_PATTERNS = [
  'neon.tech',
  'production',
  'prod.',
  'matinee.ng',
  'api.matinee.com',
  'br-small-frog-bjztb5yj',
];

for (const pattern of FORBIDDEN_URL_PATTERNS) {
  if (BASE_URL.toLowerCase().includes(pattern)) {
    throw new Error(
      `SAFETY BLOCK: BASE_URL '${BASE_URL}' contains forbidden pattern '${pattern}'.\n` +
      'Load tests must run against a dedicated disposable staging host.'
    );
  }
}

// Reject placeholder showtime IDs
const KNOWN_PLACEHOLDER_SHOWTIMES = [
  '11111111-2222-3333-4444-555555555555',
  '00000000-0000-0000-0000-000000000000',
  'placeholder',
];

if (!SHOWTIME_ID || KNOWN_PLACEHOLDER_SHOWTIMES.includes(SHOWTIME_ID.toLowerCase())) {
  throw new Error(
    `SAFETY BLOCK: Invalid or placeholder SHOWTIME_ID: '${SHOWTIME_ID}'.\n` +
    'You must provide a real screening session UUID seeded in the disposable staging database.'
  );
}

// ---------------------------------------------------------------------------
// 2. LOAD & VALIDATE 50 CONTESTED SEAT FIXTURES
// ---------------------------------------------------------------------------

let seatIds = [];
try {
  const rawFixtures = open(SEAT_FIXTURE_PATH);
  const parsed = JSON.parse(rawFixtures);
  if (Array.isArray(parsed.seatIds)) {
    seatIds = parsed.seatIds;
  }
} catch (err) {
  throw new Error(
    `SAFETY BLOCK: Failed to load seat fixture from '${SEAT_FIXTURE_PATH}'.\n` +
    'Provide a valid JSON file containing exactly 50 unique seat UUIDs from the disposable database.'
  );
}

if (seatIds.length !== CONTESTED_SEAT_COUNT) {
  throw new Error(
    `SAFETY BLOCK: Fixture contains ${seatIds.length} seats. Exactly ${CONTESTED_SEAT_COUNT} seats are required.`
  );
}

// Ensure all 50 seat IDs are distinct
const uniqueSeatSet = new Set(seatIds);
if (uniqueSeatSet.size !== CONTESTED_SEAT_COUNT) {
  throw new Error(
    `SAFETY BLOCK: Fixture contains duplicate seat IDs (${uniqueSeatSet.size} unique / ${CONTESTED_SEAT_COUNT} total).`
  );
}

// Reject placeholder UUIDs in fixture
for (const seatId of seatIds) {
  if (
    typeof seatId !== 'string' ||
    seatId.startsWith('00000000-0000-0000-0000-') ||
    seatId.includes('placeholder')
  ) {
    throw new Error(
      `SAFETY BLOCK: Placeholder seat ID detected in fixture: '${seatId}'.\n` +
      'Generate a real 50-seat fixture from your disposable staging database using load-tests/audit.sql.'
    );
  }
}

// ---------------------------------------------------------------------------
// 3. METRICS DEFINITIONS (RIGOROUS CATEGORIZATION)
// ---------------------------------------------------------------------------

// Hold phase metrics
const successfulHolds = new Counter('successful_holds');
const conflictHoldContention = new Counter('conflict_hold_contention'); // Expected HTTP 409 SEAT_HOLD_CONFLICT
const conflictAlreadySold = new Counter('conflict_already_sold'); // Expected HTTP 409 SEAT_ALREADY_SOLD
const other409Conflicts = new Counter('other_409_conflicts');

// Infrastructure & overload metrics
const rateLimited429 = new Counter('rate_limited_429');
const serviceUnavailable503 = new Counter('service_unavailable_503'); // Redis failure / connection pool full
const serverErrors5xx = new Counter('server_errors_5xx'); // Unexpected 500/502/504
const clientErrors4xx = new Counter('client_errors_4xx'); // Unexpected 400/401/404

// Booking conversion metrics (Hold winners only)
const successfulBookings = new Counter('successful_bookings');
const duplicateSeatCollisions = new Counter('duplicate_seat_collisions'); // PostgreSQL P2002 collision on booking
const bookingFailures = new Counter('booking_failures');

// Latency distributions
const holdDuration = new Trend('hold_duration_ms', true);
const bookingDuration = new Trend('booking_duration_ms', true);

// ---------------------------------------------------------------------------
// 4. K6 SCENARIOS & THRESHOLDS CONFIGURATION
// ---------------------------------------------------------------------------

export const options = {
  scenarios: {
    contention_burst: {
      executor: 'per-vu-iterations',
      vus: TOTAL_VUS,
      iterations: 1,
      maxDuration: '60s',
    },
  },
  thresholds: {
    // Zero unexpected 5xx crashes
    server_errors_5xx: ['count==0'],
    // Zero Redis/service drops
    service_unavailable_503: ['count==0'],
    // Zero database double allocations (PostgreSQL P2002 duplicate collision)
    duplicate_seat_collisions: ['count==0'],
    // Successful holds cannot exceed the 50 contested seats
    successful_holds: [`count<=${CONTESTED_SEAT_COUNT}`],
    // Latency target: p95 under 1000ms under 500-concurrency spike
    http_req_duration: ['p(95)<1000'],
  },
};

// ---------------------------------------------------------------------------
// 4B. PRE-FLIGHT READINESS PROBE (MANDATORY FAIL-CLOSED GATE BEFORE 500 VUs)
// ---------------------------------------------------------------------------

export function setup() {
  console.log(`[k6 setup] Performing pre-flight readiness check against: ${BASE_URL}/api/v1/ready`);
  const readyUrl = `${BASE_URL}/api/v1/ready`;
  const readyRes = http.get(readyUrl, {
    headers: {
      'User-Agent': `Matinee-k6-Preflight/2.0 (Env ${DISPOSABLE_ENV_ID})`,
      Accept: 'application/json',
    },
    timeout: '10s',
  });

  if (readyRes.status !== 200) {
    let responseBody = readyRes.body;
    try {
      responseBody = JSON.stringify(JSON.parse(readyRes.body), null, 2);
    } catch (_) {}

    throw new Error(
      '\n================================================================================\n' +
      `PRE-FLIGHT READINESS CHECK FAILED (HTTP ${readyRes.status})\n` +
      `Endpoint: ${readyUrl}\n` +
      `Response:\n${responseBody}\n\n` +
      'CRITICAL FAIL-CLOSED SAFETY GUARD:\n' +
      'The target backend is NOT ready to receive 500 VUs. Both PostgreSQL (SELECT 1)\n' +
      'and Redis (PING) must report healthy before commencing load testing.\n' +
      'Load test aborted before spawning virtual users.\n' +
      '================================================================================'
    );
  }

  let readyPayload = {};
  try {
    readyPayload = JSON.parse(readyRes.body);
  } catch (_) {}

  console.log(
    `[k6 setup] Backend readiness verified (HTTP 200). DB: ${readyPayload?.checks?.database}, Redis: ${readyPayload?.checks?.redis}. Commencing 500-VU test.`
  );

  return {
    verifiedAt: new Date().toISOString(),
    backendReady: true,
    checks: readyPayload?.checks,
  };
}

// ---------------------------------------------------------------------------
// 5. TEST EXECUTION (PER-VU ITERATION)
// ---------------------------------------------------------------------------

export default function () {
  const vuId = __VU; // 1 to 500
  // Distribute 500 VUs across 50 seats (exactly 10 VUs contend for each seat)
  const seatIndex = (vuId - 1) % seatIds.length;
  const targetSeatId = seatIds[seatIndex];

  const holdIdempotencyKey = `k6-hold-${DISPOSABLE_ENV_ID}-${SHOWTIME_ID}-${targetSeatId}-${vuId}-${Date.now()}`;
  const holdUrl = `${BASE_URL}/api/v1/holds`;

  const holdPayload = JSON.stringify({
    showtimeId: SHOWTIME_ID,
    seatIds: [targetSeatId],
  });

  const holdHeaders = {
    'Content-Type': 'application/json',
    'Idempotency-Key': holdIdempotencyKey,
    'User-Agent': `Matinee-k6-LoadTest/2.0 (VU ${vuId}; Env ${DISPOSABLE_ENV_ID})`,
  };

  // --- STAGE 1: CONTEND FOR SEAT HOLD IN REDIS (ATOMIC LUA SET NX) ---
  const holdStart = Date.now();
  const holdRes = http.post(holdUrl, holdPayload, { headers: holdHeaders });
  holdDuration.add(Date.now() - holdStart);

  let holdToken = null;

  if (holdRes.status === 201) {
    // Winner: Acquired 600s atomic hold lease
    successfulHolds.add(1);
    try {
      const json = holdRes.json();
      holdToken = json?.data?.holdToken;
    } catch {
      serverErrors5xx.add(1);
    }

    check(holdRes, {
      'hold acquisition returned HTTP 201': (r) => r.status === 201,
      'hold response contains valid holdToken': () => Boolean(holdToken),
    });
  } else if (holdRes.status === 409) {
    // Loser: Expected clean conflict rejection
    try {
      const errJson = holdRes.json();
      const errCode = errJson?.code || errJson?.error?.code;
      if (errCode === 'SEAT_HOLD_CONFLICT') {
        conflictHoldContention.add(1);
      } else if (errCode === 'SEAT_ALREADY_SOLD') {
        conflictAlreadySold.add(1);
      } else {
        other409Conflicts.add(1);
      }
    } catch {
      conflictHoldContention.add(1);
    }

    check(holdRes, {
      'conflict returned clean HTTP 409': (r) => r.status === 409,
    });
  } else if (holdRes.status === 429) {
    rateLimited429.add(1);
  } else if (holdRes.status === 503) {
    serviceUnavailable503.add(1);
  } else if (holdRes.status >= 500) {
    serverErrors5xx.add(1);
  } else {
    clientErrors4xx.add(1);
  }

  // --- STAGE 2: TRANSACTIONAL BOOKING CONVERSION (HOLD WINNERS ONLY) ---
  if (holdToken) {
    // Simulate short patron review pause (200ms)
    sleep(0.2);

    const bookingIdempotencyKey = `k6-book-${DISPOSABLE_ENV_ID}-${SHOWTIME_ID}-${targetSeatId}-${vuId}`;
    const bookingUrl = `${BASE_URL}/api/v1/bookings`;

    const bookingPayload = JSON.stringify({
      showtimeId: SHOWTIME_ID,
      seatIds: [targetSeatId],
      contactEmail: `loadtest-vu${vuId}@${DISPOSABLE_ENV_ID}.matinee.internal`,
      contactName: `LoadTest VirtualUser ${vuId}`,
      contactPhone: '+2348012345678',
    });

    const bookingHeaders = {
      'Content-Type': 'application/json',
      'Idempotency-Key': bookingIdempotencyKey,
      'X-Hold-Token': holdToken,
      'User-Agent': `Matinee-k6-LoadTest/2.0 (VU ${vuId}; Env ${DISPOSABLE_ENV_ID})`,
    };

    const bookStart = Date.now();
    const bookRes = http.post(bookingUrl, bookingPayload, { headers: bookingHeaders });
    bookingDuration.add(Date.now() - bookStart);

    if (bookRes.status === 201) {
      successfulBookings.add(1);
      check(bookRes, {
        'booking checkout returned HTTP 201': (r) => r.status === 201,
      });
    } else if (bookRes.status === 409) {
      // In a dual-layer architecture, if two VUs both received a hold (Redis failure),
      // PostgreSQL's partial unique index uq_active_showtime_seat catches and rejects here.
      duplicateSeatCollisions.add(1);
    } else {
      bookingFailures.add(1);
    }
  }
}

// ---------------------------------------------------------------------------
// 6. MACHINE-READABLE SUMMARY GENERATOR & VERDICT LOGIC
// ---------------------------------------------------------------------------

export function handleSummary(data) {
  const metrics = data.metrics || {};

  const holds = metrics.successful_holds ? metrics.successful_holds.values.count : 0;
  const bookings = metrics.successful_bookings ? metrics.successful_bookings.values.count : 0;
  const conflictsHold = metrics.conflict_hold_contention ? metrics.conflict_hold_contention.values.count : 0;
  const conflictsSold = metrics.conflict_already_sold ? metrics.conflict_already_sold.values.count : 0;
  const other409 = metrics.other_409_conflicts ? metrics.other_409_conflicts.values.count : 0;
  const total409 = conflictsHold + conflictsSold + other409;
  const rateLimits = metrics.rate_limited_429 ? metrics.rate_limited_429.values.count : 0;
  const unavailable503 = metrics.service_unavailable_503 ? metrics.service_unavailable_503.values.count : 0;
  const errors5xx = metrics.server_errors_5xx ? metrics.server_errors_5xx.values.count : 0;
  const errors4xx = metrics.client_errors_4xx ? metrics.client_errors_4xx.values.count : 0;
  const dbCollisions = metrics.duplicate_seat_collisions ? metrics.duplicate_seat_collisions.values.count : 0;
  const bookFails = metrics.booking_failures ? metrics.booking_failures.values.count : 0;
  const p95Latency = metrics.http_req_duration ? metrics.http_req_duration.values['p(95)'] : 0;
  const avgLatency = metrics.http_req_duration ? metrics.http_req_duration.values.avg : 0;

  // Determine rigorous verdict
  let verdictStatus = 'FAIL';
  let verdictReason = '';

  if (errors5xx > 0 || unavailable503 > 0) {
    verdictStatus = 'FAIL';
    verdictReason = `Server errors detected (${errors5xx} HTTP 5xx errors, ${unavailable503} HTTP 503 service unavailable).`;
  } else if (dbCollisions > 0) {
    verdictStatus = 'FAIL';
    verdictReason = `CRITICAL: ${dbCollisions} duplicate seat allocations collided in PostgreSQL! Double-booking invariant violated.`;
  } else if (holds === 0 && bookings === 0) {
    verdictStatus = 'INCOMPLETE / INVALID RUN';
    verdictReason = 'Zero seat holds acquired and zero bookings completed. The test did not exercise contention (possible network drop or mass 429 rate limit).';
  } else if (rateLimits > 0 && holds < CONTESTED_SEAT_COUNT) {
    verdictStatus = 'INCOMPLETE / RATE-LIMITED';
    verdictReason = `Rate limiting intervened (${rateLimits} HTTP 429 responses). Only ${holds}/${CONTESTED_SEAT_COUNT} holds were tested.`;
  } else if (holds > CONTESTED_SEAT_COUNT) {
    verdictStatus = 'FAIL';
    verdictReason = `Held seats count (${holds}) exceeded the total contested seats (${CONTESTED_SEAT_COUNT})!`;
  } else if (holds === CONTESTED_SEAT_COUNT && bookings === CONTESTED_SEAT_COUNT && errors5xx === 0 && dbCollisions === 0) {
    verdictStatus = 'PASS (PRELIMINARY HARNESS PASS — ZERO DOUBLE-ALLOCATIONS)';
    verdictReason = `All ${CONTESTED_SEAT_COUNT} contested seats were held and converted to bookings without duplicate collisions. Competing VUs received clean HTTP 409 rejections.`;
  } else {
    verdictStatus = 'PARTIAL / INCOMPLETE';
    verdictReason = `Partial execution: ${holds}/${CONTESTED_SEAT_COUNT} holds acquired, ${bookings}/${CONTESTED_SEAT_COUNT} bookings completed.`;
  }

  const summary = {
    testName: 'Matinee 500-VU Seat Contention Load Test',
    timestamp: new Date().toISOString(),
    environment: {
      disposableEnvId: DISPOSABLE_ENV_ID,
      targetUrl: BASE_URL,
      showtimeId: SHOWTIME_ID,
      virtualUsers: TOTAL_VUS,
      contestedSeats: CONTESTED_SEAT_COUNT,
      contendersPerSeat: Math.round(TOTAL_VUS / CONTESTED_SEAT_COUNT),
    },
    results: {
      successfulHolds: holds,
      successfulBookings: bookings,
      duplicateSeatCollisions: dbCollisions,
      bookingFailures: bookFails,
      conflicts: {
        total409,
        holdContention: conflictsHold,
        alreadySold: conflictsSold,
        other409,
      },
      infrastructure: {
        rateLimited429: rateLimits,
        serviceUnavailable503: unavailable503,
        serverErrors5xx: errors5xx,
        clientErrors4xx: errors4xx,
      },
      latency: {
        httpReqDurationP95Ms: p95Latency,
        httpReqDurationAvgMs: avgLatency,
      },
      verdict: {
        status: verdictStatus,
        reason: verdictReason,
        databaseAuditRequired: 'Run load-tests/audit.sql against staging PostgreSQL to confirm zero duplicate active tickets in tickets table.',
      },
    },
  };

  const humanReport = `
================================================================================
MATINEE 500-VIRTUAL-USER HIGH-CONCURRENCY LOAD TEST REPORT
================================================================================
Timestamp:              ${summary.timestamp}
Disposable Env ID:      ${summary.environment.disposableEnvId}
Target Endpoint:        ${summary.environment.targetUrl}
Showtime ID:            ${summary.environment.showtimeId}
Virtual Users (VUs):    ${summary.environment.virtualUsers}
Contested Seats:        ${summary.environment.contestedSeats} (${summary.environment.contendersPerSeat} contenders per seat)

--- SEAT ALLOCATION INVARIANTS ---
Successful Holds:       ${holds} (Target: Exactly ${CONTESTED_SEAT_COUNT})
Successful Bookings:    ${bookings} (Target: Exactly ${CONTESTED_SEAT_COUNT})
Duplicate Allocations:  ${dbCollisions} (Target: STRICTLY 0)
Booking Failures:       ${bookFails}

--- CONFLICTS & GRACEFUL REJECTIONS ---
Total HTTP 409:         ${total409} (Target: ~${TOTAL_VUS - CONTESTED_SEAT_COUNT})
  - Seat Hold Conflict: ${conflictsHold}
  - Seat Already Sold:  ${conflictsSold}
  - Other 409 Code:     ${other409}

--- INFRASTRUCTURE & OVERLOAD DIAGNOSTICS ---
Rate-Limited (429):     ${rateLimits}
Service Down (503):     ${unavailable503}
Server Errors (5xx):    ${errors5xx} (Target: STRICTLY 0)
Client Errors (4xx):    ${errors4xx} (Target: STRICTLY 0)

--- LATENCY DISTRIBUTION ---
HTTP Req Duration p95:  ${p95Latency ? p95Latency.toFixed(2) : 'N/A'} ms
HTTP Req Duration Avg:  ${avgLatency ? avgLatency.toFixed(2) : 'N/A'} ms

--- VERDICT & INTEGRITY NOTE ---
VERDICT: ${verdictStatus}
REASON:  ${verdictReason}

IMPORTANT: Client-side aggregate counts alone do NOT constitute conclusive proof.
Execute the post-test query in load-tests/audit.sql directly against PostgreSQL
to verify active allocations per showtime and seat.
================================================================================
`;

  return {
    stdout: humanReport,
    './load-tests/summary.json': JSON.stringify(summary, null, 2),
  };
}
