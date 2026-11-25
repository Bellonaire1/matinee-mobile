# M05.12A Public Load-Test Evidence Summary

This sanitized derivative preserves the measured result while omitting staging
URLs, database project identifiers, showtime identifiers, contact information,
booking identifiers, ticket identifiers, and hold tokens. Original local
evidence remains unchanged beside this file.

## Execution

- Scenario: 500 virtual users contending for 50 seats
- Contenders per seat: 10
- Harness exit: 1 because the latency threshold was crossed

## Results

| Metric | Result | Assessment |
|---|---:|---|
| Successful holds | 50 / 50 | Pass |
| Successful bookings | 13 / 50 | Partial |
| Booking failures/timeouts | 37 | Fail for completion target |
| Duplicate active allocations | 0 | Pass |
| HTTP 409 contention responses | 450 | Pass |
| HTTP 429 responses | 0 | Pass |
| HTTP 503 responses | 0 | Pass |
| HTTP 5xx responses | 0 | Pass |
| HTTP request duration p95 | 16,561.83 ms | Failed `< 1,000 ms` threshold |
| HTTP request duration average | 12,727.64 ms | Performance constrained |

## Verdict

The concurrency integrity invariant passed: no duplicate active seat
allocations were observed in the independent PostgreSQL audit. The run is not
a full performance pass because 37 booking attempts timed out and p95 latency
exceeded the required threshold on the free-tier staging compute.
