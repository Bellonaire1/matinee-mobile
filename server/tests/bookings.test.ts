import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { app } from '../src/app.js';
import { testRequest } from './helpers/testRequest.js';
import { prisma } from '../src/db.js';
import {
  BookingStatus,
  IdempotencyStatus,
  PaymentStatus,
  Prisma,
  ScreenFormat,
  SeatTier,
  ShowtimeStatus,
  TicketStatus,
} from '@prisma/client';
import { InMemoryRedisClient } from '../src/services/redis/inMemoryRedisClient.js';
import { setRedisClient } from '../src/services/redis/index.js';
import seatHoldService from '../src/services/seatHoldService.js';
import bookingService from '../src/services/bookingService.js';

describe('Matinee Transactional Booking Foundation (POST /api/v1/bookings)', () => {
  let memoryRedis: InMemoryRedisClient;

  const mockShowtime = {
    id: 'st-dune-lekki-1430',
    auditoriumId: 'aud-lekki-imax-01',
    movieId: 'mov-dune-part-two',
    startTime: new Date(Date.now() + 3600000),
    endTime: new Date(Date.now() + 9600000),
    format: ScreenFormat.IMAX_LASER,
    status: ShowtimeStatus.OPEN_FOR_BOOKING,
    basePriceKobo: 700000,
    vipPriceKobo: 950000,
    couplePairPriceKobo: 1200000,
    accessiblePriceKobo: 700000,
    auditorium: {
      id: 'aud-lekki-imax-01',
      name: 'Screen 1 (Laser IMAX & Recliners)',
      screenNumber: 1,
      _count: { seats: 320 },
    },
  };

  const mockSeats = [
    {
      id: 'seat-b1',
      auditoriumId: 'aud-lekki-imax-01',
      row: 'B',
      column: 1,
      seatNumber: 'B1',
      tier: SeatTier.STANDARD,
      isAccessible: false,
      isCouple: false,
      couplePartnerId: null,
      isActive: true,
    },
    {
      id: 'seat-b2',
      auditoriumId: 'aud-lekki-imax-01',
      row: 'B',
      column: 2,
      seatNumber: 'B2',
      tier: SeatTier.STANDARD,
      isAccessible: false,
      isCouple: false,
      couplePartnerId: null,
      isActive: true,
    },
    {
      id: 'seat-s1',
      auditoriumId: 'aud-lekki-imax-01',
      row: 'S',
      column: 1,
      seatNumber: 'S1',
      tier: SeatTier.COUPLE,
      isAccessible: false,
      isCouple: true,
      couplePartnerId: 'seat-s2',
      isActive: true,
    },
    {
      id: 'seat-s2',
      auditoriumId: 'aud-lekki-imax-01',
      row: 'S',
      column: 2,
      seatNumber: 'S2',
      tier: SeatTier.COUPLE,
      isAccessible: false,
      isCouple: true,
      couplePartnerId: 'seat-s1',
      isActive: true,
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    memoryRedis = new InMemoryRedisClient();
    setRedisClient(memoryRedis);
    seatHoldService.setRedisClient(memoryRedis);

    // Default Prisma mocks for offline testing
    vi.spyOn(prisma.showtime, 'findUnique').mockResolvedValue(mockShowtime as any);
    vi.spyOn(prisma.seat, 'findMany').mockImplementation(async (args: any) => {
      const ids = args?.where?.id?.in || [];
      return mockSeats.filter((s) => ids.includes(s.id)) as any;
    });
    vi.spyOn(prisma.seat, 'findUnique').mockImplementation(async (args: any) => {
      return mockSeats.find((s) => s.id === args?.where?.id) as any;
    });
    vi.spyOn(prisma.ticket, 'findMany').mockResolvedValue([]);
    vi.spyOn(prisma.idempotencyRecord, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma.idempotencyRecord, 'create').mockResolvedValue({} as any);
    vi.spyOn(prisma.idempotencyRecord, 'update').mockResolvedValue({} as any);
  });

  // Helper to acquire a real in-memory seat hold
  async function acquireTestHold(seatIds = ['seat-b1']): Promise<string> {
    const res = await testRequest(app, {
      method: 'POST',
      url: `/api/v1/showtimes/${mockShowtime.id}/holds`,
      body: { seatIds },
    });
    expect(res.status).toBe(201);
    return res.body.data.holdToken;
  }

  describe('1. Mandatory Idempotency-Key Validation (Phase 1)', () => {
    it('rejects missing Idempotency-Key header with 400 MISSING_IDEMPOTENCY_KEY', async () => {
      const holdToken = await acquireTestHold(['seat-b1']);

      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/bookings',
        headers: { 'X-Hold-Token': holdToken }, // No Idempotency-Key!
        body: {
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b1'],
          contactEmail: 'user@example.com',
        },
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
      expect(res.body.message).toContain('Idempotency-Key header is required');
    });

    it('rejects blank or whitespace Idempotency-Key header with 400 MISSING_IDEMPOTENCY_KEY', async () => {
      const holdToken = await acquireTestHold(['seat-b1']);

      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/bookings',
        headers: {
          'X-Hold-Token': holdToken,
          'Idempotency-Key': '    ',
        },
        body: {
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b1'],
          contactEmail: 'user@example.com',
        },
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
    });

    it('rejects malformed Idempotency-Key (too short or invalid chars) with 400 MALFORMED_IDEMPOTENCY_KEY', async () => {
      const holdToken = await acquireTestHold(['seat-b1']);

      // 1. Too short (< 16 characters)
      const resShort = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/bookings',
        headers: {
          'X-Hold-Token': holdToken,
          'Idempotency-Key': 'short-key',
        },
        body: {
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b1'],
          contactEmail: 'user@example.com',
        },
      });
      expect(resShort.status).toBe(400);
      expect(resShort.body.code).toBe('MALFORMED_IDEMPOTENCY_KEY');

      // 2. Contains invalid characters (e.g. whitespace, symbols)
      const resInvalid = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/bookings',
        headers: {
          'X-Hold-Token': holdToken,
          'Idempotency-Key': 'invalid key with spaces!@#12345',
        },
        body: {
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b1'],
          contactEmail: 'user@example.com',
        },
      });
      expect(resInvalid.status).toBe(400);
      expect(resInvalid.body.code).toBe('MALFORMED_IDEMPOTENCY_KEY');
    });

    it('accepts properly formatted UUID v4 as Idempotency-Key', async () => {
      const holdToken = await acquireTestHold(['seat-b1']);
      const validUuid = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

      const mockBookingRecord = {
        id: 'bk-uuid-001',
        bookingReference: 'MAT-1234-ABCD',
        userId: null,
        showtimeId: mockShowtime.id,
        status: BookingStatus.PENDING,
        seatCount: 1,
        subtotalKobo: 700000,
        bookingFeeKobo: 0,
        totalKobo: 700000,
        contactEmail: 'user@example.com',
        contactName: null,
        contactPhone: null,
        expiresAt: new Date(Date.now() + 600000),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          idempotencyRecord: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({}),
            update: vi.fn().mockResolvedValue({}),
          },
          ticket: {
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockResolvedValue({
              id: 'tkt-1',
              ticketCode: 'TKT-1',
              seatId: 'seat-b1',
              tier: SeatTier.STANDARD,
              priceKobo: 700000,
              status: TicketStatus.PENDING_PAYMENT,
            }),
          },
          booking: {
            create: vi.fn().mockResolvedValue(mockBookingRecord),
          },
        };
        return cb(tx);
      });

      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/bookings',
        headers: {
          'X-Hold-Token': holdToken,
          'Idempotency-Key': validUuid,
        },
        body: {
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b1'],
          contactEmail: 'user@example.com',
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe('bk-uuid-001');
    });
  });

  describe('2. Valid Pending Booking Creation & Lifecycle Invariants', () => {
    const validKey = 'bk-idemp-valid-test-1234';

    it('creates PENDING booking and PENDING_PAYMENT ticket records atomically', async () => {
      const holdToken = await acquireTestHold(['seat-b1']);

      const mockBookingRecord = {
        id: 'bk-uuid-001',
        bookingReference: 'MAT-1234-ABCD',
        userId: null,
        showtimeId: mockShowtime.id,
        status: BookingStatus.PENDING,
        seatCount: 1,
        subtotalKobo: 700000,
        bookingFeeKobo: 0,
        totalKobo: 700000,
        contactEmail: 'customer@example.com',
        contactName: 'Ada Lovelace',
        contactPhone: '+2348012345678',
        expiresAt: new Date(Date.now() + 600000),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockTicketRecord = {
        id: 'tkt-uuid-001',
        ticketCode: 'TKT-5678-B1',
        bookingId: 'bk-uuid-001',
        showtimeId: mockShowtime.id,
        seatId: 'seat-b1',
        tier: SeatTier.STANDARD,
        priceKobo: 700000,
        status: TicketStatus.PENDING_PAYMENT,
        qrPayload: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          idempotencyRecord: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({}),
            update: vi.fn().mockResolvedValue({}),
          },
          ticket: {
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockResolvedValue(mockTicketRecord),
          },
          booking: {
            create: vi.fn().mockResolvedValue(mockBookingRecord),
          },
        };
        return cb(tx);
      });

      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/bookings',
        headers: {
          'X-Hold-Token': holdToken,
          'Idempotency-Key': validKey,
        },
        body: {
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b1'],
          contactEmail: 'customer@example.com',
          contactName: 'Ada Lovelace',
          contactPhone: '+2348012345678',
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.id).toBe('bk-uuid-001');
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.subtotalKobo).toBe(700000);
      expect(res.body.data.totalKobo).toBe(700000);
      expect(res.body.data.bookingReference).toMatch(/^MAT-/);

      // Verify tickets array
      expect(res.body.data.tickets).toHaveLength(1);
      expect(res.body.data.tickets[0].status).toBe('PENDING_PAYMENT');
      expect(res.body.data.tickets[0].priceKobo).toBe(700000);

      // Verify Redis hold was released after database commit
      const holdAfter = await memoryRedis.get(`matinee:hold_token:${holdToken}`);
      expect(holdAfter).toBeNull();
    });

    it('requires hold capability token strictly in headers; rejects token in request body', async () => {
      // 1. Missing header
      const resMissing = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/bookings',
        headers: { 'Idempotency-Key': validKey },
        body: {
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b1'],
          contactEmail: 'customer@example.com',
        },
      });
      expect(resMissing.status).toBe(401);
      expect(resMissing.body.code).toBe('MISSING_HOLD_TOKEN');

      // 2. Secret token passed in request body instead of header MUST BE REJECTED
      const resBodyToken = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/bookings',
        headers: { 'Idempotency-Key': validKey },
        body: {
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b1'],
          contactEmail: 'customer@example.com',
          holdToken: 'attempted-body-secret-token',
        },
      });
      expect(resBodyToken.status).toBe(401);
      expect(resBodyToken.body.code).toBe('MISSING_HOLD_TOKEN');
    });

    it('rejects showtime mismatch between hold session and booking request', async () => {
      const holdToken = await acquireTestHold(['seat-b1']);

      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/bookings',
        headers: {
          'X-Hold-Token': holdToken,
          'Idempotency-Key': validKey,
        },
        body: {
          showtimeId: 'different-showtime-id',
          seatIds: ['seat-b1'],
          contactEmail: 'customer@example.com',
        },
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SHOWTIME_MISMATCH');
    });

    it('rejects seat IDs mismatch between hold session and booking request', async () => {
      const holdToken = await acquireTestHold(['seat-b1']);

      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/bookings',
        headers: {
          'X-Hold-Token': holdToken,
          'Idempotency-Key': validKey,
        },
        body: {
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b2'],
          contactEmail: 'customer@example.com',
        },
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SEATS_MISMATCH');
    });

    it('never trusts client-supplied total price: rejects price tampering with 400 PRICE_MISMATCH', async () => {
      const holdToken = await acquireTestHold(['seat-b1']);

      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/bookings',
        headers: {
          'X-Hold-Token': holdToken,
          'Idempotency-Key': validKey,
        },
        body: {
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b1'],
          contactEmail: 'customer@example.com',
          totalPriceKobo: 500000,
        },
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PRICE_MISMATCH');
      expect(res.body.message).toContain('verified server pricing');
    });
  });

  describe('3. Idempotent Retries & Capability Security (Phases 1 & 2)', () => {
    it('recovers booking safely after lost HTTP response and Redis hold release', async () => {
      const holdToken = await acquireTestHold(['seat-b1']);
      const idempotencyKey = 'bk-idemp-lost-response-test';
      const tokenHash = crypto.createHash('sha256').update(holdToken).digest('hex');
      const requestHash = crypto
        .createHash('sha256')
        .update(JSON.stringify({
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b1'],
          contactEmail: 'customer@example.com',
        }))
        .digest('hex');

      const cachedBookingResult = {
        id: 'bk-original-001',
        bookingReference: 'MAT-8888-LOST',
        status: BookingStatus.PENDING,
        showtimeId: mockShowtime.id,
        seatCount: 1,
        subtotalKobo: 700000,
        bookingFeeKobo: 0,
        totalKobo: 700000,
        contactEmail: 'customer@example.com',
        contactName: null,
        contactPhone: null,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        createdAt: new Date().toISOString(),
        tickets: [
          {
            id: 'tkt-orig-1',
            ticketCode: 'TKT-8888-B1',
            seatId: 'seat-b1',
            tier: SeatTier.STANDARD,
            priceKobo: 700000,
            status: TicketStatus.PENDING_PAYMENT,
          },
        ],
        _meta: {
          tokenHash,
          requestHash,
        },
      };

      // Mock database returning the already-completed idempotency record
      vi.spyOn(prisma.idempotencyRecord, 'findUnique').mockResolvedValue({
        key: idempotencyKey,
        userId: null,
        requestPath: '/api/v1/bookings',
        requestMethod: 'POST',
        requestHash,
        status: IdempotencyStatus.COMPLETED,
        responseCode: 201,
        responseBody: cachedBookingResult as any,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Explicitly delete the Redis hold to simulate Redis hold released after commit
      await memoryRedis.del(`matinee:hold_token:${holdToken}`);
      expect(await memoryRedis.get(`matinee:hold_token:${holdToken}`)).toBeNull();

      // Customer retries the same request with same Idempotency-Key and X-Hold-Token
      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/bookings',
        headers: {
          'X-Hold-Token': holdToken,
          'Idempotency-Key': idempotencyKey,
        },
        body: {
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b1'],
          contactEmail: 'customer@example.com',
        },
      });

      // Must succeed with original booking without requiring an active Redis hold
      expect(res.status).toBe(200);
      expect(res.headers['idempotency-replay']).toBe('true');
      expect(res.body.data.id).toBe('bk-original-001');
      expect(res.body.data.bookingReference).toBe('MAT-8888-LOST');
      expect(res.body.data._meta).toBeUndefined(); // Internal metadata must not leak
      expect(res.body.data.isReplay).toBeUndefined(); // Internal controller flag stripped
    });

    it('rejects wrong caller attempting to replay booking without proof of hold token', async () => {
      const idempotencyKey = 'bk-idemp-hijack-attempt';
      const genuineToken = 'genuine-token-123456';
      const genuineTokenHash = crypto.createHash('sha256').update(genuineToken).digest('hex');
      const requestHash = crypto
        .createHash('sha256')
        .update(JSON.stringify({
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b1'],
          contactEmail: 'victim@example.com',
        }))
        .digest('hex');

      vi.spyOn(prisma.idempotencyRecord, 'findUnique').mockResolvedValue({
        key: idempotencyKey,
        userId: null,
        requestPath: '/api/v1/bookings',
        requestMethod: 'POST',
        requestHash,
        status: IdempotencyStatus.COMPLETED,
        responseCode: 201,
        responseBody: {
          id: 'bk-victim-001',
          bookingReference: 'MAT-VICTIM-01',
          contactEmail: 'victim@example.com',
          _meta: { tokenHash: genuineTokenHash, requestHash },
        } as any,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Attacker B attempts replay with wrong hold token
      const resWrongToken = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/bookings',
        headers: {
          'X-Hold-Token': 'attacker-different-token-999',
          'Idempotency-Key': idempotencyKey,
        },
        body: {
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b1'],
          contactEmail: 'victim@example.com',
        },
      });

      expect(resWrongToken.status).toBe(403);
      expect(resWrongToken.body.code).toBe('HOLD_TOKEN_POSSESSION_REQUIRED');
      expect(resWrongToken.body.message).toContain('Proof of possession');
    });

    it('rejects same idempotency key with conflicting payload (409 IDEMPOTENCY_CONFLICT)', async () => {
      const idempotencyKey = 'bk-idemp-conflict-test';
      const genuineToken = 'token-conflict-123';
      const genuineTokenHash = crypto.createHash('sha256').update(genuineToken).digest('hex');
      const originalRequestHash = crypto
        .createHash('sha256')
        .update(JSON.stringify({
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b1'],
          contactEmail: 'user@example.com',
        }))
        .digest('hex');

      vi.spyOn(prisma.idempotencyRecord, 'findUnique').mockResolvedValue({
        key: idempotencyKey,
        userId: null,
        requestPath: '/api/v1/bookings',
        requestMethod: 'POST',
        requestHash: originalRequestHash,
        status: IdempotencyStatus.COMPLETED,
        responseCode: 201,
        responseBody: {
          id: 'bk-orig-123',
          _meta: { tokenHash: genuineTokenHash, requestHash: originalRequestHash },
        } as any,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Re-use key with different seats ['seat-b2']
      const resConflict = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/bookings',
        headers: {
          'X-Hold-Token': genuineToken,
          'Idempotency-Key': idempotencyKey,
        },
        body: {
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b2'],
          contactEmail: 'user@example.com',
        },
      });

      expect(resConflict.status).toBe(409);
      expect(resConflict.body.code).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('rejects simultaneous same-key in-progress request with 409 IDEMPOTENCY_IN_PROGRESS', async () => {
      const idempotencyKey = 'bk-idemp-in-progress-race';
      const holdToken = await acquireTestHold(['seat-b1']);

      vi.spyOn(prisma.idempotencyRecord, 'findUnique').mockResolvedValue({
        key: idempotencyKey,
        status: IdempotencyStatus.IN_PROGRESS,
      } as any);

      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/bookings',
        headers: {
          'X-Hold-Token': holdToken,
          'Idempotency-Key': idempotencyKey,
        },
        body: {
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b1'],
          contactEmail: 'customer@example.com',
        },
      });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('IDEMPOTENCY_IN_PROGRESS');
    });

    it('prevents two different idempotency keys from duplicating checkout on the same hold', async () => {
      const holdToken = await acquireTestHold(['seat-b1']);

      // Pre-set hold checkout lock to simulate Request 1 in flight with key-1
      const holdLockKey = `matinee:hold_booking_lock:${holdToken}`;
      await memoryRedis.set(holdLockKey, 'bk-key-1-in-flight-999', 'EX', 60);

      // Request 2 arrives with key-2 attempting checkout on the same hold
      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/bookings',
        headers: {
          'X-Hold-Token': holdToken,
          'Idempotency-Key': 'bk-key-2-competing-888',
        },
        body: {
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b1'],
          contactEmail: 'customer2@example.com',
        },
      });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_IN_PROGRESS');
      expect(res.body.message).toContain('already in progress');
    });
  });

  describe('4. Concurrency, ACID Rollback & Uniqueness Invariants', () => {
    const validKey = 'bk-idemp-acid-test-1234';

    it('detects already allocated seats in PostgreSQL and maps to 409 SEAT_ALREADY_ALLOCATED', async () => {
      const holdToken = await acquireTestHold(['seat-b1']);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          idempotencyRecord: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({}),
            update: vi.fn().mockResolvedValue({}),
          },
          ticket: {
            findMany: vi.fn().mockResolvedValue([{ seatId: 'seat-b1' }]),
          },
        };
        return cb(tx);
      });

      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/bookings',
        headers: {
          'X-Hold-Token': holdToken,
          'Idempotency-Key': validKey,
        },
        body: {
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b1'],
          contactEmail: 'customer@example.com',
        },
      });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SEAT_ALREADY_ALLOCATED');
    });

    it('maps PostgreSQL unique constraint violation (P2002) to 409 SEAT_ALREADY_ALLOCATED', async () => {
      const holdToken = await acquireTestHold(['seat-b1']);

      vi.spyOn(prisma, '$transaction').mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.x',
        })
      );

      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/bookings',
        headers: {
          'X-Hold-Token': holdToken,
          'Idempotency-Key': validKey,
        },
        body: {
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b1'],
          contactEmail: 'customer@example.com',
        },
      });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SEAT_ALREADY_ALLOCATED');
    });

    it('rolls back entire transaction if any ticket creation fails; retains Redis hold', async () => {
      const holdToken = await acquireTestHold(['seat-b1', 'seat-b2']);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        let ticketCount = 0;
        const tx = {
          idempotencyRecord: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({}),
            update: vi.fn().mockResolvedValue({}),
          },
          ticket: {
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockImplementation(() => {
              ticketCount++;
              if (ticketCount === 2) {
                throw new Error('Database disk error during ticket creation');
              }
              return Promise.resolve({ id: 'tkt-1' });
            }),
          },
          booking: {
            create: vi.fn().mockResolvedValue({ id: 'bk-1' }),
          },
        };
        return cb(tx);
      });

      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/bookings',
        headers: {
          'X-Hold-Token': holdToken,
          'Idempotency-Key': validKey,
        },
        body: {
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b1', 'seat-b2'],
          contactEmail: 'customer@example.com',
        },
      });

      expect(res.status).toBe(500);
      // Redis hold was NOT released because the transaction aborted
      const holdAfter = await memoryRedis.get(`matinee:hold_token:${holdToken}`);
      expect(holdAfter).not.toBeNull();
    });

    it('safe degradation: failure to release Redis hold after DB commit does NOT log secret token or fail booking', async () => {
      const holdToken = await acquireTestHold(['seat-b1']);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const mockBookingRecord = {
        id: 'bk-safe-001',
        bookingReference: 'MAT-9999-SAFE',
        userId: null,
        showtimeId: mockShowtime.id,
        status: BookingStatus.PENDING,
        seatCount: 1,
        subtotalKobo: 700000,
        bookingFeeKobo: 0,
        totalKobo: 700000,
        contactEmail: 'customer@example.com',
        contactName: null,
        contactPhone: null,
        expiresAt: new Date(Date.now() + 600000),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          idempotencyRecord: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({}),
            update: vi.fn().mockResolvedValue({}),
          },
          ticket: {
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockResolvedValue({
              id: 'tkt-1',
              ticketCode: 'TKT-1',
              seatId: 'seat-b1',
              tier: SeatTier.STANDARD,
              priceKobo: 700000,
              status: TicketStatus.PENDING_PAYMENT,
            }),
          },
          booking: {
            create: vi.fn().mockResolvedValue(mockBookingRecord),
          },
        };
        return cb(tx);
      });

      // Simulate Redis release failure
      vi.spyOn(seatHoldService, 'releaseHold').mockRejectedValueOnce(
        new Error('Redis connection severed')
      );

      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/bookings',
        headers: {
          'X-Hold-Token': holdToken,
          'Idempotency-Key': validKey,
        },
        body: {
          showtimeId: mockShowtime.id,
          seatIds: ['seat-b1'],
          contactEmail: 'customer@example.com',
        },
      });

      // Response MUST still succeed with 201 because the database transaction committed
      expect(res.status).toBe(201);
      expect(res.body.data.bookingReference).toBe('MAT-9999-SAFE');

      // PHASE 1 VERIFICATION: Full secret capability token MUST NOT appear in logs
      expect(consoleWarnSpy).toHaveBeenCalled();
      for (const callArgs of consoleWarnSpy.mock.calls) {
        const fullMessage = callArgs.map(String).join(' ');
        expect(fullMessage).not.toContain(holdToken);
      }

      // Secret token MUST NOT leak in the HTTP response body
      expect(JSON.stringify(res.body)).not.toContain(holdToken);
      consoleWarnSpy.mockRestore();
    });

    describe('Booking-Lock Lifecycle & Atomic Nonce Compare-and-Delete (Phase 2)', () => {
      it('prevents concurrent checkouts on the same hold with 409 BOOKING_IN_PROGRESS', async () => {
        const holdToken = await acquireTestHold(['seat-b1']);
        const lockKey = `matinee:hold_booking_lock:${holdToken}`;

        // Pre-set lock simulating Request 1 in flight
        await memoryRedis.set(lockKey, 'active-owner-nonce', 'EX', 60);

        const res = await testRequest(app, {
          method: 'POST',
          url: '/api/v1/bookings',
          headers: {
            'X-Hold-Token': holdToken,
            'Idempotency-Key': 'bk-concurrent-test-key-1',
          },
          body: {
            showtimeId: mockShowtime.id,
            seatIds: ['seat-b1'],
            contactEmail: 'customer2@example.com',
          },
        });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('BOOKING_IN_PROGRESS');
      });

      it('enforces 60-second TTL on booking lock, allowing replacement acquisition after expiry', async () => {
        const holdToken = await acquireTestHold(['seat-b1']);
        const lockKey = `matinee:hold_booking_lock:${holdToken}`;

        // Acquire lock with 60s TTL
        await memoryRedis.set(lockKey, 'owner-a-nonce', 'EX', 60);
        const ttlBefore = await memoryRedis.ttl(lockKey);
        expect(ttlBefore).toBeGreaterThan(0);
        expect(ttlBefore).toBeLessThanOrEqual(60);

        // Simulate TTL expiry
        memoryRedis.expireKeyNow(lockKey);
        expect(await memoryRedis.get(lockKey)).toBeNull();

        // New owner can now acquire
        const acquired = await memoryRedis.set(lockKey, 'owner-b-nonce', 'EX', 60, 'NX');
        expect(acquired).toBe('OK');
        expect(await memoryRedis.get(lockKey)).toBe('owner-b-nonce');
      });

      it('stale-owner cleanup safety: stale request does NOT delete replacement lock acquired by newer request', async () => {
        const holdToken = await acquireTestHold(['seat-b1']);
        const lockKey = `matinee:hold_booking_lock:${holdToken}`;

        // 1. Request A acquired lock with nonceA
        const nonceA = 'owner-a-stale-nonce';
        await memoryRedis.set(lockKey, nonceA, 'EX', 60);

        // 2. Request A times out; lock expires and Request B acquires with nonceB
        const nonceB = 'owner-b-active-nonce';
        await memoryRedis.set(lockKey, nonceB, 'EX', 60);

        // 3. Request A finally block runs with its stale nonceA using RELEASE_LOCK_LUA
        const { RELEASE_LOCK_LUA } = await import('../src/services/redis/luaScripts.js');
        const released = await memoryRedis.eval(RELEASE_LOCK_LUA, 1, lockKey, nonceA);

        // Must NOT delete Request B's lock!
        expect(released).toBe(0);
        expect(await memoryRedis.get(lockKey)).toBe(nonceB);

        // 4. Request B's cleanup runs with nonceB: successfully deletes lock
        const bReleased = await memoryRedis.eval(RELEASE_LOCK_LUA, 1, lockKey, nonceB);
        expect(bReleased).toBe(1);
        expect(await memoryRedis.get(lockKey)).toBeNull();
      });

      it('maps Redis outage during lock acquisition to 503 HOLD_SERVICE_UNAVAILABLE', async () => {
        const holdToken = await acquireTestHold(['seat-b1']);
        vi.spyOn(memoryRedis, 'set').mockRejectedValueOnce(new Error('Redis connection refused'));

        const res = await testRequest(app, {
          method: 'POST',
          url: '/api/v1/bookings',
          headers: {
            'X-Hold-Token': holdToken,
            'Idempotency-Key': validKey,
          },
          body: {
            showtimeId: mockShowtime.id,
            seatIds: ['seat-b1'],
            contactEmail: 'customer@example.com',
          },
        });

        expect(res.status).toBe(503);
        expect(res.body.code).toBe('HOLD_SERVICE_UNAVAILABLE');
      });
    });

    it('creates couple pod booking with 2 partner tickets and exact ₦12,000 total', async () => {
      const holdToken = await acquireTestHold(['seat-s1', 'seat-s2']);

      const mockBooking = {
        id: 'bk-couple-001',
        bookingReference: 'MAT-3333-CPL',
        userId: null,
        showtimeId: mockShowtime.id,
        status: BookingStatus.PENDING,
        seatCount: 2,
        subtotalKobo: 1200000,
        bookingFeeKobo: 0,
        totalKobo: 1200000,
        contactEmail: 'couple@example.com',
        contactName: null,
        contactPhone: null,
        expiresAt: new Date(Date.now() + 600000),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          idempotencyRecord: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({}),
            update: vi.fn().mockResolvedValue({}),
          },
          ticket: {
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockImplementation(({ data }: any) => ({
              id: `tkt-${data.seatId}`,
              ticketCode: `TKT-${data.seatId}`,
              seatId: data.seatId,
              tier: SeatTier.COUPLE,
              priceKobo: data.priceKobo,
              status: TicketStatus.PENDING_PAYMENT,
            })),
          },
          booking: {
            create: vi.fn().mockResolvedValue(mockBooking),
          },
        };
        return cb(tx);
      });

      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/bookings',
        headers: {
          'X-Hold-Token': holdToken,
          'Idempotency-Key': validKey,
        },
        body: {
          showtimeId: mockShowtime.id,
          seatIds: ['seat-s1', 'seat-s2'],
          contactEmail: 'couple@example.com',
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.data.seatCount).toBe(2);
      expect(res.body.data.totalKobo).toBe(1200000);
      expect(res.body.data.tickets).toHaveLength(2);
      expect(res.body.data.tickets[0].priceKobo).toBe(600000);
      expect(res.body.data.tickets[1].priceKobo).toBe(600000);
    });
  });

  describe('5. Expiration vs Payment Settlement Safety (Phase 3 Scenarios A-G)', () => {
    it('Scenario A: Expiration wins before settlement', async () => {
      const now = new Date();
      vi.spyOn(prisma.booking, 'findMany').mockResolvedValue([{ id: 'bk-expired-a' }] as any);

      const updateTicketsMock = vi.fn().mockResolvedValue({ count: 1 });
      const updateBookingsMock = vi.fn().mockResolvedValue({ count: 1 });

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([{ id: 'bk-expired-a', status: BookingStatus.PENDING }]),
          booking: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'bk-expired-a',
              status: BookingStatus.PENDING,
              expiresAt: new Date(now.getTime() - 60000),
              paymentAttempts: [],
            }),
            updateMany: updateBookingsMock,
          },
          ticket: {
            updateMany: updateTicketsMock,
          },
        };
        return cb(tx);
      });

      const count = await bookingService.expireAbandonedBookings(now);
      expect(count).toBe(1);
      expect(updateBookingsMock).toHaveBeenCalledWith({
        where: { id: 'bk-expired-a', status: BookingStatus.PENDING },
        data: expect.objectContaining({ status: BookingStatus.EXPIRED }),
      });
      expect(updateTicketsMock).toHaveBeenCalledWith({
        where: { bookingId: 'bk-expired-a', status: TicketStatus.PENDING_PAYMENT },
        data: expect.objectContaining({ status: TicketStatus.CANCELLED }),
      });
    });

    it('Scenario B: Settlement wins before expiration (Booking already CONFIRMED)', async () => {
      const now = new Date();
      vi.spyOn(prisma.booking, 'findMany').mockResolvedValue([{ id: 'bk-confirmed-b' }] as any);

      const updateBookingsMock = vi.fn();
      const updateTicketsMock = vi.fn();

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([{ id: 'bk-confirmed-b', status: BookingStatus.CONFIRMED }]),
          booking: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'bk-confirmed-b',
              status: BookingStatus.CONFIRMED,
              expiresAt: new Date(now.getTime() - 60000),
              paymentAttempts: [{ status: PaymentStatus.SUCCEEDED }],
            }),
            updateMany: updateBookingsMock,
          },
          ticket: {
            updateMany: updateTicketsMock,
          },
        };
        return cb(tx);
      });

      const count = await bookingService.expireAbandonedBookings(now);
      expect(count).toBe(0); // Safely skipped
      expect(updateBookingsMock).not.toHaveBeenCalled();
      expect(updateTicketsMock).not.toHaveBeenCalled();
    });

    it('Scenario C: Two expiration workers target the same booking concurrently', async () => {
      const now = new Date();
      vi.spyOn(prisma.booking, 'findMany').mockResolvedValue([{ id: 'bk-competing-c' }] as any);

      const updateTicketsMock = vi.fn();

      // Worker 2 runs: updateMany returns count: 0 because Worker 1 already flipped status to EXPIRED
      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([{ id: 'bk-competing-c', status: BookingStatus.PENDING }]),
          booking: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'bk-competing-c',
              status: BookingStatus.PENDING,
              expiresAt: new Date(now.getTime() - 60000),
              paymentAttempts: [],
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }), // Competitor won!
          },
          ticket: {
            updateMany: updateTicketsMock,
          },
        };
        return cb(tx);
      });

      const count = await bookingService.expireAbandonedBookings(now);
      expect(count).toBe(0);
      // Confirmed expired IDs only: ticket cancellation must NOT be executed
      expect(updateTicketsMock).not.toHaveBeenCalled();
    });

    it('Scenario D: Payment becomes PROCESSING during reconciliation', async () => {
      const now = new Date();
      vi.spyOn(prisma.booking, 'findMany').mockResolvedValue([{ id: 'bk-settling-d' }] as any);

      const updateBookingsMock = vi.fn();
      const updateTicketsMock = vi.fn();

      // In-transaction re-check sees a paymentAttempt in PROCESSING
      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([{ id: 'bk-settling-d', status: BookingStatus.PENDING }]),
          booking: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'bk-settling-d',
              status: BookingStatus.PENDING,
              expiresAt: new Date(now.getTime() - 60000),
              paymentAttempts: [{ status: PaymentStatus.PROCESSING }],
            }),
            updateMany: updateBookingsMock,
          },
          ticket: {
            updateMany: updateTicketsMock,
          },
        };
        return cb(tx);
      });

      const count = await bookingService.expireAbandonedBookings(now);
      expect(count).toBe(0);
      expect(updateBookingsMock).not.toHaveBeenCalled();
      expect(updateTicketsMock).not.toHaveBeenCalled();
    });

    it('Scenario E: Payment is already SUCCEEDED', async () => {
      const now = new Date();
      vi.spyOn(prisma.booking, 'findMany').mockResolvedValue([{ id: 'bk-paid-e' }] as any);

      const updateBookingsMock = vi.fn();
      const updateTicketsMock = vi.fn();

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([{ id: 'bk-paid-e', status: BookingStatus.PENDING }]),
          booking: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'bk-paid-e',
              status: BookingStatus.PENDING,
              expiresAt: new Date(now.getTime() - 60000),
              paymentAttempts: [{ status: PaymentStatus.SUCCEEDED }],
            }),
            updateMany: updateBookingsMock,
          },
          ticket: {
            updateMany: updateTicketsMock,
          },
        };
        return cb(tx);
      });

      const count = await bookingService.expireAbandonedBookings(now);
      expect(count).toBe(0);
      expect(updateBookingsMock).not.toHaveBeenCalled();
      expect(updateTicketsMock).not.toHaveBeenCalled();
    });

    it('Scenario F: Reconciliation runs repeatedly (strictly idempotent)', async () => {
      const now = new Date();
      // Second run finds 0 candidates
      vi.spyOn(prisma.booking, 'findMany').mockResolvedValue([]);

      const count = await bookingService.expireAbandonedBookings(now);
      expect(count).toBe(0);
    });

    it('Scenario G: Individual transaction failure isolation and non-fatal recovery', async () => {
      const now = new Date();
      vi.spyOn(prisma.booking, 'findMany').mockResolvedValue([
        { id: 'bk-deadlock-1' },
        { id: 'bk-healthy-2' },
      ] as any);

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      let callIndex = 0;
      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        callIndex++;
        if (callIndex === 1) {
          throw new Error('PostgreSQL deadlock / transaction serialization error');
        }
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([{ id: 'bk-healthy-2', status: BookingStatus.PENDING }]),
          booking: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'bk-healthy-2',
              status: BookingStatus.PENDING,
              expiresAt: new Date(now.getTime() - 60000),
              paymentAttempts: [],
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          ticket: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return cb(tx);
      });

      // Does not abort entire loop; healthy-2 still succeeds
      const count = await bookingService.expireAbandonedBookings(now);
      expect(count).toBe(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('bk-deadlock-1')
      );
      consoleWarnSpy.mockRestore();
    });

    it('Scenario H: Failed SELECT FOR UPDATE row locking aborts transaction immediately without mutating state', async () => {
      const now = new Date();
      vi.spyOn(prisma.booking, 'findMany').mockResolvedValue([{ id: 'bk-lock-fail-1' }] as any);

      const updateBookingsMock = vi.fn();
      const updateTicketsMock = vi.fn();

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          $queryRaw: vi.fn().mockRejectedValue(new Error('canceling statement due to lock timeout')),
          booking: {
            findUnique: vi.fn(),
            updateMany: updateBookingsMock,
          },
          ticket: {
            updateMany: updateTicketsMock,
          },
        };
        return cb(tx);
      });

      const count = await bookingService.expireAbandonedBookings(now);
      expect(count).toBe(0);
      expect(updateBookingsMock).not.toHaveBeenCalled();
      expect(updateTicketsMock).not.toHaveBeenCalled();
    });
  });
});
