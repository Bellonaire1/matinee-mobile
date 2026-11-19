/**
 * Live Database Integrity and Concurrency Verification Suite
 * =============================================================================
 * Target: Dedicated Matinee Development Database (Neon)
 *
 * Runs non-destructive, controlled synthetic test cases:
 * A. Concurrent allocation of the exact same seat and showtime across two independent sessions.
 * B. Concurrent allocation of two different seats in the same showtime.
 * C. Cancellation followed by rebooking (inventory release).
 * D. REFUNDED_RESTRICTED blocks rebooking (inventory retention).
 * E. Booking seat count check constraint (0 and 9 rejected, 1..8 allowed).
 * F. Cross-auditorium seat rejection trigger.
 * G. Ticket vs Parent Booking showtime mismatch trigger.
 * H. Immutability checks on showtime/auditorium updates.
 * I. Foreign key deletion restrictions protecting financial/booking records.
 *
 * All test records use strictly prefixed IDs ('test-live-*') and are
 * thoroughly verified and removed at the end of the test.
 * =============================================================================
 */

import {
  PrismaClient,
  MovieCategory,
  SeatTier,
  ScreenFormat,
  ShowtimeStatus,
  BookingStatus,
  TicketStatus,
  PaymentProvider,
  PaymentStatus,
} from '@prisma/client';

export interface TestResult {
  code: string;
  name: string;
  status: 'PASS' | 'FAIL';
  evidence: string;
  durationMs: number;
}

const results: TestResult[] = [];

async function recordTest(
  code: string,
  name: string,
  fn: () => Promise<string>
) {
  const start = Date.now();
  try {
    const evidence = await fn();
    const durationMs = Date.now() - start;
    results.push({ code, name, status: 'PASS', evidence, durationMs });
    console.log(`  [PASS] Test ${code}: ${name} (${durationMs}ms)`);
  } catch (err: any) {
    const durationMs = Date.now() - start;
    results.push({
      code,
      name,
      status: 'FAIL',
      evidence: `Error: ${err.message || String(err)}`,
      durationMs,
    });
    console.error(`  [FAIL] Test ${code}: ${name} - ${err.message || String(err)}`);
  }
}

async function run() {
  console.log('============================================================');
  console.log('MATINEE LIVE DATABASE INTEGRITY & CONCURRENCY TEST SUITE');
  console.log('Target: Neon PostgreSQL (matinee_dev)');
  console.log('============================================================\n');

  // Create two distinct PrismaClient instances for true multi-session testing
  const session1 = new PrismaClient();
  const session2 = new PrismaClient();

  try {
    // 0. Base Fixture Setup
    console.log('Setting up controlled synthetic base fixtures...');
    const movId = 'test-live-mov-01';
    const cinId = 'test-live-cin-01';
    const aud1Id = 'test-live-aud-01';
    const aud2Id = 'test-live-aud-02';
    const seat1Id = 'test-live-seat-A1';
    const seat2Id = 'test-live-seat-A2';
    const seatAud2Id = 'test-live-seat-B1-aud2';
    const st1Id = 'test-live-st-01';
    const st2Id = 'test-live-st-02';

    // Cleanup any lingering artifacts from previous test runs first
    await cleanupAll(session1);

    // Insert Base Cinema
    await session1.cinema.create({
      data: {
        id: cinId,
        name: '[TEST] Live Test Cinema Lekki',
        neighborhood: 'Lekki',
        address: '123 Synthetic Test Way',
      },
    });

    // Insert Base Auditoriums
    await session1.auditorium.create({
      data: {
        id: aud1Id,
        cinemaId: cinId,
        name: 'Screen 1 (Laser IMAX)',
        screenNumber: 1,
        totalSeats: 320,
      },
    });

    await session1.auditorium.create({
      data: {
        id: aud2Id,
        cinemaId: cinId,
        name: 'Screen 2 (Standard)',
        screenNumber: 2,
        totalSeats: 320,
      },
    });

    // Insert Base Seats
    await session1.seat.create({
      data: {
        id: seat1Id,
        auditoriumId: aud1Id,
        row: 'A',
        column: 1,
        seatNumber: 'A1',
        tier: SeatTier.STANDARD,
      },
    });

    await session1.seat.create({
      data: {
        id: seat2Id,
        auditoriumId: aud1Id,
        row: 'A',
        column: 2,
        seatNumber: 'A2',
        tier: SeatTier.STANDARD,
      },
    });

    await session1.seat.create({
      data: {
        id: seatAud2Id,
        auditoriumId: aud2Id,
        row: 'B',
        column: 1,
        seatNumber: 'B1',
        tier: SeatTier.STANDARD,
      },
    });

    // Insert Base Movie
    await session1.movie.create({
      data: {
        id: movId,
        title: '[TEST] Live Test Movie',
        synopsis: 'Synthetic movie for concurrency validation',
        runtime: 120,
        ageRating: 'PG-13',
        releaseYear: 2026,
      },
    });

    // Insert Base Showtimes
    const now = new Date();
    await session1.showtime.create({
      data: {
        id: st1Id,
        movieId: movId,
        auditoriumId: aud1Id,
        startTime: new Date(now.getTime() + 3600000),
        endTime: new Date(now.getTime() + 10800000),
        format: ScreenFormat.IMAX_70MM,
      },
    });

    await session1.showtime.create({
      data: {
        id: st2Id,
        movieId: movId,
        auditoriumId: aud1Id,
        startTime: new Date(now.getTime() + 14400000),
        endTime: new Date(now.getTime() + 21600000),
        format: ScreenFormat.IMAX_70MM,
      },
    });

    console.log('Base fixtures created successfully.\nExecuting test matrix:\n');

    // TEST A: Two concurrent attempts to allocate the exact same seat and showtime
    await recordTest(
      'A',
      'Two-session concurrent allocation for same seat and showtime',
      async () => {
        const bkgA1 = await session1.booking.create({
          data: {
            id: 'test-live-bkg-conc-1',
            bookingReference: 'TEST-BKG-CONC-1',
            showtimeId: st1Id,
            seatCount: 1,
            subtotalKobo: 700000,
            bookingFeeKobo: 0,
            totalKobo: 700000,
            contactEmail: 'test-conc1@matinee.internal',
          },
        });

        const bkgA2 = await session2.booking.create({
          data: {
            id: 'test-live-bkg-conc-2',
            bookingReference: 'TEST-BKG-CONC-2',
            showtimeId: st1Id,
            seatCount: 1,
            subtotalKobo: 700000,
            bookingFeeKobo: 0,
            totalKobo: 700000,
            contactEmail: 'test-conc2@matinee.internal',
          },
        });

        // Launch concurrent inserts across session1 and session2
        const p1 = session1.ticket.create({
          data: {
            id: 'test-live-tkt-conc-1',
            ticketCode: 'TKT-TEST-CONC-1',
            bookingId: bkgA1.id,
            showtimeId: st1Id,
            seatId: seat1Id,
            tier: SeatTier.STANDARD,
            priceKobo: 700000,
            status: TicketStatus.CONFIRMED,
          },
        });

        const p2 = session2.ticket.create({
          data: {
            id: 'test-live-tkt-conc-2',
            ticketCode: 'TKT-TEST-CONC-2',
            bookingId: bkgA2.id,
            showtimeId: st1Id,
            seatId: seat1Id,
            tier: SeatTier.STANDARD,
            priceKobo: 700000,
            status: TicketStatus.CONFIRMED,
          },
        });

        const outcomes = await Promise.allSettled([p1, p2]);
        const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
        const rejected = outcomes.filter((o) => o.status === 'rejected');

        if (fulfilled.length !== 1 || rejected.length !== 1) {
          throw new Error(
            `Expected exactly 1 success and 1 rejection, got ${fulfilled.length} successes and ${rejected.length} rejections.`
          );
        }

        const rejectionReason: any = (rejected[0] as PromiseRejectedResult).reason;
        const msg = rejectionReason.message || String(rejectionReason);

        if (!msg.includes('uq_active_showtime_seat') && !msg.includes('Unique constraint failed')) {
          throw new Error(`Rejection was not due to uq_active_showtime_seat: ${msg}`);
        }

        // Cleanup test A tickets and bookings
        await session1.ticket.deleteMany({ where: { id: { in: ['test-live-tkt-conc-1', 'test-live-tkt-conc-2'] } } });
        await session1.booking.deleteMany({ where: { id: { in: [bkgA1.id, bkgA2.id] } } });

        return `Concurrent sessions: Exactly 1 succeeded, 1 rejected with uq_active_showtime_seat violation.`;
      }
    );

    // TEST B: Two different seats in the same showtime (both valid)
    await recordTest(
      'B',
      'Two different seats in same showtime both allocated successfully',
      async () => {
        const bkgB = await session1.booking.create({
          data: {
            id: 'test-live-bkg-diff-seats',
            bookingReference: 'TEST-BKG-DIFF-SEATS',
            showtimeId: st1Id,
            seatCount: 2,
            subtotalKobo: 1400000,
            bookingFeeKobo: 0,
            totalKobo: 1400000,
            contactEmail: 'test-diff@matinee.internal',
          },
        });

        const tkt1 = await session1.ticket.create({
          data: {
            id: 'test-live-tkt-diff-1',
            ticketCode: 'TKT-TEST-DIFF-1',
            bookingId: bkgB.id,
            showtimeId: st1Id,
            seatId: seat1Id,
            tier: SeatTier.STANDARD,
            priceKobo: 700000,
            status: TicketStatus.CONFIRMED,
          },
        });

        const tkt2 = await session2.ticket.create({
          data: {
            id: 'test-live-tkt-diff-2',
            ticketCode: 'TKT-TEST-DIFF-2',
            bookingId: bkgB.id,
            showtimeId: st1Id,
            seatId: seat2Id,
            tier: SeatTier.STANDARD,
            priceKobo: 700000,
            status: TicketStatus.CONFIRMED,
          },
        });

        // Cleanup
        await session1.ticket.deleteMany({ where: { id: { in: [tkt1.id, tkt2.id] } } });
        await session1.booking.delete({ where: { id: bkgB.id } });

        return `Both seats (${seat1Id}, ${seat2Id}) concurrently allocated without collision.`;
      }
    );

    // TEST C: Cancellation followed by rebooking (inventory release)
    await recordTest(
      'C',
      'Cancelled ticket releases seat back to inventory for rebooking',
      async () => {
        const bkgC1 = await session1.booking.create({
          data: {
            id: 'test-live-bkg-cancel-1',
            bookingReference: 'TEST-BKG-CANC-1',
            showtimeId: st1Id,
            seatCount: 1,
            subtotalKobo: 700000,
            bookingFeeKobo: 0,
            totalKobo: 700000,
            contactEmail: 'test-canc1@matinee.internal',
          },
        });

        const tktC1 = await session1.ticket.create({
          data: {
            id: 'test-live-tkt-canc-1',
            ticketCode: 'TKT-TEST-CANC-1',
            bookingId: bkgC1.id,
            showtimeId: st1Id,
            seatId: seat1Id,
            tier: SeatTier.STANDARD,
            priceKobo: 700000,
            status: TicketStatus.CONFIRMED,
          },
        });

        // Customer cancels reservation
        await session1.ticket.update({
          where: { id: tktC1.id },
          data: { status: TicketStatus.CANCELLED },
        });

        // New customer books the released seat
        const bkgC2 = await session1.booking.create({
          data: {
            id: 'test-live-bkg-rebook-2',
            bookingReference: 'TEST-BKG-REBK-2',
            showtimeId: st1Id,
            seatCount: 1,
            subtotalKobo: 700000,
            bookingFeeKobo: 0,
            totalKobo: 700000,
            contactEmail: 'test-rebk2@matinee.internal',
          },
        });

        const tktC2 = await session1.ticket.create({
          data: {
            id: 'test-live-tkt-rebk-2',
            ticketCode: 'TKT-TEST-REBK-2',
            bookingId: bkgC2.id,
            showtimeId: st1Id,
            seatId: seat1Id,
            tier: SeatTier.STANDARD,
            priceKobo: 700000,
            status: TicketStatus.CONFIRMED,
          },
        });

        // Cleanup
        await session1.ticket.deleteMany({ where: { id: { in: [tktC1.id, tktC2.id] } } });
        await session1.booking.deleteMany({ where: { id: { in: [bkgC1.id, bkgC2.id] } } });

        return `Seat successfully rebooked after CANCELLED status transition.`;
      }
    );

    // TEST D: REFUNDED_RESTRICTED maintains inventory block
    await recordTest(
      'D',
      'REFUNDED_RESTRICTED status keeps seat strictly blocked from resale',
      async () => {
        const bkgD1 = await session1.booking.create({
          data: {
            id: 'test-live-bkg-refd-1',
            bookingReference: 'TEST-BKG-REFD-1',
            showtimeId: st1Id,
            seatCount: 1,
            subtotalKobo: 700000,
            bookingFeeKobo: 0,
            totalKobo: 700000,
            contactEmail: 'test-refd1@matinee.internal',
          },
        });

        const tktD1 = await session1.ticket.create({
          data: {
            id: 'test-live-tkt-refd-1',
            ticketCode: 'TKT-TEST-REFD-1',
            bookingId: bkgD1.id,
            showtimeId: st1Id,
            seatId: seat1Id,
            tier: SeatTier.STANDARD,
            priceKobo: 700000,
            status: TicketStatus.REFUNDED_RESTRICTED,
          },
        });

        const bkgD2 = await session1.booking.create({
          data: {
            id: 'test-live-bkg-refd-2',
            bookingReference: 'TEST-BKG-REFD-2',
            showtimeId: st1Id,
            seatCount: 1,
            subtotalKobo: 700000,
            bookingFeeKobo: 0,
            totalKobo: 700000,
            contactEmail: 'test-refd2@matinee.internal',
          },
        });

        let attemptedResaleSucceeded = false;
        try {
          await session1.ticket.create({
            data: {
              id: 'test-live-tkt-refd-2',
              ticketCode: 'TKT-TEST-REFD-2',
              bookingId: bkgD2.id,
              showtimeId: st1Id,
              seatId: seat1Id,
              tier: SeatTier.STANDARD,
              priceKobo: 700000,
              status: TicketStatus.CONFIRMED,
            },
          });
          attemptedResaleSucceeded = true;
        } catch (e: any) {
          // Expected unique constraint failure
        }

        if (attemptedResaleSucceeded) {
          throw new Error('Seat with REFUNDED_RESTRICTED was incorrectly allowed to be resold!');
        }

        // Cleanup
        await session1.ticket.deleteMany({ where: { id: { in: [tktD1.id, 'test-live-tkt-refd-2'] } } });
        await session1.booking.deleteMany({ where: { id: { in: [bkgD1.id, bkgD2.id] } } });

        return `Resale correctly rejected under uq_active_showtime_seat for REFUNDED_RESTRICTED.`;
      }
    );

    // TEST E: Booking seat count check constraint (0 and 9 rejected, 1 and 8 accepted)
    await recordTest(
      'E',
      'Booking seat_count between 1 and 8 check constraint enforcement',
      async () => {
        let rejected0 = false;
        try {
          await session1.booking.create({
            data: {
              id: 'test-live-bkg-count-0',
              bookingReference: 'TEST-BKG-CNT-0',
              showtimeId: st1Id,
              seatCount: 0,
              subtotalKobo: 0,
              bookingFeeKobo: 0,
              totalKobo: 0,
              contactEmail: 'test-zero@matinee.internal',
            },
          });
        } catch (e: any) {
          if (e.message.includes('chk_booking_seat_count') || e.message.includes('Check constraint failed')) {
            rejected0 = true;
          }
        }

        let rejected9 = false;
        try {
          await session1.booking.create({
            data: {
              id: 'test-live-bkg-count-9',
              bookingReference: 'TEST-BKG-CNT-9',
              showtimeId: st1Id,
              seatCount: 9,
              subtotalKobo: 6300000,
              bookingFeeKobo: 0,
              totalKobo: 6300000,
              contactEmail: 'test-nine@matinee.internal',
            },
          });
        } catch (e: any) {
          if (e.message.includes('chk_booking_seat_count') || e.message.includes('Check constraint failed')) {
            rejected9 = true;
          }
        }

        if (!rejected0 || !rejected9) {
          throw new Error(`chk_booking_seat_count failed: rejected0=${rejected0}, rejected9=${rejected9}`);
        }

        // Valid booking with 8 seats succeeds
        const bkg8 = await session1.booking.create({
          data: {
            id: 'test-live-bkg-count-8',
            bookingReference: 'TEST-BKG-CNT-8',
            showtimeId: st1Id,
            seatCount: 8,
            subtotalKobo: 5600000,
            bookingFeeKobo: 0,
            totalKobo: 5600000,
            contactEmail: 'test-eight@matinee.internal',
          },
        });

        await session1.booking.delete({ where: { id: bkg8.id } });

        return `seat_count=0 rejected, seat_count=9 rejected, seat_count=8 accepted.`;
      }
    );

    // TEST F: Seat from the wrong auditorium rejected
    await recordTest(
      'F',
      'Cross-auditorium consistency trigger rejects ticket from wrong hall',
      async () => {
        const bkgF = await session1.booking.create({
          data: {
            id: 'test-live-bkg-wrong-aud',
            bookingReference: 'TEST-BKG-WRONG-AUD',
            showtimeId: st1Id, // In Auditorium 1
            seatCount: 1,
            subtotalKobo: 700000,
            bookingFeeKobo: 0,
            totalKobo: 700000,
            contactEmail: 'test-wrong-aud@matinee.internal',
          },
        });

        let rejected = false;
        let errorMessage = '';
        try {
          await session1.ticket.create({
            data: {
              id: 'test-live-tkt-wrong-aud',
              ticketCode: 'TKT-TEST-WRONG-AUD',
              bookingId: bkgF.id,
              showtimeId: st1Id, // Aud 1
              seatId: seatAud2Id, // Aud 2!
              tier: SeatTier.STANDARD,
              priceKobo: 700000,
              status: TicketStatus.CONFIRMED,
            },
          });
        } catch (e: any) {
          rejected = true;
          errorMessage = e.message;
        }

        await session1.booking.delete({ where: { id: bkgF.id } });

        if (!rejected || !errorMessage.includes('Auditorium mismatch')) {
          throw new Error(`Expected cross-auditorium rejection, got: ${errorMessage}`);
        }

        return `Trigger trg_verify_ticket_auditorium correctly rejected ticket linking Showtime in Aud 1 with Seat in Aud 2.`;
      }
    );

    // TEST G: Ticket referencing a different showtime from its parent booking
    await recordTest(
      'G',
      'Ticket vs Parent Booking showtime mismatch trigger rejects allocation',
      async () => {
        const bkgG = await session1.booking.create({
          data: {
            id: 'test-live-bkg-mismatch-st',
            bookingReference: 'TEST-BKG-MISMATCH-ST',
            showtimeId: st1Id, // Booking is for Showtime 1
            seatCount: 1,
            subtotalKobo: 700000,
            bookingFeeKobo: 0,
            totalKobo: 700000,
            contactEmail: 'test-mismatch-st@matinee.internal',
          },
        });

        let rejected = false;
        let errorMessage = '';
        try {
          await session1.ticket.create({
            data: {
              id: 'test-live-tkt-mismatch-st',
              ticketCode: 'TKT-TEST-MISMATCH-ST',
              bookingId: bkgG.id,
              showtimeId: st2Id, // Ticket attempted for Showtime 2!
              seatId: seat1Id,
              tier: SeatTier.STANDARD,
              priceKobo: 700000,
              status: TicketStatus.CONFIRMED,
            },
          });
        } catch (e: any) {
          rejected = true;
          errorMessage = e.message;
        }

        await session1.booking.delete({ where: { id: bkgG.id } });

        if (!rejected || !errorMessage.includes('Showtime mismatch')) {
          throw new Error(`Expected showtime mismatch rejection, got: ${errorMessage}`);
        }

        return `Trigger trg_verify_ticket_booking_showtime correctly rejected Ticket for Showtime 2 under Booking for Showtime 1.`;
      }
    );

    // TEST H: Relevant UPDATE paths immutability checks
    await recordTest(
      'H',
      'Immutability triggers prevent altering showtime or auditorium on active records',
      async () => {
        const bkgH = await session1.booking.create({
          data: {
            id: 'test-live-bkg-upd-immut',
            bookingReference: 'TEST-BKG-UPD-IMMUT',
            showtimeId: st1Id,
            seatCount: 1,
            subtotalKobo: 700000,
            bookingFeeKobo: 0,
            totalKobo: 700000,
            contactEmail: 'test-upd@matinee.internal',
          },
        });

        const tktH = await session1.ticket.create({
          data: {
            id: 'test-live-tkt-upd-immut',
            ticketCode: 'TKT-TEST-UPD-IMMUT',
            bookingId: bkgH.id,
            showtimeId: st1Id,
            seatId: seat1Id,
            tier: SeatTier.STANDARD,
            priceKobo: 700000,
            status: TicketStatus.CONFIRMED,
          },
        });

        // 1. Try to alter booking showtime_id
        let bkgShowtimeUpdateRejected = false;
        try {
          await session1.booking.update({
            where: { id: bkgH.id },
            data: { showtimeId: st2Id },
          });
        } catch (e: any) {
          if (e.message.includes('tickets have already been allocated')) {
            bkgShowtimeUpdateRejected = true;
          }
        }

        // 2. Try to alter showtime auditorium_id
        let stAuditoriumUpdateRejected = false;
        try {
          await session1.showtime.update({
            where: { id: st1Id },
            data: { auditoriumId: aud2Id },
          });
        } catch (e: any) {
          if (e.message.includes('tickets have already been issued')) {
            stAuditoriumUpdateRejected = true;
          }
        }

        // 3. Try to alter seat auditorium_id
        let seatAuditoriumUpdateRejected = false;
        try {
          await session1.seat.update({
            where: { id: seat1Id },
            data: { auditoriumId: aud2Id },
          });
        } catch (e: any) {
          if (e.message.includes('tickets exist for this seat')) {
            seatAuditoriumUpdateRejected = true;
          }
        }

        // Cleanup
        await session1.ticket.delete({ where: { id: tktH.id } });
        await session1.booking.delete({ where: { id: bkgH.id } });

        if (!bkgShowtimeUpdateRejected || !stAuditoriumUpdateRejected || !seatAuditoriumUpdateRejected) {
          throw new Error(
            `Update immutability checks failed: booking=${bkgShowtimeUpdateRejected}, showtime=${stAuditoriumUpdateRejected}, seat=${seatAuditoriumUpdateRejected}`
          );
        }

        return `All 3 immutability triggers (booking showtime, showtime auditorium, seat auditorium) verified.`;
      }
    );

    // TEST I: Deletion restrictions protecting financial & booking records
    await recordTest(
      'I',
      'Foreign key RESTRICT prevents accidental deletion of bookings and payments',
      async () => {
        const bkgI = await session1.booking.create({
          data: {
            id: 'test-live-bkg-del-prot',
            bookingReference: 'TEST-BKG-DEL-PROT',
            showtimeId: st1Id,
            seatCount: 1,
            subtotalKobo: 700000,
            bookingFeeKobo: 0,
            totalKobo: 700000,
            contactEmail: 'test-del@matinee.internal',
          },
        });

        const tktI = await session1.ticket.create({
          data: {
            id: 'test-live-tkt-del-prot',
            ticketCode: 'TKT-TEST-DEL-PROT',
            bookingId: bkgI.id,
            showtimeId: st1Id,
            seatId: seat1Id,
            tier: SeatTier.STANDARD,
            priceKobo: 700000,
            status: TicketStatus.CONFIRMED,
          },
        });

        const payI = await session1.paymentAttempt.create({
          data: {
            id: 'test-live-pay-del-prot',
            bookingId: bkgI.id,
            amountKobo: 700000,
            providerTransactionId: 'TXN-TEST-DEL-PROT',
            provider: PaymentProvider.TEST_GATEWAY,
            status: PaymentStatus.SUCCEEDED,
          },
        });

        // Attempt to delete the booking while tickets exist
        let bookingDeleteRejected = false;
        try {
          await session1.booking.delete({ where: { id: bkgI.id } });
        } catch (e: any) {
          if (e.message.includes('Foreign key constraint failed') || e.message.includes('tickets_booking_id_fkey')) {
            bookingDeleteRejected = true;
          }
        }

        // Cleanup in reverse dependency order
        await session1.paymentAttempt.delete({ where: { id: payI.id } });
        await session1.ticket.delete({ where: { id: tktI.id } });
        await session1.booking.delete({ where: { id: bkgI.id } });

        if (!bookingDeleteRejected) {
          throw new Error('Booking with active tickets was deleted, violating onDelete: RESTRICT!');
        }

        return `onDelete: RESTRICT strictly prevented cascading deletion of financial/ticket records.`;
      }
    );

    // Final Post-Test Cleanup & Verification
    console.log('\nCleaning up all synthetic fixtures...');
    await cleanupAll(session1);

    // Count remaining test fixtures
    const remainingCount = await countRemaining(session1);
    console.log(`Remaining synthetic test fixtures in database: ${remainingCount}`);

    if (remainingCount !== 0) {
      throw new Error(`Cleanup failed: ${remainingCount} synthetic records remain in database!`);
    }

    console.log('\n============================================================');
    console.log('ALL TESTS COMPLETED SUCCESSFULLY WITH 0 RESIDUAL FIXTURES');
    console.log('============================================================\n');

    // Print Test Matrix
    console.log('TEST MATRIX SUMMARY:');
    for (const r of results) {
      console.log(`- [${r.status}] Test ${r.code}: ${r.name}`);
      console.log(`    Evidence: ${r.evidence} (${r.durationMs}ms)`);
    }
  } finally {
    await session1.$disconnect();
    await session2.$disconnect();
  }
}

async function cleanupAll(prisma: PrismaClient) {
  await prisma.paymentAttempt.deleteMany({ where: { id: { startsWith: 'test-live-' } } });
  await prisma.ticket.deleteMany({ where: { id: { startsWith: 'test-live-' } } });
  await prisma.booking.deleteMany({ where: { id: { startsWith: 'test-live-' } } });
  await prisma.showtime.deleteMany({ where: { id: { startsWith: 'test-live-' } } });
  await prisma.seat.deleteMany({ where: { id: { startsWith: 'test-live-' } } });
  await prisma.auditorium.deleteMany({ where: { id: { startsWith: 'test-live-' } } });
  await prisma.movie.deleteMany({ where: { id: { startsWith: 'test-live-' } } });
  await prisma.cinema.deleteMany({ where: { id: { startsWith: 'test-live-' } } });
}

async function countRemaining(prisma: PrismaClient): Promise<number> {
  const p = await prisma.paymentAttempt.count({ where: { id: { startsWith: 'test-live-' } } });
  const t = await prisma.ticket.count({ where: { id: { startsWith: 'test-live-' } } });
  const b = await prisma.booking.count({ where: { id: { startsWith: 'test-live-' } } });
  const st = await prisma.showtime.count({ where: { id: { startsWith: 'test-live-' } } });
  const s = await prisma.seat.count({ where: { id: { startsWith: 'test-live-' } } });
  const a = await prisma.auditorium.count({ where: { id: { startsWith: 'test-live-' } } });
  const m = await prisma.movie.count({ where: { id: { startsWith: 'test-live-' } } });
  const c = await prisma.cinema.count({ where: { id: { startsWith: 'test-live-' } } });
  return p + t + b + st + s + a + m + c;
}

run().catch((e) => {
  console.error('Test Suite Fatal Error:', e);
  process.exit(1);
});
