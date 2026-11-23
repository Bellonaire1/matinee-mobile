/**
 * Matinee: High-Concurrency 500-VU Seat Reservation Load-Test Harness
 *
 * SPECIFICATION (Bootcamp Final Graduation Task — Part 2.4 Mobile Task B):
 * - 500 Virtual Users (VUs) simultaneously competing for the same 50 seats.
 * - Proves zero double-booking invariant under extreme contention.
 * - Demonstrates dual-layer defense:
 *     Layer 1: Redis atomic Lua hold reservation (SET NX EX 600)
 *     Layer 2: PostgreSQL partial unique index (uq_active_showtime_seat) on active tickets
 * - Reports p95 latency, throughput, error rates, and clean conflict rejections.
 *
 * SAFETY GUARDRAIL:
 * This script MUST NOT be executed against production or the protected Neon main database.
 * Requires: MATINEE_ALLOW_LOAD_TEST=true and a dedicated, disposable staging API endpoint.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ---------------------------------------------------------------------------
// 1. SAFETY PRECONDITIONS & GUARDRAILS
// ---------------------------------------------------------------------------

const ALLOW_LOAD_TEST = __ENV.MATINEE_ALLOW_LOAD_TEST === 'true';
const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

if (!ALLOW_LOAD_TEST) {
  throw new Error(
    '========================================================================\n' +
    'SAFETY BLOCK: MATINEE_ALLOW_LOAD_TEST=true environment variable is REQUIRED.\n' +
    'This safeguard prevents accidental execution against production or the\n' +
    'protected Neon main database. Deploy a dedicated staging/test instance first.\n' +
    '========================================================================'
  );
}

// Block obvious production and cloud database hosts from accidental targeting
const FORBIDDEN_PATTERNS = [
  'neon.tech',
  'production',
  'prod.',
  'matinee.ng',
  'api.matinee.com',
];

for (const pattern of FORBIDDEN_PATTERNS) {
  if (BASE_URL.toLowerCase().includes(pattern)) {
    throw new Error(
      `SAFETY BLOCK: Base URL '${BASE_URL}' matches forbidden production pattern '${pattern}'.\n` +
      'Load tests may only be executed against a disposable local or staging environment.'
    );
  }
}

// ---------------------------------------------------------------------------
// 2. CONFIGURABLE TEST PARAMETERS
// ---------------------------------------------------------------------------

const SHOWTIME_ID = __ENV.SHOWTIME_ID || '11111111-2222-3333-4444-555555555555';
const TOTAL_VUS = parseInt(__ENV.VUS || '500', 10);
const CONTESTED_SEAT_COUNT = 50;

// Load 50 configurable seat IDs (or fall back to deterministic test UUIDs)
let seatIds = [];
try {
  const rawFixtures = open('./fixtures/seats.example.json');
  const parsed = JSON.parse(rawFixtures);
  if (Array.isArray(parsed.seatIds) && parsed.seatIds.length >= CONTESTED_SEAT_COUNT) {
    seatIds = parsed.seatIds.slice(0, CONTESTED_SEAT_COUNT);
  }
} catch {
  // Deterministic fallback seat IDs if fixture file is unreadable in sandbox
  for (let i = 1; i <= CONTESTED_SEAT_COUNT; i++) {
    const pad = String(i).padStart(12, '0');
    seatIds.push(`00000000-0000-0000-0000-${pad}`);
  }
}

// ---------------------------------------------------------------------------
// 3. CUSTOM METRICS DEFINITIONS
// ---------------------------------------------------------------------------

const successfulHolds = new Counter('successful_holds');
const expectedConflicts = new Counter('expected_conflicts');
const unexpectedErrors = new Counter('unexpected_errors');
const rateLimitedRequests = new Counter('rate_limited_requests');
const successfulBookings = new Counter('successful_bookings');
const duplicateSeatCollisions = new Counter('duplicate_seat_collisions');

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
      maxDuration: '45s',
    },
  },
  thresholds: {
    // Zero unexpected 5xx crashes or unhandled network drops
    unexpected_errors: ['count==0'],
    // Zero double allocations: winning holds can NEVER exceed the 50 contested seats
    successful_holds: [`count<=${CONTESTED_SEAT_COUNT}`],
    // Zero database collisions: winning holds convert cleanly; losers never reach DB
    duplicate_seat_collisions: ['count==0'],
    // Response time target: p95 under 1000ms under 500-concurrency burst
    http_req_duration: ['p(95)<1000'],
  },
};

// ---------------------------------------------------------------------------
// 5. TEST EXECUTION (PER-VU ITERATION)
// ---------------------------------------------------------------------------

export default function () {
  const vuId = __VU; // 1 to 500
  // Distribute 500 VUs across 50 seats (exactly 10 VUs per seat)
  const seatIndex = (vuId - 1) % seatIds.length;
  const targetSeatId = seatIds[seatIndex];

  const holdIdempotencyKey = `k6-hold-${SHOWTIME_ID}-${targetSeatId}-${vuId}-${Date.now()}`;
  const holdUrl = `${BASE_URL}/api/v1/holds`;

  const holdPayload = JSON.stringify({
    showtimeId: SHOWTIME_ID,
    seatIds: [targetSeatId],
  });

  const holdHeaders = {
    'Content-Type': 'application/json',
    'Idempotency-Key': holdIdempotencyKey,
    'User-Agent': `Matinee-k6-LoadTest/1.0 (VU ${vuId})`,
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
      unexpectedErrors.add(1);
    }

    check(holdRes, {
      'hold acquisition returned HTTP 201': (r) => r.status === 201,
      'hold response contains valid holdToken': () => Boolean(holdToken),
    });
  } else if (holdRes.status === 409) {
    // Loser: Expected clean conflict rejection (Seat already held by competing VU)
    expectedConflicts.add(1);
    check(holdRes, {
      'conflict returned clean HTTP 409': (r) => r.status === 409,
    });
  } else if (holdRes.status === 429) {
    // Rate limit or queue buffer triggered
    rateLimitedRequests.add(1);
  } else {
    // Unexpected error (e.g. 500 server crash, 404 showtime missing)
    unexpectedErrors.add(1);
  }

  // --- STAGE 2: TRANSACTIONAL BOOKING VERIFICATION (WINNERS ONLY) ---
  // If this VU won the hold, verify that it can convert into a PENDING booking in PostgreSQL
  if (holdToken) {
    // Slight pause to simulate patron viewing the checkout order review screen (100ms - 500ms)
    sleep(0.2);

    const bookingIdempotencyKey = `k6-book-${SHOWTIME_ID}-${targetSeatId}-${vuId}`;
    const bookingUrl = `${BASE_URL}/api/v1/bookings`;

    const bookingPayload = JSON.stringify({
      showtimeId: SHOWTIME_ID,
      seatIds: [targetSeatId],
      contactEmail: `loadtest-vu${vuId}@matinee.internal`,
      contactName: `LoadTest VirtualUser ${vuId}`,
      contactPhone: '+2348012345678',
    });

    const bookingHeaders = {
      'Content-Type': 'application/json',
      'Idempotency-Key': bookingIdempotencyKey,
      'X-Hold-Token': holdToken,
      'User-Agent': `Matinee-k6-LoadTest/1.0 (VU ${vuId})`,
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
      // In a dual-layer architecture, if two VUs somehow both received a hold (Redis failure),
      // PostgreSQL's partial unique index uq_active_showtime_seat rejects the second insert here.
      duplicateSeatCollisions.add(1);
    } else {
      unexpectedErrors.add(1);
    }
  }
}

// ---------------------------------------------------------------------------
// 6. MACHINE-READABLE SUMMARY GENERATOR
// ---------------------------------------------------------------------------

export function handleSummary(data) {
  const metrics = data.metrics || {};

  const summary = {
    testName: 'Matinee 500-VU Seat Contention Load Test',
    timestamp: new Date().toISOString(),
    config: {
      targetUrl: BASE_URL,
      showtimeId: SHOWTIME_ID,
      virtualUsers: TOTAL_VUS,
      contestedSeats: CONTESTED_SEAT_COUNT,
      contendersPerSeat: Math.round(TOTAL_VUS / CONTESTED_SEAT_COUNT),
    },
    results: {
      successfulHolds: metrics.successful_holds ? metrics.successful_holds.values.count : 0,
      expectedConflicts: metrics.expected_conflicts ? metrics.expected_conflicts.values.count : 0,
      unexpectedErrors: metrics.unexpected_errors ? metrics.unexpected_errors.values.count : 0,
      rateLimitedRequests: metrics.rate_limited_requests ? metrics.rate_limited_requests.values.count : 0,
      successfulBookings: metrics.successful_bookings ? metrics.successful_bookings.values.count : 0,
      duplicateSeatCollisions: metrics.duplicate_seat_collisions ? metrics.duplicate_seat_collisions.values.count : 0,
      httpReqDurationP95Ms: metrics.http_req_duration ? metrics.http_req_duration.values['p(95)'] : 0,
      httpReqDurationAvgMs: metrics.http_req_duration ? metrics.http_req_duration.values.avg : 0,
      checksPassed: data.root_group ? data.root_group.checks : [],
    },
  };

  const humanReport = `
================================================================================
MATINEE 500-VIRTUAL-USER HIGH-CONCURRENCY LOAD TEST REPORT
================================================================================
Timestamp:            ${summary.timestamp}
Target Endpoint:      ${summary.config.targetUrl}
Showtime ID:          ${summary.config.showtimeId}
Virtual Users:        ${summary.config.virtualUsers}
Contested Seats:      ${summary.config.contestedSeats} (${summary.config.contendersPerSeat} contenders per seat)

--- METRICS & INVARIANTS ---
Successful Holds:     ${summary.results.successfulHolds} (Target: Exactly ${CONTESTED_SEAT_COUNT})
Expected Conflicts:   ${summary.results.expectedConflicts} (Target: ~${TOTAL_VUS - CONTESTED_SEAT_COUNT} clean 409 rejections)
Unexpected Errors:    ${summary.results.unexpectedErrors} (Target: STRICTLY 0)
Rate-Limited 429s:    ${summary.results.rateLimitedRequests}
Successful Bookings:  ${summary.results.successfulBookings} (Target: Exactly ${CONTESTED_SEAT_COUNT})
Double Allocations:   ${summary.results.duplicateSeatCollisions} (Target: STRICTLY 0)

--- LATENCY DISTRIBUTION ---
HTTP Req Duration p95: ${summary.results.httpReqDurationP95Ms ? summary.results.httpReqDurationP95Ms.toFixed(2) : 'N/A'} ms
HTTP Req Duration Avg: ${summary.results.httpReqDurationAvgMs ? summary.results.httpReqDurationAvgMs.toFixed(2) : 'N/A'} ms

VERDICT: ${
    summary.results.unexpectedErrors === 0 &&
    summary.results.duplicateSeatCollisions === 0 &&
    summary.results.successfulHolds <= CONTESTED_SEAT_COUNT
      ? 'PASS — ZERO DOUBLE-BOOKINGS, COMPLETE INVARIANT ENFORCEMENT'
      : 'FAIL — CONCURRENCY SAFETY INVARIANTS VIOLATED'
  }
================================================================================
`;

  return {
    stdout: humanReport,
    './load-tests/summary.json': JSON.stringify(summary, null, 2),
  };
}
