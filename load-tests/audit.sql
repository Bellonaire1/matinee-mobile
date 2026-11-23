-- ============================================================================
-- MATINEE LOAD-TEST DATABASE AUDIT & SAFETY VERIFICATION SCRIPT
-- ============================================================================
-- Purpose:
-- 1. Pre-Run Verification: Confirm connection to disposable database branch,
--    validate showtime status, and export 50 valid available seat UUIDs.
-- 2. Post-Run Verification: Empirically prove zero double-bookings by checking
--    active ticket counts, partial unique index integrity, and duplicate detection.
--
-- TARGET ENVIRONMENT: Disposable Neon Staging Branch ONLY.
-- NEVER execute against the protected Neon main branch (br-small-frog-bjztb5yj).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: PRE-RUN DATABASE IDENTITY & SAFETY CHECK
-- ----------------------------------------------------------------------------

-- Check 1.1: Verify current database, user, server address, and transaction status
SELECT
    current_database() AS connected_database,
    current_user AS connected_user,
    inet_server_addr() AS server_ip,
    inet_server_port() AS server_port,
    version() AS postgres_version;

-- Check 1.2: Verify the partial unique index exists on the tickets table
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'tickets'
  AND indexname = 'uq_active_showtime_seat';

-- Expected output for Check 1.2:
-- CREATE UNIQUE INDEX uq_active_showtime_seat ON public.tickets
-- USING btree (showtime_id, seat_id)
-- WHERE (status = ANY (ARRAY['PENDING_PAYMENT'::"TicketStatus", 'CONFIRMED'::"TicketStatus", 'CHECKED_IN'::"TicketStatus", 'REFUNDED_RESTRICTED'::"TicketStatus"]))


-- ----------------------------------------------------------------------------
-- SECTION 2: PRE-RUN FIXTURE GENERATOR (50 SEATS FOR STAGING)
-- ----------------------------------------------------------------------------
-- Instructions:
-- Set :target_showtime_id to your test screening session UUID.
-- This query outputs 50 available seat IDs formatted as a JSON fixture.

/*
WITH target_showtime AS (
    SELECT id, auditorium_id, status, start_time
    FROM showtimes
    WHERE id = 'YOUR-STAGING-SHOWTIME-UUID-HERE'
      AND status = 'OPEN_FOR_BOOKING'
),
available_seats AS (
    SELECT s.id AS seat_id, s.seat_number, s.row, s.column
    FROM seats s
    JOIN target_showtime ts ON s.auditorium_id = ts.auditorium_id
    WHERE s.is_active = true
      AND s.is_couple = false -- Standard/VIP single seats for deterministic 1:1 contention
      AND NOT EXISTS (
          SELECT 1 FROM tickets t
          WHERE t.showtime_id = ts.id
            AND t.seat_id = s.id
            AND t.status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'REFUNDED_RESTRICTED')
      )
    ORDER BY s.row, s.column
    LIMIT 50
)
SELECT json_build_object(
    '_comment', 'Real 50 Contested Seat IDs generated from disposable staging database',
    'showtimeId', (SELECT id FROM target_showtime),
    'seatIds', (SELECT json_agg(seat_id) FROM available_seats)
) AS staging_fixture_json;
*/


-- ----------------------------------------------------------------------------
-- SECTION 3: PRE-RUN CLEAN STATE VERIFICATION
-- ----------------------------------------------------------------------------
-- Before launching k6, verify that ZERO active tickets exist for the 50 seats.
-- Replace SHOWTIME_UUID with the target showtime ID.

/*
SELECT
    COUNT(*) AS pre_test_active_ticket_count
FROM tickets
WHERE showtime_id = 'YOUR-STAGING-SHOWTIME-UUID-HERE'
  AND status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'REFUNDED_RESTRICTED');
-- MUST return: 0
*/


-- ----------------------------------------------------------------------------
-- SECTION 4: POST-RUN CONCURRENCY & INTEGRITY AUDIT (MANDATORY)
-- ----------------------------------------------------------------------------
-- Execute immediately after k6 500-VU test completes.

-- Audit 4.1: CRITICAL DOUBLE-BOOKING DETECTION QUERY
-- If this query returns ANY rows, the double-booking invariant was violated!
/*
SELECT
    t.showtime_id,
    t.seat_id,
    s.seat_number,
    COUNT(*) AS active_allocations,
    array_agg(t.id) AS ticket_ids,
    array_agg(t.status) AS ticket_statuses,
    array_agg(t.booking_id) AS booking_ids
FROM tickets t
JOIN seats s ON t.seat_id = s.id
WHERE t.showtime_id = 'YOUR-STAGING-SHOWTIME-UUID-HERE'
  AND t.status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'REFUNDED_RESTRICTED')
GROUP BY t.showtime_id, t.seat_id, s.seat_number
HAVING COUNT(*) > 1;
-- MUST return: ZERO ROWS (Empty Result).
*/

-- Audit 4.2: Total Seats Claimed vs Contested Target
-- Exactly 50 tickets should be in active status for the 50 contested seats.
/*
SELECT
    t.status,
    COUNT(*) AS ticket_count
FROM tickets t
WHERE t.showtime_id = 'YOUR-STAGING-SHOWTIME-UUID-HERE'
GROUP BY t.status;
-- Expected output for a fully converted test:
-- PENDING_PAYMENT | 50
*/

-- Audit 4.3: Invariant Audit Summary Report
/*
WITH audit_metrics AS (
    SELECT
        COUNT(DISTINCT t.seat_id) AS distinct_seats_booked,
        COUNT(*) AS total_active_tickets,
        SUM(CASE WHEN t.status = 'PENDING_PAYMENT' THEN 1 ELSE 0 END) AS pending_payment_count,
        SUM(CASE WHEN t.status = 'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed_count
    FROM tickets t
    WHERE t.showtime_id = 'YOUR-STAGING-SHOWTIME-UUID-HERE'
      AND t.status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'REFUNDED_RESTRICTED')
)
SELECT
    distinct_seats_booked,
    total_active_tickets,
    (total_active_tickets - distinct_seats_booked) AS duplicate_overallocations,
    CASE
        WHEN (total_active_tickets - distinct_seats_booked) = 0 AND distinct_seats_booked = 50
            THEN 'PASS — EXACTLY 50 SEATS ALLOCATED WITH ZERO DUPLICATES'
        WHEN (total_active_tickets - distinct_seats_booked) > 0
            THEN 'FAIL — DUPLICATE ACTIVE TICKETS DETECTED IN POSTGRESQL'
        ELSE 'INCOMPLETE — FEWER THAN 50 SEATS ALLOCATED'
    END AS audit_verdict
FROM audit_metrics;
*/
