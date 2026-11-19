import crypto from 'crypto';
import { PrismaClient, SeatTier, ShowtimeStatus, TicketStatus } from '@prisma/client';
import { default as defaultPrisma } from '../db.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  IRedisClient,
  getRedisClient,
  ACQUIRE_HOLD_LUA,
  RELEASE_HOLD_LUA,
  EXTEND_HOLD_LUA,
  RELEASE_IDEMPOTENCY_LOCK_LUA,
  COMPLETE_IDEMPOTENCY_LUA,
} from './redis/index.js';

export const HOLD_TTL_SECONDS = 600; // 10 minutes (strict initial window)
export const MAX_HOLD_SEATS = 8;
export const MIN_HOLD_SEATS = 1;
export const MAX_HOLD_EXTENSIONS = 1; // Strict limit: at most 1 extension
export const EXTENSION_TTL_SECONDS = 300; // 5 minutes additional
export const MAX_HOLD_LIFETIME_MS = 900_000; // 15 minutes absolute maximum lifetime cap

export interface AcquireHoldInput {
  showtimeId: string;
  seatIds: string[];
  userId?: string | null;
  idempotencyKey?: string;
  proofToken?: string;
}

export interface HeldSeatItem {
  id: string;
  seatNumber: string;
  row: string;
  column: number;
  tier: SeatTier;
  isAccessible: boolean;
  isCouple: boolean;
  couplePartnerId: string | null;
  priceKobo: number;
}

export interface SeatHoldResult {
  holdToken: string;
  showtimeId: string;
  seats: HeldSeatItem[];
  totalSeats: number;
  totalPriceKobo: number;
  expiresAt: string;
  expiresInSeconds: number;
}

export interface SeatHoldDetails extends SeatHoldResult {
  userId: string | null;
  createdAt: string;
  extensionCount: number;
}

export interface ReleaseHoldResult {
  releasedSeatsCount: number;
  message: string;
}

export interface ExtendHoldResult {
  holdToken: string;
  expiresAt: string;
  expiresInSeconds: number;
  extensionCount: number;
}

interface IdempotencyRecord {
  idempotencyKey: string;
  showtimeId: string;
  sortedSeatIds: string[];
  holdToken: string;
  result: SeatHoldResult;
  createdAt: number;
  expiresAt: number;
}

export class SeatHoldService {
  private redisClient?: IRedisClient;
  private prisma: PrismaClient;

  constructor(redisClient?: IRedisClient, prismaClient?: PrismaClient) {
    this.redisClient = redisClient;
    this.prisma = prismaClient || defaultPrisma;
  }

  get redis(): IRedisClient {
    return this.redisClient || getRedisClient();
  }

  setRedisClient(client: IRedisClient | null): void {
    this.redisClient = client || undefined;
  }

  private getSeatKey(showtimeId: string, seatId: string): string {
    return `matinee:hold:${showtimeId}:${seatId}`;
  }

  private getTokenKey(holdToken: string): string {
    return `matinee:hold_token:${holdToken}`;
  }

  private getIdempotencyKey(key: string): string {
    return `matinee:idempotency:${key}`;
  }

  /**
   * Masks sensitive hold tokens for safe application logging.
   */
  public maskToken(token: string): string {
    if (!token || token.length < 8) return '***';
    return `${token.slice(0, 8)}...`;
  }

  /**
   * Atomically acquires a 10-minute temporary seat hold across 1–8 seats.
   *
   * SECURITY & CONCURRENCY INVARIANTS:
   * 1. The server strictly issues cryptographically random tokens (256-bit entropy).
   *    Arbitrary client-provided tokens are never accepted to acquire or merge holds.
   * 2. Idempotency-Key is completely decoupled from the secret hold capability token.
   * 3. Idempotent retries are strictly bound to the exact showtime and sorted seat set.
   *    Conflicting reuse of the same Idempotency-Key with different seats fails with 409.
   * 4. Multi-seat acquisition is atomic: if any seat is unavailable, zero seats are held.
   * 5. Active PostgreSQL tickets (PENDING_PAYMENT, CONFIRMED, CHECKED_IN, REFUNDED_RESTRICTED)
   *    are rejected with 409 SEAT_ALREADY_SOLD.
   * 6. Competing Redis holds are rejected with 409 SEAT_HOLD_CONFLICT.
   * 7. Fails closed with 503 if Redis is unreachable.
   */
  async acquireHold(input: AcquireHoldInput): Promise<SeatHoldResult> {
    const { showtimeId, seatIds, userId, idempotencyKey, proofToken } = input;

    // 1. Validate Seat Count (1 to 8 seats)
    if (!Array.isArray(seatIds) || seatIds.length < MIN_HOLD_SEATS) {
      throw new AppError('At least 1 seat must be selected to acquire a hold', 400, 'EMPTY_SEAT_SELECTION');
    }

    // Deduplicate requested seatIds and sort deterministically
    const uniqueSeatIds = Array.from(new Set(seatIds)).sort();
    if (uniqueSeatIds.length > MAX_HOLD_SEATS) {
      throw new AppError(
        `Cannot hold more than ${MAX_HOLD_SEATS} seats per checkout session (received ${uniqueSeatIds.length})`,
        400,
        'MAX_SEATS_EXCEEDED'
      );
    }

    // 2. Idempotency Key Replay & Proof-of-Possession Verification
    let idempotencyRedisKey: string | null = null;
    let inProgressLockClaimed = false;

    if (idempotencyKey && idempotencyKey.trim()) {
      const cleanKey = idempotencyKey.trim();
      idempotencyRedisKey = this.getIdempotencyKey(cleanKey);

      let cachedRecordStr: string | null = null;
      try {
        cachedRecordStr = await this.redis.get(idempotencyRedisKey);
      } catch {
        throw new AppError(
          'Seat hold service is temporarily unavailable. Please try again.',
          503,
          'HOLD_SERVICE_UNAVAILABLE'
        );
      }

      if (cachedRecordStr) {
        let cached: IdempotencyRecord;
        try {
          cached = JSON.parse(cachedRecordStr);
        } catch {
          cached = null as any;
        }

        if (cached) {
          // Check for concurrent in-progress lock
          if ((cached as any).status === 'IN_PROGRESS') {
            throw new AppError(
              'A request with this Idempotency-Key is currently in progress. Please wait and retry.',
              409,
              'IDEMPOTENCY_IN_PROGRESS'
            );
          }

          // Verify exact parameter binding: same showtime and identical seat set
          const isSameShowtime = cached.showtimeId === showtimeId;
          const isSameSeats =
            cached.sortedSeatIds &&
            cached.sortedSeatIds.length === uniqueSeatIds.length &&
            cached.sortedSeatIds.every((id, idx) => id === uniqueSeatIds[idx]);

          if (!isSameShowtime || !isSameSeats) {
            throw new AppError(
              'Idempotency-Key was already used for a different seat reservation request',
              409,
              'IDEMPOTENCY_CONFLICT'
            );
          }

          // Check if the underlying hold token is still alive in Redis
          let remainingTtl = 0;
          try {
            remainingTtl = await this.redis.ttl(this.getTokenKey(cached.holdToken));
          } catch {
            throw new AppError(
              'Seat hold service is temporarily unavailable. Please try again.',
              503,
              'HOLD_SERVICE_UNAVAILABLE'
            );
          }

          if (remainingTtl <= 0) {
            throw new AppError(
              'The seat hold associated with this idempotency key has already expired. Please start a new session.',
              410,
              'IDEMPOTENCY_EXPIRED'
            );
          }

          // CRUCIAL SECURITY INVARIANT: Proof of Possession
          // An Idempotency-Key alone must NEVER function as an authorization credential.
          // Caller must supply matching X-Hold-Token or Bearer token to replay the response.
          const isLegitimateHolder =
            Boolean(proofToken) && proofToken?.trim() === cached.holdToken;

          if (!isLegitimateHolder) {
            // An unauthenticated/anonymous caller who merely guessed or forwarded
            // the Idempotency-Key must NOT receive the secret hold token.
            throw new AppError(
              'A seat hold was already acquired with this idempotency key. Proof of possession of the hold token is required to replay this response.',
              409,
              'HOLD_TOKEN_POSSESSION_REQUIRED'
            );
          }

          // Legitimate holder retrying: safe to return full hold result
          return {
            ...cached.result,
            expiresInSeconds: remainingTtl,
          };
        }
      }

      // Atomically claim in-progress idempotency lock for 30s to serialize concurrent first requests
      let lockOwnerId: string | undefined;
      try {
        lockOwnerId = crypto.randomUUID();
        const lockAcquired = await this.redis.set(
          idempotencyRedisKey,
          JSON.stringify({
            status: 'IN_PROGRESS',
            lockOwnerId,
            showtimeId,
            sortedSeatIds: uniqueSeatIds,
            createdAt: Date.now(),
          }),
          'EX',
          30,
          'NX'
        );

        if (!lockAcquired) {
          throw new AppError(
            'A request with this Idempotency-Key is currently in progress. Please wait and retry.',
            409,
            'IDEMPOTENCY_IN_PROGRESS'
          );
        }
        inProgressLockClaimed = true;
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError(
          'Seat hold service is temporarily unavailable. Please try again.',
          503,
          'HOLD_SERVICE_UNAVAILABLE'
        );
      }

      try {
        return await this.executeAcquisition({
          showtimeId,
          uniqueSeatIds,
          userId,
          idempotencyRedisKey,
          idempotencyKey,
          lockOwnerId,
        });
      } catch (err) {
        // If acquisition fails and an in-progress lock was claimed, delete only if we still own the lock.
        // Prevents race where a timed-out request's cleanup deletes a replacement lock.
        if (inProgressLockClaimed && idempotencyRedisKey && lockOwnerId) {
          try {
            await this.redis.eval(
              RELEASE_IDEMPOTENCY_LOCK_LUA,
              1,
              idempotencyRedisKey,
              lockOwnerId
            );
          } catch {
            // ignore cleanup error
          }
        }
        throw err;
      }
    }

    return await this.executeAcquisition({
      showtimeId,
      uniqueSeatIds,
      userId,
      idempotencyRedisKey: null,
    });
  }

  private async executeAcquisition(params: {
    showtimeId: string;
    uniqueSeatIds: string[];
    userId?: string | null;
    idempotencyRedisKey: string | null;
    idempotencyKey?: string;
    lockOwnerId?: string;
  }): Promise<SeatHoldResult> {
    const { showtimeId, uniqueSeatIds, userId, idempotencyRedisKey, idempotencyKey, lockOwnerId } = params;

    // 3. Showtime Verification & Bookability Guard
    const showtime = await this.prisma.showtime.findUnique({
      where: { id: showtimeId },
      include: {
        auditorium: {
          include: {
            _count: {
              select: { seats: true },
            },
          },
        },
      },
    });

    if (!showtime) {
      throw new AppError(`Showtime with ID '${showtimeId}' not found`, 404, 'SHOWTIME_NOT_FOUND');
    }

    const totalPhysicalSeats = showtime.auditorium._count.seats;
    if (totalPhysicalSeats === 0) {
      throw new AppError(
        'This auditorium has no configured physical seating inventory',
        400,
        'SEATS_UNAVAILABLE'
      );
    }

    const isFuture = new Date(showtime.startTime) > new Date();
    if (!isFuture) {
      throw new AppError('Cannot hold seats for a showtime that has already started or elapsed', 400, 'SHOWTIME_NOT_BOOKABLE');
    }

    if (showtime.status !== ShowtimeStatus.OPEN_FOR_BOOKING) {
      throw new AppError(
        `Showtime status is '${showtime.status}' and is not open for customer booking`,
        400,
        'SHOWTIME_NOT_BOOKABLE'
      );
    }

    // 4. Physical Seat Existence & Auditorium Scoping
    const physicalSeats = await this.prisma.seat.findMany({
      where: {
        id: { in: uniqueSeatIds },
        auditoriumId: showtime.auditoriumId,
        isActive: true,
      },
      orderBy: [{ row: 'asc' }, { column: 'asc' }],
    });

    if (physicalSeats.length !== uniqueSeatIds.length) {
      const foundIds = new Set(physicalSeats.map((s) => s.id));
      const missingIds = uniqueSeatIds.filter((id) => !foundIds.has(id));
      throw new AppError(
        `Requested seat(s) do not exist in this auditorium: ${missingIds.join(', ')}`,
        404,
        'SEAT_NOT_FOUND'
      );
    }

    // 5. Couple Pod Invariant Enforcement
    const seatMap = new Map(physicalSeats.map((s) => [s.id, s]));
    for (const seat of physicalSeats) {
      if (seat.isCouple && seat.couplePartnerId) {
        if (!uniqueSeatIds.includes(seat.couplePartnerId)) {
          const partnerSeat = await this.prisma.seat.findUnique({
            where: { id: seat.couplePartnerId },
            select: { seatNumber: true },
          });
          const partnerLabel = partnerSeat ? partnerSeat.seatNumber : seat.couplePartnerId;
          throw new AppError(
            `Seat ${seat.seatNumber} is a couple lounger and requires its partner seat ${partnerLabel} to be held together`,
            400,
            'COUPLE_PARTNER_REQUIRED'
          );
        }
      }
    }

    // 6. Permanent Ticket Allocation Check in PostgreSQL (Active Uniqueness)
    const activeTickets = await this.prisma.ticket.findMany({
      where: {
        showtimeId,
        seatId: { in: uniqueSeatIds },
        status: {
          in: [
            TicketStatus.PENDING_PAYMENT,
            TicketStatus.CONFIRMED,
            TicketStatus.CHECKED_IN,
            TicketStatus.REFUNDED_RESTRICTED,
          ],
        },
      },
      select: {
        seatId: true,
        status: true,
      },
    });

    if (activeTickets.length > 0) {
      const soldSeatNumbers = activeTickets
        .map((t) => seatMap.get(t.seatId)?.seatNumber || t.seatId)
        .join(', ');
      throw new AppError(
        `Seat(s) ${soldSeatNumbers} are already booked or allocated`,
        409,
        'SEAT_ALREADY_SOLD'
      );
    }

    // 7. Cryptographically Secure Server-Issued Token (256-bit Entropy)
    const holdToken = crypto.randomBytes(32).toString('hex');

    // 8. Atomic Multi-Key Redis Hold Acquisition
    const seatKeys = uniqueSeatIds.map((id) => this.getSeatKey(showtimeId, id));
    const tokenKey = this.getTokenKey(holdToken);
    const expiresAtMs = Date.now() + HOLD_TTL_SECONDS * 1000;
    const expiresAtIso = new Date(expiresAtMs).toISOString();

    const seatPayload = JSON.stringify({
      holdToken,
      showtimeId,
      userId: userId || null,
      createdAt: Date.now(),
      expiresAt: expiresAtMs,
    });

    const tokenPayload = JSON.stringify({
      holdToken,
      showtimeId,
      seatIds: uniqueSeatIds,
      userId: userId || null,
      createdAt: Date.now(),
      expiresAt: expiresAtMs,
      extensionCount: 0,
    });

    let luaResult: unknown;
    try {
      luaResult = await this.redis.eval(
        ACQUIRE_HOLD_LUA,
        seatKeys.length + 1,
        ...seatKeys,
        tokenKey,
        holdToken,
        HOLD_TTL_SECONDS,
        seatPayload,
        tokenPayload
      );
    } catch {
      // Fail closed: Never allow bookings if Redis cannot guarantee exclusivity
      throw new AppError(
        'Seat hold service is temporarily unavailable. Please try again.',
        503,
        'HOLD_SERVICE_UNAVAILABLE'
      );
    }

    const [success, payload] = (luaResult as [number, unknown]) || [0, null];

    if (success !== 1) {
      const conflictingKeys = Array.isArray(payload) ? (payload as string[]) : [];
      const conflictingSeatIds = conflictingKeys.map((k) => k.split(':').pop() || k);
      const conflictingSeatNumbers = conflictingSeatIds
        .map((id) => seatMap.get(id)?.seatNumber || id)
        .join(', ');

      throw new AppError(
        `Seat(s) ${conflictingSeatNumbers || 'requested'} are currently held by another customer. Please choose other seats.`,
        409,
        'SEAT_HOLD_CONFLICT'
      );
    }

    // 9. Map Output Seats with Approved Tier Pricing
    let totalPriceKobo = 0;
    const heldSeats: HeldSeatItem[] = physicalSeats.map((seat) => {
      let priceKobo = showtime.basePriceKobo;
      if (seat.tier === SeatTier.ACCESSIBLE) {
        priceKobo = showtime.accessiblePriceKobo;
      } else if (seat.tier === SeatTier.VIP) {
        priceKobo = showtime.vipPriceKobo;
      } else if (seat.tier === SeatTier.COUPLE) {
        priceKobo = Math.round(showtime.couplePairPriceKobo / 2);
      }
      totalPriceKobo += priceKobo;

      return {
        id: seat.id,
        seatNumber: seat.seatNumber,
        row: seat.row,
        column: seat.column,
        tier: seat.tier,
        isAccessible: seat.isAccessible,
        isCouple: seat.isCouple,
        couplePartnerId: seat.couplePartnerId,
        priceKobo,
      };
    });

    const result: SeatHoldResult = {
      holdToken,
      showtimeId,
      seats: heldSeats,
      totalSeats: heldSeats.length,
      totalPriceKobo,
      expiresAt: expiresAtIso,
      expiresInSeconds: HOLD_TTL_SECONDS,
    };

    // 10. Cache Idempotency Key Record if provided
    if (idempotencyRedisKey && idempotencyKey && idempotencyKey.trim()) {
      const cleanKey = idempotencyKey.trim();
      const completedPayload = JSON.stringify({
        status: 'COMPLETED',
        idempotencyKey: cleanKey,
        showtimeId,
        sortedSeatIds: uniqueSeatIds,
        holdToken,
        result,
        createdAt: Date.now(),
        expiresAt: expiresAtMs,
      });

      try {
        if (lockOwnerId) {
          // Atomically transition from IN_PROGRESS to COMPLETED only if this request still owns the lock
          await this.redis.eval(
            COMPLETE_IDEMPOTENCY_LUA,
            1,
            idempotencyRedisKey,
            lockOwnerId,
            completedPayload,
            HOLD_TTL_SECONDS
          );
        } else {
          await this.redis.set(
            idempotencyRedisKey,
            completedPayload,
            'EX',
            HOLD_TTL_SECONDS
          );
        }
      } catch {
        // Idempotency caching error is non-fatal to the hold itself
      }
    }

    return result;
  }

  /**
   * Inspects active hold details and remaining TTL.
   * Requires proof of token possession (header capability token).
   */
  async getHold(holdToken: string): Promise<SeatHoldDetails | null> {
    if (!holdToken || !holdToken.trim()) {
      throw new AppError('Hold capability token is required', 401, 'MISSING_HOLD_TOKEN');
    }

    const tokenKey = this.getTokenKey(holdToken.trim());
    let tokenDataStr: string | null = null;
    let remainingTtl = 0;

    try {
      tokenDataStr = await this.redis.get(tokenKey);
      remainingTtl = await this.redis.ttl(tokenKey);
    } catch {
      throw new AppError(
        'Seat hold service is temporarily unavailable. Please try again.',
        503,
        'HOLD_SERVICE_UNAVAILABLE'
      );
    }

    if (!tokenDataStr || remainingTtl <= 0) {
      return null;
    }

    let tokenData: any;
    try {
      tokenData = JSON.parse(tokenDataStr);
    } catch {
      return null;
    }

    const { showtimeId, seatIds, userId, createdAt, expiresAt, extensionCount = 0 } = tokenData;

    const [showtime, physicalSeats] = await Promise.all([
      this.prisma.showtime.findUnique({ where: { id: showtimeId } }),
      this.prisma.seat.findMany({
        where: { id: { in: seatIds } },
        orderBy: [{ row: 'asc' }, { column: 'asc' }],
      }),
    ]);

    if (!showtime) return null;

    let totalPriceKobo = 0;
    const seats: HeldSeatItem[] = physicalSeats.map((seat) => {
      let priceKobo = showtime.basePriceKobo;
      if (seat.tier === SeatTier.ACCESSIBLE) {
        priceKobo = showtime.accessiblePriceKobo;
      } else if (seat.tier === SeatTier.VIP) {
        priceKobo = showtime.vipPriceKobo;
      } else if (seat.tier === SeatTier.COUPLE) {
        priceKobo = Math.round(showtime.couplePairPriceKobo / 2);
      }
      totalPriceKobo += priceKobo;

      return {
        id: seat.id,
        seatNumber: seat.seatNumber,
        row: seat.row,
        column: seat.column,
        tier: seat.tier,
        isAccessible: seat.isAccessible,
        isCouple: seat.isCouple,
        couplePartnerId: seat.couplePartnerId,
        priceKobo,
      };
    });

    return {
      holdToken,
      showtimeId,
      userId: userId || null,
      seats,
      totalSeats: seats.length,
      totalPriceKobo,
      createdAt: new Date(createdAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      expiresInSeconds: remainingTtl,
      extensionCount,
    };
  }

  /**
   * Safely releases held seats.
   * Requires proof of token possession (header capability token).
   */
  async releaseHold(holdToken: string): Promise<ReleaseHoldResult> {
    if (!holdToken || !holdToken.trim()) {
      throw new AppError('Hold capability token is required to release hold', 401, 'MISSING_HOLD_TOKEN');
    }

    const token = holdToken.trim();
    const tokenKey = this.getTokenKey(token);

    let tokenDataStr: string | null = null;
    try {
      tokenDataStr = await this.redis.get(tokenKey);
    } catch {
      throw new AppError(
        'Seat hold service is temporarily unavailable. Please try again.',
        503,
        'HOLD_SERVICE_UNAVAILABLE'
      );
    }

    if (!tokenDataStr) {
      throw new AppError('Hold not found or already expired', 404, 'HOLD_NOT_FOUND');
    }

    let tokenData: any;
    try {
      tokenData = JSON.parse(tokenDataStr);
    } catch {
      throw new AppError('Corrupted hold session data', 500, 'HOLD_DATA_ERROR');
    }

    const { showtimeId, seatIds } = tokenData;
    const seatKeys = (seatIds as string[]).map((id) => this.getSeatKey(showtimeId, id));

    let luaResult: unknown;
    try {
      luaResult = await this.redis.eval(
        RELEASE_HOLD_LUA,
        seatKeys.length + 1,
        ...seatKeys,
        tokenKey,
        token
      );
    } catch {
      throw new AppError(
        'Seat hold service is temporarily unavailable. Please try again.',
        503,
        'HOLD_SERVICE_UNAVAILABLE'
      );
    }

    const [success, deletedCount] = (luaResult as [number, number | string]) || [0, 0];

    if (success !== 1) {
      if (deletedCount === 'TOKEN_MISMATCH') {
        throw new AppError('Unauthorized: hold token does not match held seats', 403, 'HOLD_UNAUTHORIZED');
      }
      throw new AppError('Hold not found or already expired', 404, 'HOLD_NOT_FOUND');
    }

    return {
      releasedSeatsCount: Number(deletedCount),
      message: 'Seat hold successfully released',
    };
  }

  /**
   * Extends active seat hold window (Heartbeat).
   *
   * LIFETIME & EXTENSION INVARIANTS:
   * 1. Requires valid, unexpired hold capability token via header.
   * 2. Cannot resurrect expired tokens (returns 404 HOLD_NOT_FOUND).
   * 3. Strictly limited to MAX_HOLD_EXTENSIONS (1 extension). Attempting a 2nd extension fails with 400.
   * 4. Lifetime is capped at MAX_HOLD_LIFETIME_MS (15 minutes).
   */
  async extendHold(holdToken: string): Promise<ExtendHoldResult> {
    if (!holdToken || !holdToken.trim()) {
      throw new AppError('Hold capability token is required for heartbeat renewal', 401, 'MISSING_HOLD_TOKEN');
    }

    const token = holdToken.trim();
    const tokenKey = this.getTokenKey(token);

    let tokenDataStr: string | null = null;
    try {
      tokenDataStr = await this.redis.get(tokenKey);
    } catch {
      throw new AppError(
        'Seat hold service is temporarily unavailable. Please try again.',
        503,
        'HOLD_SERVICE_UNAVAILABLE'
      );
    }

    if (!tokenDataStr) {
      throw new AppError('Hold not found or already expired. Expired holds cannot be renewed.', 404, 'HOLD_NOT_FOUND');
    }

    let tokenData: any;
    try {
      tokenData = JSON.parse(tokenDataStr);
    } catch {
      throw new AppError('Corrupted hold session data', 500, 'HOLD_DATA_ERROR');
    }

    const { showtimeId, seatIds } = tokenData;
    const seatKeys = (seatIds as string[]).map((id) => this.getSeatKey(showtimeId, id));

    let luaResult: unknown;
    try {
      luaResult = await this.redis.eval(
        EXTEND_HOLD_LUA,
        seatKeys.length + 1,
        ...seatKeys,
        tokenKey,
        token,
        EXTENSION_TTL_SECONDS,
        MAX_HOLD_EXTENSIONS,
        Date.now(),
        MAX_HOLD_LIFETIME_MS
      );
    } catch {
      throw new AppError(
        'Seat hold service is temporarily unavailable. Please try again.',
        503,
        'HOLD_SERVICE_UNAVAILABLE'
      );
    }

    const [success, payload1, payload2, payload3] = (luaResult as [number, any, any, any]) || [0, null, null, null];

    if (success !== 1) {
      if (payload1 === 'MAX_EXTENSIONS_EXCEEDED') {
        throw new AppError(
          `Maximum hold extension limit (${MAX_HOLD_EXTENSIONS}) reached. Holds cannot be renewed further.`,
          400,
          'MAX_HOLD_EXTENSIONS_EXCEEDED'
        );
      }
      if (payload1 === 'MAX_LIFETIME_EXCEEDED') {
        throw new AppError(
          'Maximum hold session lifetime reached. Hold cannot be extended further.',
          400,
          'MAX_HOLD_LIFETIME_EXCEEDED'
        );
      }
      if (payload1 === 'TOKEN_MISMATCH') {
        throw new AppError('Unauthorized: hold token does not match held seats', 403, 'HOLD_UNAUTHORIZED');
      }
      throw new AppError('Hold not found or already expired', 404, 'HOLD_NOT_FOUND');
    }

    const newTtl = Number(payload1);
    const newExpiresAtMs = Number(payload2);
    const extensionCount = Number(payload3);

    return {
      holdToken: token,
      expiresAt: new Date(newExpiresAtMs).toISOString(),
      expiresInSeconds: newTtl,
      extensionCount,
    };
  }
}

export const seatHoldService = new SeatHoldService();
export default seatHoldService;
