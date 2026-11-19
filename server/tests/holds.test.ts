import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '../src/app.js';
import { testRequest } from './helpers/testRequest.js';
import { prisma } from '../src/db.js';
import { ScreenFormat, SeatTier, ShowtimeStatus, TicketStatus } from '@prisma/client';
import { InMemoryRedisClient } from '../src/services/redis/inMemoryRedisClient.js';
import { FailingRedisClient } from '../src/services/redis/failingRedisClient.js';
import {
  RELEASE_IDEMPOTENCY_LOCK_LUA,
  COMPLETE_IDEMPOTENCY_LUA,
  setRedisClient,
} from '../src/services/redis/index.js';
import seatHoldService from '../src/services/seatHoldService.js';

describe('Matinee Seat Hold Engine & Hardened API Security', () => {
  let memoryRedis: InMemoryRedisClient;

  const mockShowtime = {
    id: 'st-dune-lekki-1430',
    auditoriumId: 'aud-lekki-imax-01',
    movieId: 'mov-dune-part-two',
    startTime: new Date(Date.now() + 3600000), // 1 hour in future
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
      _count: {
        seats: 320,
      },
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
      id: 'seat-b3',
      auditoriumId: 'aud-lekki-imax-01',
      row: 'B',
      column: 3,
      seatNumber: 'B3',
      tier: SeatTier.STANDARD,
      isAccessible: false,
      isCouple: false,
      couplePartnerId: null,
      isActive: true,
    },
    {
      id: 'seat-k1',
      auditoriumId: 'aud-lekki-imax-01',
      row: 'K',
      column: 1,
      seatNumber: 'K1',
      tier: SeatTier.VIP,
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

    vi.spyOn(prisma.showtime, 'findUnique').mockResolvedValue(mockShowtime as any);
    vi.spyOn(prisma.seat, 'findMany').mockImplementation(async (args: any) => {
      const ids = args?.where?.id?.in || [];
      return mockSeats.filter((s) => ids.includes(s.id)) as any;
    });
    vi.spyOn(prisma.seat, 'findUnique').mockImplementation(async (args: any) => {
      return mockSeats.find((s) => s.id === args?.where?.id) as any;
    });
    vi.spyOn(prisma.ticket, 'findMany').mockResolvedValue([]);
  });

  describe('1. Hold Token Security & Header Capability Verification', () => {
    it('issues cryptographically secure server tokens (256-bit hex entropy)', async () => {
      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1'] },
      });

      expect(res.status).toBe(201);
      const token = res.body.data.holdToken;
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      // 64-character hex string representing 256 bits of cryptographic entropy
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('requires X-Hold-Token header to inspect hold details; rejects missing header with 401', async () => {
      // 1. Missing header
      const resMissing = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/holds',
      });
      expect(resMissing.status).toBe(401);
      expect(resMissing.body.code).toBe('MISSING_HOLD_TOKEN');

      // 2. Acquire hold to get valid token
      const resHold = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1'] },
      });
      const validToken = resHold.body.data.holdToken;

      // 3. Inspect with valid X-Hold-Token header
      const resSuccess = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/holds',
        headers: { 'X-Hold-Token': validToken },
      });
      expect(resSuccess.status).toBe(200);
      expect(resSuccess.body.data.holdToken).toBe(validToken);
      expect(resSuccess.body.data.seats[0].id).toBe('seat-b1');

      // 4. Also supports Authorization Bearer header
      const resBearer = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/holds',
        headers: { Authorization: `Bearer ${validToken}` },
      });
      expect(resBearer.status).toBe(200);
      expect(resBearer.body.data.holdToken).toBe(validToken);
    });

    it('requires X-Hold-Token header to release hold; rejects missing header with 401', async () => {
      // Missing header
      const resMissing = await testRequest(app, {
        method: 'DELETE',
        url: '/api/v1/holds',
      });
      expect(resMissing.status).toBe(401);
      expect(resMissing.body.code).toBe('MISSING_HOLD_TOKEN');

      // Acquire hold
      const resHold = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1', 'seat-b2'] },
      });
      const validToken = resHold.body.data.holdToken;

      // Release with valid token
      const resRelease = await testRequest(app, {
        method: 'DELETE',
        url: '/api/v1/holds',
        headers: { 'X-Hold-Token': validToken },
      });
      expect(resRelease.status).toBe(200);
      expect(resRelease.body.data.releasedSeatsCount).toBe(2);

      // Verify seats are free again
      const resReacquire = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1'] },
      });
      expect(resReacquire.status).toBe(201);
    });

    it('rejects release with invalid or mismatched token with 404', async () => {
      const res = await testRequest(app, {
        method: 'DELETE',
        url: '/api/v1/holds',
        headers: { 'X-Hold-Token': 'unknown-fake-token-1234567890abcdef' },
      });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('HOLD_NOT_FOUND');
    });

    it('masks tokens in error handlers and logs; never exposes full tokens in responses', async () => {
      const token = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const masked = seatHoldService.maskToken(token);
      expect(masked).toBe('12345678...');
      expect(masked).not.toContain('abcdef');
    });
  });

  describe('2. Idempotency Key Binding, Proof-of-Possession & Anti-Replay Security', () => {
    it('PREVENTS TOKEN HIJACKING: Caller B cannot replay Caller A Idempotency-Key to steal secret hold token', async () => {
      const idempotencyKey = 'shared-idempotency-key-target-hijack';

      // 1. Caller A acquires seat-b1 using Idempotency-Key K
      const resCallerA = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1'] },
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      expect(resCallerA.status).toBe(201);
      const secretTokenA = resCallerA.body.data.holdToken;
      expect(secretTokenA).toBeDefined();

      // 2. Caller B knows key K and the same request parameters, but does NOT possess secretTokenA
      const resCallerB = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1'] },
        headers: { 'Idempotency-Key': idempotencyKey }, // Replaying K without proof of token possession
      });

      // 3. Caller B MUST be rejected with 409 and MUST NOT receive Caller A's hold token
      expect(resCallerB.status).toBe(409);
      expect(resCallerB.body.code).toBe('HOLD_TOKEN_POSSESSION_REQUIRED');
      expect(resCallerB.body).not.toHaveProperty('data');
      expect(JSON.stringify(resCallerB.body)).not.toContain(secretTokenA);

      // 4. Caller B cannot control or release Caller A's hold
      const resBRelease = await testRequest(app, {
        method: 'DELETE',
        url: '/api/v1/holds',
        headers: { 'X-Hold-Token': 'caller-b-guessed-token' },
      });
      expect(resBRelease.status).toBe(404);

      // 5. Caller A's hold remains completely intact and valid
      const resAVerify = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/holds',
        headers: { 'X-Hold-Token': secretTokenA },
      });
      expect(resAVerify.status).toBe(200);
      expect(resAVerify.body.data.holdToken).toBe(secretTokenA);
      expect(resAVerify.body.data.seats[0].id).toBe('seat-b1');
    });

    it('supports idempotent retries when legitimate holder supplies both Idempotency-Key and proof X-Hold-Token', async () => {
      const idempotencyKey = 'req-checkout-uuid-abc-123';

      const res1 = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1', 'seat-b2'] },
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      expect(res1.status).toBe(201);
      const token = res1.body.data.holdToken;

      // Legitimate retry with Idempotency-Key AND proof of possession
      const res2 = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1', 'seat-b2'] },
        headers: {
          'Idempotency-Key': idempotencyKey,
          'X-Hold-Token': token,
        },
      });
      expect(res2.status).toBe(201);
      expect(res2.body.data.holdToken).toBe(token);
      expect(res2.body.data.totalSeats).toBe(2);
      expect(res2.body.data.expiresInSeconds).toBeGreaterThan(0);
    });

    it('serializes same-key concurrent first requests: only one proceeds, second receives 409 in-progress', async () => {
      const idempotencyKey = 'concurrent-race-key-xyz';

      // Simulate first request claiming in-progress lock in Redis
      await memoryRedis.set(
        `matinee:idempotency:${idempotencyKey}`,
        JSON.stringify({ status: 'IN_PROGRESS', showtimeId: 'st-dune-lekki-1430', sortedSeatIds: ['seat-b1'] }),
        'EX',
        30,
        'NX'
      );

      // Concurrent second request arrives while first is still executing
      const resConcurrent = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1'] },
        headers: { 'Idempotency-Key': idempotencyKey },
      });

      expect(resConcurrent.status).toBe(409);
      expect(resConcurrent.body.code).toBe('IDEMPOTENCY_IN_PROGRESS');
    });

    it('rejects conflicting reuse of Idempotency-Key with different seats with 409 IDEMPOTENCY_CONFLICT', async () => {
      const idempotencyKey = 'shared-idempotency-key-001';

      // First call holds seat-b1
      const res1 = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1'] },
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      expect(res1.status).toBe(201);

      // Reusing same Idempotency-Key with different seat (seat-b2) MUST be rejected
      const resConflict = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b2'] },
        headers: { 'Idempotency-Key': idempotencyKey },
      });

      expect(resConflict.status).toBe(409);
      expect(resConflict.body.code).toBe('IDEMPOTENCY_CONFLICT');
      expect(resConflict.body.message).toContain('different seat reservation');
    });

    it('rejects expired idempotency key with 410 IDEMPOTENCY_EXPIRED', async () => {
      const idempotencyKey = 'expiring-idempotency-key-002';

      const res1 = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1'] },
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      expect(res1.status).toBe(201);
      const token = res1.body.data.holdToken;

      // Expire the underlying hold token in Redis (leaving idempotency key record)
      memoryRedis.expireKeyNow(`matinee:hold_token:${token}`);
      memoryRedis.expireKeyNow(`matinee:hold:st-dune-lekki-1430:seat-b1`);

      const resExpired = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1'] },
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      expect(resExpired.status).toBe(410);
      expect(resExpired.body.code).toBe('IDEMPOTENCY_EXPIRED');
    });
  });

  describe('3. Heartbeat Renewal & Lifetime Cap Invariants', () => {
    it('immediate heartbeat extends hold to 900s without shortening active 600s window', async () => {
      // 1. Acquire hold (600s initial window)
      const resHold = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1'] },
      });
      expect(resHold.status).toBe(201);
      const token = resHold.body.data.holdToken;
      const initialExpiresIn = resHold.body.data.expiresInSeconds;
      expect(initialExpiresIn).toBe(600);

      // 2. Immediate heartbeat within seconds of creation
      const resExtend = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/holds/heartbeat',
        headers: { 'X-Hold-Token': token },
      });
      expect(resExtend.status).toBe(200);
      expect(resExtend.body.data.extensionCount).toBe(1);

      // Heartbeat MUST extend to 900s (600s + 300s), NEVER shorten to 300s!
      const extendedExpiresIn = resExtend.body.data.expiresInSeconds;
      expect(extendedExpiresIn).toBeGreaterThanOrEqual(898);
      expect(extendedExpiresIn).toBeLessThanOrEqual(900);

      // Verify expiration timestamp is approximately 900s from creation
      const expiresAtMs = new Date(resExtend.body.data.expiresAt).getTime();
      const diffMs = expiresAtMs - Date.now();
      expect(diffMs).toBeGreaterThanOrEqual(895_000);
      expect(diffMs).toBeLessThanOrEqual(900_000);
    });

    it('midway heartbeat (+300s) extends hold to exactly 900s total lifetime (600s remaining)', async () => {
      const now = Date.now();
      const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

      try {
        const resHold = await testRequest(app, {
          method: 'POST',
          url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
          body: { seatIds: ['seat-b1'] },
        });
        const token = resHold.body.data.holdToken;

        // Advance simulated time by 300 seconds (halfway through 600s hold)
        dateSpy.mockReturnValue(now + 300_000);

        const resExtend = await testRequest(app, {
          method: 'POST',
          url: '/api/v1/holds/heartbeat',
          headers: { 'X-Hold-Token': token },
        });
        expect(resExtend.status).toBe(200);
        expect(resExtend.body.data.extensionCount).toBe(1);

        // Remaining TTL should be exactly 600s (900s total - 300s elapsed)
        expect(resExtend.body.data.expiresInSeconds).toBe(600);
        expect(new Date(resExtend.body.data.expiresAt).getTime()).toBe(now + 900_000);
      } finally {
        dateSpy.mockRestore();
      }
    });

    it('near-expiry heartbeat (+590s) extends hold to exactly 900s total lifetime (310s remaining)', async () => {
      const now = Date.now();
      const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

      try {
        const resHold = await testRequest(app, {
          method: 'POST',
          url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
          body: { seatIds: ['seat-b1'] },
        });
        const token = resHold.body.data.holdToken;

        // Advance simulated time to 590s (10 seconds before expiry)
        dateSpy.mockReturnValue(now + 590_000);

        const resExtend = await testRequest(app, {
          method: 'POST',
          url: '/api/v1/holds/heartbeat',
          headers: { 'X-Hold-Token': token },
        });
        expect(resExtend.status).toBe(200);
        expect(resExtend.body.data.extensionCount).toBe(1);

        // Remaining TTL should be exactly 310s (900s total - 590s elapsed)
        expect(resExtend.body.data.expiresInSeconds).toBe(310);
        expect(new Date(resExtend.body.data.expiresAt).getTime()).toBe(now + 900_000);
      } finally {
        dateSpy.mockRestore();
      }
    });

    it('strictly caps maximum hold lifetime at 900 seconds from creation', async () => {
      const resHold = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1'] },
      });
      const token = resHold.body.data.holdToken;

      const resExtend = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/holds/heartbeat',
        headers: { 'X-Hold-Token': token },
      });
      expect(resExtend.status).toBe(200);

      const expiresAtMs = new Date(resExtend.body.data.expiresAt).getTime();
      expect(expiresAtMs - Date.now()).toBeLessThanOrEqual(900_000);
    });

    it('rejects second extension attempt (strictly max 1 extension per session)', async () => {
      const resHold = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1'] },
      });
      const token = resHold.body.data.holdToken;

      // First extension succeeds
      const resExtend1 = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/holds/heartbeat',
        headers: { 'X-Hold-Token': token },
      });
      expect(resExtend1.status).toBe(200);
      expect(resExtend1.body.data.extensionCount).toBe(1);

      // Second extension attempt MUST be rejected
      const resExtend2 = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/holds/heartbeat',
        headers: { 'X-Hold-Token': token },
      });
      expect(resExtend2.status).toBe(400);
      expect(resExtend2.body.code).toBe('MAX_HOLD_EXTENSIONS_EXCEEDED');
      expect(resExtend2.body.message).toContain('limit (1) reached');
    });

    it('synchronizes TTL consistency between token key and seat keys after heartbeat', async () => {
      const resHold = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1', 'seat-b2'] },
      });
      const token = resHold.body.data.holdToken;

      await testRequest(app, {
        method: 'POST',
        url: '/api/v1/holds/heartbeat',
        headers: { 'X-Hold-Token': token },
      });

      const tokenKey = `matinee:hold_token:${token}`;
      const seatKeyB1 = 'matinee:hold:st-dune-lekki-1430:seat-b1';
      const seatKeyB2 = 'matinee:hold:st-dune-lekki-1430:seat-b2';

      const tokenTtl = await memoryRedis.ttl(tokenKey);
      const seatB1Ttl = await memoryRedis.ttl(seatKeyB1);
      const seatB2Ttl = await memoryRedis.ttl(seatKeyB2);

      // All keys must have strictly synchronized TTLs
      expect(tokenTtl).toBeGreaterThanOrEqual(898);
      expect(seatB1Ttl).toBe(tokenTtl);
      expect(seatB2Ttl).toBe(tokenTtl);
    });

    it('rejects heartbeat renewal on expired tokens with 404 (prevents resurrection)', async () => {
      const resHold = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1'] },
      });
      const token = resHold.body.data.holdToken;

      // Expire token
      memoryRedis.expireAllNow();

      // Attempt heartbeat renewal on dead token
      const resExtend = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/holds/heartbeat',
        headers: { 'X-Hold-Token': token },
      });
      expect(resExtend.status).toBe(404);
      expect(resExtend.body.code).toBe('HOLD_NOT_FOUND');
    });

    it('rejects heartbeat renewal when simulated time exceeds unextended hold window', async () => {
      const now = Date.now();
      const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

      try {
        const resHold = await testRequest(app, {
          method: 'POST',
          url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
          body: { seatIds: ['seat-b1'] },
        });
        const token = resHold.body.data.holdToken;

        // Advance simulated time past initial 600s hold (605 seconds)
        dateSpy.mockReturnValue(now + 605_000);

        const resExtend = await testRequest(app, {
          method: 'POST',
          url: '/api/v1/holds/heartbeat',
          headers: { 'X-Hold-Token': token },
        });
        expect(resExtend.status).toBe(404);
        expect(resExtend.body.code).toBe('HOLD_NOT_FOUND');
      } finally {
        dateSpy.mockRestore();
      }
    });

    it('rejects heartbeat renewal with mismatched or missing token', async () => {
      const resMissing = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/holds/heartbeat',
      });
      expect(resMissing.status).toBe(401);
      expect(resMissing.body.code).toBe('MISSING_HOLD_TOKEN');

      const resMismatched = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/holds/heartbeat',
        headers: { 'X-Hold-Token': 'non-existent-token-xyz' },
      });
      expect(resMismatched.status).toBe(404);
      expect(resMismatched.body.code).toBe('HOLD_NOT_FOUND');
    });
  });

  describe('4. Concurrency, Atomicity & Seating Invariants', () => {
    it('enforces atomic all-or-nothing: conflicting seat results in zero partial holds', async () => {
      // User A holds seat-b1
      const resA = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1'] },
      });
      expect(resA.status).toBe(201);

      // User B requests seat-b1 AND seat-b2 together
      const resB = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1', 'seat-b2'] },
      });
      expect(resB.status).toBe(409);
      expect(resB.body.code).toBe('SEAT_HOLD_CONFLICT');

      // Verification: seat-b2 was NOT held by User B! User C can hold seat-b2 cleanly
      const resC = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b2'] },
      });
      expect(resC.status).toBe(201);
      expect(resC.body.data.seats[0].id).toBe('seat-b2');
    });

    it('requires couple seat partner to be held together atomically', async () => {
      // Requesting only S1 without S2
      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-s1'] },
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('COUPLE_PARTNER_REQUIRED');

      // Requesting both S1 and S2 succeeds
      const resSuccess = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-s1', 'seat-s2'] },
      });
      expect(resSuccess.status).toBe(201);
      expect(resSuccess.body.data.totalSeats).toBe(2);
      expect(resSuccess.body.data.totalPriceKobo).toBe(1200000);
    });

    it('enforces maximum 8-seat limit per checkout hold', async () => {
      const nineSeatIds = Array.from({ length: 9 }, (_, i) => `seat-dummy-${i}`);

      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: nineSeatIds },
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects seats with permanent active PostgreSQL tickets (CONFIRMED, PENDING_PAYMENT, REFUNDED_RESTRICTED)', async () => {
      vi.spyOn(prisma.ticket, 'findMany').mockResolvedValue([
        { seatId: 'seat-b1', status: TicketStatus.CONFIRMED },
      ] as any);

      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1'] },
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SEAT_ALREADY_SOLD');
    });

    it('rejects showtimes with zero physical seats with 400 SEATS_UNAVAILABLE', async () => {
      vi.spyOn(prisma.showtime, 'findUnique').mockResolvedValue({
        ...mockShowtime,
        auditorium: {
          id: 'aud-empty',
          name: 'Empty Screen',
          screenNumber: 1,
          _count: { seats: 0 },
        },
      } as any);

      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1'] },
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SEATS_UNAVAILABLE');
    });
  });

  describe('5. Production Fail-Closed Safety', () => {
    it('fails closed with 503 when Redis is offline or disconnected', async () => {
      memoryRedis.setHealthy(false);

      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1'] },
      });
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('HOLD_SERVICE_UNAVAILABLE');
    });

    it('FailingRedisClient strictly rejects all hold operations in unconfigured production environments', async () => {
      const failingClient = new FailingRedisClient('Missing REDIS_URL');
      seatHoldService.setRedisClient(failingClient);

      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        body: { seatIds: ['seat-b1'] },
      });
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('HOLD_SERVICE_UNAVAILABLE');
    });
  });

  describe('6. Advanced Idempotency Concurrency & Lock Ownership Safety', () => {
    it('prevents unconditional DEL cleanup race: worker A cannot delete worker B replacement lock', async () => {
      const lockKey = 'matinee:idempotency:test-key-race';

      // 1. Worker B holds the lock with unique lockOwnerId = 'owner-b'
      await memoryRedis.set(
        lockKey,
        JSON.stringify({
          status: 'IN_PROGRESS',
          lockOwnerId: 'owner-b',
          createdAt: Date.now(),
        }),
        'EX',
        30
      );

      // 2. Worker A (stale/timed out with 'owner-a') attempts lock cleanup
      const deleted = await memoryRedis.eval(
        RELEASE_IDEMPOTENCY_LOCK_LUA,
        1,
        lockKey,
        'owner-a'
      );

      // Release MUST return 0 and NOT delete Worker B's lock
      expect(deleted).toBe(0);
      const remainingVal = await memoryRedis.get(lockKey);
      expect(remainingVal).not.toBeNull();
      expect(JSON.parse(remainingVal!).lockOwnerId).toBe('owner-b');

      // 3. Worker B with 'owner-b' executes cleanup: successfully deletes
      const deletedByB = await memoryRedis.eval(
        RELEASE_IDEMPOTENCY_LOCK_LUA,
        1,
        lockKey,
        'owner-b'
      );
      expect(deletedByB).toBe(1);
      expect(await memoryRedis.get(lockKey)).toBeNull();
    });

    it('prevents stale worker from overwriting active lock or completed record', async () => {
      const lockKey = 'matinee:idempotency:test-key-stale';

      // 1. Active lock owned by 'owner-b'
      await memoryRedis.set(
        lockKey,
        JSON.stringify({
          status: 'IN_PROGRESS',
          lockOwnerId: 'owner-b',
          createdAt: Date.now(),
        }),
        'EX',
        30
      );

      // 2. Stale Worker A ('owner-a') attempts to complete
      const completed = await memoryRedis.eval(
        COMPLETE_IDEMPOTENCY_LUA,
        1,
        lockKey,
        'owner-a',
        JSON.stringify({ status: 'COMPLETED', result: 'from-stale-a' }),
        600
      );

      // Must fail to overwrite
      expect(completed).toBe(0);
      const current = JSON.parse((await memoryRedis.get(lockKey))!);
      expect(current.status).toBe('IN_PROGRESS');
      expect(current.lockOwnerId).toBe('owner-b');

      // 3. Legitimate Worker B completes successfully
      const completedByB = await memoryRedis.eval(
        COMPLETE_IDEMPOTENCY_LUA,
        1,
        lockKey,
        'owner-b',
        JSON.stringify({ status: 'COMPLETED', result: 'from-legitimate-b' }),
        600
      );
      expect(completedByB).toBe(1);
      const updated = JSON.parse((await memoryRedis.get(lockKey))!);
      expect(updated.status).toBe('COMPLETED');
      expect(updated.result).toBe('from-legitimate-b');
    });

    it('rejects simultaneous in-progress requests with 409 IDEMPOTENCY_IN_PROGRESS', async () => {
      // Simulate lock already in progress
      const key = 'test-concurrent-first';
      await memoryRedis.set(
        `matinee:idempotency:${key}`,
        JSON.stringify({
          status: 'IN_PROGRESS',
          lockOwnerId: 'first-worker-uuid',
          showtimeId: 'st-dune-lekki-1430',
          sortedSeatIds: ['seat-b1'],
          createdAt: Date.now(),
        }),
        'EX',
        30
      );

      const res = await testRequest(app, {
        method: 'POST',
        url: '/api/v1/showtimes/st-dune-lekki-1430/holds',
        headers: { 'Idempotency-Key': key },
        body: { seatIds: ['seat-b1'] },
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('IDEMPOTENCY_IN_PROGRESS');
    });
  });
});
