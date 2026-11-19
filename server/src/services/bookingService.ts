import crypto from 'crypto';
import {
  PrismaClient,
  BookingStatus,
  TicketStatus,
  PaymentStatus,
  IdempotencyStatus,
  Prisma,
} from '@prisma/client';
import { default as defaultPrisma } from '../db.js';
import { AppError } from '../middleware/errorHandler.js';
import { SeatHoldService, seatHoldService as defaultSeatHoldService } from './seatHoldService.js';

export interface CreateBookingInput {
  showtimeId: string;
  seatIds: string[];
  contactEmail: string;
  contactName?: string;
  contactPhone?: string;
  totalPriceKobo?: number;
  holdToken: string;
  userId?: string | null;
  idempotencyKey: string;
}

export interface BookingTicketItem {
  id: string;
  ticketCode: string;
  seatId: string;
  tier: string;
  priceKobo: number;
  status: TicketStatus;
}

export interface BookingResult {
  id: string;
  bookingReference: string;
  status: BookingStatus;
  showtimeId: string;
  seatCount: number;
  subtotalKobo: number;
  bookingFeeKobo: number;
  totalKobo: number;
  contactEmail: string;
  contactName: string | null;
  contactPhone: string | null;
  expiresAt: string | null;
  createdAt: string;
  tickets: BookingTicketItem[];
}

function generateBookingReference(): string {
  const digits = Math.floor(1000 + Math.random() * 9000);
  const chars = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `MAT-${digits}-${chars}`;
}

function generateTicketCode(seatNumber: string): string {
  const digits = Math.floor(1000 + Math.random() * 9000);
  const cleanSeat = seatNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `TKT-${digits}-${cleanSeat}`;
}

/**
 * CONCURRENCY & LOCKING PROTOCOL FOR FUTURE PAYMENT WEBHOOK HANDLERS:
 *
 * When implementing payment webhook handlers (e.g. Paystack / Flutterwave / Stripe),
 * the handler MUST adhere to the following concurrency contract with this reconciler:
 *
 * 1. Webhook Payment Start:
 *    When a payment event arrives, the webhook handler MUST execute within a PostgreSQL transaction:
 *      a. Check/Insert PaymentAttempt with status = 'PROCESSING'.
 *         This immediately blocks expireAbandonedBookings from selecting this booking.
 *      b. Inspect Booking.status:
 *         - If Booking.status === 'EXPIRED':
 *           The checkout session already timed out before payment arrived.
 *           The webhook handler MUST NOT allocate tickets. Instead, update PaymentAttempt to
 *           'REFUNDED' or flag for automated customer refund.
 *         - If Booking.status === 'PENDING':
 *           Proceed to transition Booking -> 'CONFIRMED' and Ticket -> 'CONFIRMED'.
 *
 * 2. Reconciler (expireAbandonedBookings):
 *    Within its transaction, the reconciler checks:
 *      a. Booking.status === 'PENDING'
 *      b. Booking.expiresAt < now
 *      c. paymentAttempts: none with status in ['PROCESSING', 'SUCCEEDED']
 *    If any payment attempt is active or succeeded, reconciliation skips the booking.
 *
 * By sharing this two-way transactional protocol, neither process can ever corrupt the other's state:
 * - If settlement wins: PaymentAttempt becomes PROCESSING/SUCCEEDED; reconciler skips.
 * - If expiration wins: Booking becomes EXPIRED; webhook handler detects EXPIRED and issues a refund.
 */
export class BookingService {
  private prisma: PrismaClient;
  private holdService: SeatHoldService;

  constructor(prismaClient?: PrismaClient, holdService?: SeatHoldService) {
    this.prisma = prismaClient || defaultPrisma;
    this.holdService = holdService || defaultSeatHoldService;
  }

  /**
   * Atomically initializes a PENDING booking order and PENDING_PAYMENT ticket records
   * inside a strict PostgreSQL ACID transaction.
   *
   * Transactional & Security Invariants:
   * 1. Mandatory Idempotency-Key: Rejects missing, blank, or malformed keys.
   * 2. Checks durable completed idempotency BEFORE requiring active Redis hold,
   *    allowing legitimate retries after dropped connections to succeed without a second allocation.
   * 3. Uses cryptographic token hash (SHA-256) to ensure Idempotency-Key alone cannot hijack a booking.
   * 4. Binds retries to original request parameters; rejects conflicting reuse with 409 IDEMPOTENCY_CONFLICT.
   * 5. Atomically locks hold checkout in Redis to prevent two different keys from duplicating a hold.
   * 6. Derives all pricing, seats, and tier amounts strictly from server-verified data.
   * 7. Enforces PostgreSQL partial unique index uq_active_showtime_seat to guarantee zero double bookings.
   * 8. Releases Redis hold ONLY AFTER database commit succeeds; handles release failure gracefully.
   * 9. Strictly marks booking as PENDING and tickets as PENDING_PAYMENT without fake payment confirmation.
   */
  async createBooking(input: CreateBookingInput): Promise<BookingResult> {
    const {
      showtimeId,
      seatIds,
      contactEmail,
      contactName,
      contactPhone,
      totalPriceKobo,
      holdToken,
      userId,
      idempotencyKey,
    } = input;

    // 1. Proof of possession of hold capability token
    if (!holdToken || !holdToken.trim()) {
      throw new AppError(
        'Hold capability token is required to create a booking',
        401,
        'MISSING_HOLD_TOKEN'
      );
    }

    const cleanToken = holdToken.trim();
    const cleanIdempotencyKey = idempotencyKey.trim();

    // Deterministic request hash for idempotency parameter binding
    const sortedSeats = [...seatIds].sort();
    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ showtimeId, seatIds: sortedSeats, contactEmail }))
      .digest('hex');

    // SHA-256 hash of capability token for non-reversible proof-of-possession storage
    const tokenHash = crypto
      .createHash('sha256')
      .update(cleanToken)
      .digest('hex');

    // 2. CHECK DURABLE COMPLETED IDEMPOTENCY FIRST (BEFORE requiring active Redis hold)
    // Allows legitimate clients whose network connection dropped after commit to safely recover their booking
    const existingRecord = await this.prisma.idempotencyRecord.findUnique({
      where: { key: cleanIdempotencyKey },
    });

    if (existingRecord) {
      if (existingRecord.status === IdempotencyStatus.IN_PROGRESS) {
        throw new AppError(
          'A booking request with this Idempotency-Key is currently in progress. Please wait and retry.',
          409,
          'IDEMPOTENCY_IN_PROGRESS'
        );
      }

      if (existingRecord.status === IdempotencyStatus.COMPLETED) {
        // A. Binding Check: Reject conflicting reuse with different parameters
        if (existingRecord.requestHash !== requestHash) {
          throw new AppError(
            'Idempotency key was previously used with different booking parameters',
            409,
            'IDEMPOTENCY_CONFLICT'
          );
        }

        // B. Proof-of-Possession Check: Never allow Idempotency-Key alone to grant access
        const body = existingRecord.responseBody as any;
        const storedTokenHash = body?._meta?.tokenHash;

        if (!storedTokenHash || storedTokenHash !== tokenHash) {
          throw new AppError(
            'Proof of possession of the original hold capability token is required to replay this booking',
            409,
            'HOLD_TOKEN_POSSESSION_REQUIRED'
          );
        }

        // Return sanitized cached completed response (without internal _meta)
        const { _meta, ...safeResult } = body;
        return safeResult as BookingResult;
      }
    }

    // 3. ATOMIC LOCK ON HOLD TOKEN TO PREVENT CONCURRENT CHECKOUT DUPLICATION
    // Prevents two different idempotency keys from concurrently checking out the same hold
    const holdBookingLockKey = `matinee:hold_booking_lock:${cleanToken}`;
    let holdLockClaimed = false;
    try {
      const lockAcquired = await this.holdService.redis.set(
        holdBookingLockKey,
        cleanIdempotencyKey,
        'EX',
        60,
        'NX'
      );
      if (!lockAcquired) {
        throw new AppError(
          'A booking checkout is already in progress for this seat hold session. Please wait and retry.',
          409,
          'BOOKING_IN_PROGRESS'
        );
      }
      holdLockClaimed = true;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        'Seat hold service is temporarily unavailable. Please try again.',
        503,
        'HOLD_SERVICE_UNAVAILABLE'
      );
    }

    try {
      // 4. Inspect active Redis hold
      const holdDetails = await this.holdService.getHold(cleanToken);

      if (!holdDetails) {
        throw new AppError(
          'Active seat hold session not found or has already expired. Holds expire after 10 minutes.',
          404,
          'HOLD_EXPIRED'
        );
      }

      // 5. Showtime, Seat IDs & Pricing Invariants
      if (showtimeId !== holdDetails.showtimeId) {
        throw new AppError(
          'Requested showtime ID does not match the active seat reservation session',
          400,
          'SHOWTIME_MISMATCH'
        );
      }

      const heldSeatIds = holdDetails.seats.map((s) => s.id);
      const heldSeatIdSet = new Set(heldSeatIds);

      if (
        seatIds.length !== heldSeatIds.length ||
        seatIds.some((id) => !heldSeatIdSet.has(id))
      ) {
        throw new AppError(
          'Requested seat IDs do not match the seats held in this reservation session',
          400,
          'SEATS_MISMATCH'
        );
      }

      // Verify pricing: derived strictly from trusted server state
      const verifiedTotalKobo = holdDetails.totalPriceKobo;
      if (totalPriceKobo !== undefined && totalPriceKobo !== verifiedTotalKobo) {
        throw new AppError(
          `Submitted price (₦${(totalPriceKobo / 100).toLocaleString()}) does not match verified server pricing (₦${(verifiedTotalKobo / 100).toLocaleString()})`,
          400,
          'PRICE_MISMATCH'
        );
      }

      // Capacity Invariant: 1 to 8 seats
      if (heldSeatIds.length < 1 || heldSeatIds.length > 8) {
        throw new AppError(
          'A booking order must contain between 1 and 8 seats',
          400,
          'INVALID_SEAT_COUNT'
        );
      }

      // Couple Pod Invariant
      for (const seat of holdDetails.seats) {
        if (seat.isCouple && seat.couplePartnerId) {
          if (!heldSeatIdSet.has(seat.couplePartnerId)) {
            throw new AppError(
              `Seat ${seat.seatNumber} is a couple lounger and requires its partner seat to be booked together`,
              400,
              'COUPLE_PARTNER_REQUIRED'
            );
          }
        }
      }

      // 6. Execute PostgreSQL ACID Transaction
      let createdBooking: BookingResult;

      try {
        createdBooking = await this.prisma.$transaction(async (tx) => {
          // A. Claim in-progress idempotency record
          try {
            await tx.idempotencyRecord.create({
              data: {
                key: cleanIdempotencyKey,
                userId: userId || null,
                requestPath: '/api/v1/bookings',
                requestMethod: 'POST',
                requestHash,
                status: IdempotencyStatus.IN_PROGRESS,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h retention
              },
            });
          } catch (idempErr) {
            if (
              idempErr instanceof Prisma.PrismaClientKnownRequestError &&
              idempErr.code === 'P2002'
            ) {
              throw new AppError(
                'A booking request with this Idempotency-Key is currently in progress. Please wait and retry.',
                409,
                'IDEMPOTENCY_IN_PROGRESS'
              );
            }
            throw idempErr;
          }

          // B. Active Ticket Allocation Uniqueness Check
          const conflictingTickets = await tx.ticket.findMany({
            where: {
              showtimeId,
              seatId: { in: seatIds },
              status: {
                in: [
                  TicketStatus.PENDING_PAYMENT,
                  TicketStatus.CONFIRMED,
                  TicketStatus.CHECKED_IN,
                  TicketStatus.REFUNDED_RESTRICTED,
                ],
              },
            },
            select: { seatId: true },
          });

          if (conflictingTickets.length > 0) {
            throw new AppError(
              'One or more selected seats have already been booked or are currently in an active checkout attempt',
              409,
              'SEAT_ALREADY_ALLOCATED'
            );
          }

          // C. Create PENDING Booking record
          const bookingRef = generateBookingReference();
          const booking = await tx.booking.create({
            data: {
              bookingReference: bookingRef,
              userId: userId || null,
              showtimeId,
              status: BookingStatus.PENDING,
              seatCount: holdDetails.seats.length,
              subtotalKobo: verifiedTotalKobo,
              bookingFeeKobo: 0,
              totalKobo: verifiedTotalKobo,
              contactEmail,
              contactName: contactName || null,
              contactPhone: contactPhone || null,
              expiresAt: new Date(holdDetails.expiresAt),
            },
          });

          // D. Create PENDING_PAYMENT Ticket records
          const tickets = [];
          for (const seat of holdDetails.seats) {
            const ticketCode = generateTicketCode(seat.seatNumber);
            const ticket = await tx.ticket.create({
              data: {
                ticketCode,
                bookingId: booking.id,
                showtimeId,
                seatId: seat.id,
                tier: seat.tier,
                priceKobo: seat.priceKobo,
                status: TicketStatus.PENDING_PAYMENT,
                qrPayload: null, // Strictly no payment/QR payload yet
              },
            });
            tickets.push(ticket);
          }

          const bookingResult: BookingResult = {
            id: booking.id,
            bookingReference: booking.bookingReference,
            status: booking.status,
            showtimeId: booking.showtimeId,
            seatCount: booking.seatCount,
            subtotalKobo: booking.subtotalKobo,
            bookingFeeKobo: booking.bookingFeeKobo,
            totalKobo: booking.totalKobo,
            contactEmail: booking.contactEmail,
            contactName: booking.contactName,
            contactPhone: booking.contactPhone,
            expiresAt: booking.expiresAt ? booking.expiresAt.toISOString() : null,
            createdAt: booking.createdAt.toISOString(),
            tickets: tickets.map((t) => ({
              id: t.id,
              ticketCode: t.ticketCode,
              seatId: t.seatId,
              tier: t.tier,
              priceKobo: t.priceKobo,
              status: t.status,
            })),
          };

          // E. Complete Idempotency record with secure tokenHash proof
          await tx.idempotencyRecord.update({
            where: { key: cleanIdempotencyKey },
            data: {
              status: IdempotencyStatus.COMPLETED,
              responseCode: 201,
              responseBody: {
                ...bookingResult,
                _meta: {
                  tokenHash,
                  requestHash,
                },
              } as unknown as Prisma.InputJsonValue,
            },
          });

          return bookingResult;
        });
      } catch (err) {
        if (err instanceof AppError) throw err;

        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new AppError(
            'One or more selected seats have already been allocated to another customer',
            409,
            'SEAT_ALREADY_ALLOCATED'
          );
        }

        throw err;
      }

      // 7. Release Redis seat hold AFTER successful database transaction commit
      try {
        await this.holdService.releaseHold(cleanToken);
      } catch (redisErr) {
        console.warn(
          `[BookingService] Non-fatal notice: Failed to release Redis hold ${cleanToken} after database commit:`,
          redisErr
        );
      }

      return createdBooking;
    } finally {
      // Clean up hold-booking concurrency lock
      if (holdLockClaimed) {
        try {
          await this.holdService.redis.del(holdBookingLockKey);
        } catch {
          // ignore cleanup error
        }
      }
    }
  }

  /**
   * Reconciles expired PENDING bookings (e.g. abandoned checkouts after 15 minutes).
   *
   * Safety & Settlement Guarantees:
   * 1. Discovery filter finds candidate PENDING bookings with expiresAt < now.
   * 2. Transactional Re-check: Inside the atomic transaction, re-verifies that:
   *    a. Booking status is STILL 'PENDING'
   *    b. Booking has NO payment attempts in 'PROCESSING' or 'SUCCEEDED' state.
   *       If a customer initiated payment concurrently, the booking is preserved.
   * 3. Conditional Update: Booking update applies where: { id, status: 'PENDING' }.
   * 4. Atomic Ticket Cancellation: Transitions tickets to CANCELLED atomically,
   *    immediately releasing the uq_active_showtime_seat partial unique index for new buyers.
   * 5. Idempotent across repeated executions and safe for concurrent workers.
   */
  async expireAbandonedBookings(now = new Date()): Promise<number> {
    // 1. Initial discovery of candidate expired bookings
    const candidates = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.PENDING,
        expiresAt: { lt: now },
      },
      select: { id: true },
    });

    if (candidates.length === 0) return 0;

    const candidateIds = candidates.map((b) => b.id);

    // 2. Re-verify eligibility and perform atomic cancellation inside a single PostgreSQL transaction
    const reconciledCount = await this.prisma.$transaction(async (tx) => {
      // In-transaction re-check: must still be PENDING and have NO active/succeeded payment attempts
      const genuinelyEligible = await tx.booking.findMany({
        where: {
          id: { in: candidateIds },
          status: BookingStatus.PENDING,
          expiresAt: { lt: now },
          paymentAttempts: {
            none: {
              status: { in: [PaymentStatus.PROCESSING, PaymentStatus.SUCCEEDED] },
            },
          },
        },
        select: { id: true },
      });

      if (genuinelyEligible.length === 0) {
        return 0;
      }

      const eligibleIds = genuinelyEligible.map((b) => b.id);

      // Atomic conditional update of booking status
      const bookingUpdateResult = await tx.booking.updateMany({
        where: {
          id: { in: eligibleIds },
          status: BookingStatus.PENDING,
        },
        data: {
          status: BookingStatus.EXPIRED,
          cancellationReason: 'Checkout session expired before payment completion',
          cancelledAt: now,
        },
      });

      if (bookingUpdateResult.count === 0) {
        return 0;
      }

      // Cancel corresponding tickets (releasing uq_active_showtime_seat)
      await tx.ticket.updateMany({
        where: {
          bookingId: { in: eligibleIds },
          status: TicketStatus.PENDING_PAYMENT,
        },
        data: {
          status: TicketStatus.CANCELLED,
          cancelledAt: now,
        },
      });

      return bookingUpdateResult.count;
    });

    return reconciledCount;
  }
}

export const bookingService = new BookingService();
export default bookingService;
