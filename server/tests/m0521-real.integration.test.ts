import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BookingStatus,
  PaymentProvider,
  PaymentStatus,
  PrismaClient,
  Role,
  ScreenFormat,
  SeatTier,
  ShowtimeStatus,
  TicketStatus,
} from '@prisma/client';
import { IoRedisClient } from '../src/services/redis/index.js';
import { StaffLoginRateLimiter, StaffAuthService, hashStaffPassword } from '../src/services/staffAuthService.js';
import { TicketQrService } from '../src/services/ticketQrService.js';
import { testRequest } from './helpers/testRequest.js';

const enabled = process.env.M0521_RUN_REAL_INTEGRATION === 'true';
const suite = enabled ? describe : describe.skip;

function requireLocalTarget(name: string, value: string | undefined, database = false): URL {
  if (!value) throw new Error(`${name} is required when M0521_RUN_REAL_INTEGRATION=true.`);
  const parsed = new URL(value);
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
    throw new Error(`${name} must target localhost; hosted targets are forbidden.`);
  }
  if (database) {
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    if (!databaseName.startsWith('matinee_m0520_') || parsed.port === '5432') {
      throw new Error(`${name} must use a dedicated matinee_m0520_* database on a non-default test port.`);
    }
  } else if (parsed.port === '6379') {
    throw new Error(`${name} must use a dedicated Redis port, not the shared default port.`);
  }
  return parsed;
}

suite('M05.21 real local PostgreSQL + Redis scanner integration', () => {
  let prisma: PrismaClient;
  let redis: IoRedisClient;
  let app: any;
  let userId: string;
  let bookingId: string;
  let ticketId: string;
  let showtimeId: string;
  let seatId: string;
  let auditoriumId: string;
  let movieId: string;
  let cinemaId: string;
  let paymentId: string;
  let token: string;

  beforeAll(async () => {
    const databaseUrl = requireLocalTarget('M0521_DATABASE_URL', process.env.M0521_DATABASE_URL, true).toString();
    const redisUrl = requireLocalTarget('M0521_REDIS_URL', process.env.M0521_REDIS_URL).toString();
    if (!process.env.M0521_STAFF_AUTH_JWT_SECRET || !process.env.M0521_TICKET_QR_SIGNING_KEY) {
      throw new Error('Dedicated M0521 signing secrets are required; values are never logged.');
    }

    process.env.DATABASE_URL = databaseUrl;
    process.env.REDIS_URL = redisUrl;
    process.env.STAFF_AUTH_ENABLED = 'true';
    process.env.STAFF_AUTH_JWT_SECRET = process.env.M0521_STAFF_AUTH_JWT_SECRET;
    process.env.TICKET_QR_SIGNING_KEY = process.env.M0521_TICKET_QR_SIGNING_KEY;
    process.env.TICKET_QR_SIGNING_KEY_ID = 'm0521-local-key';
    process.env.STAFF_AUTH_LOGIN_ACCOUNT_MAX_ATTEMPTS = '5';
    process.env.STAFF_AUTH_LOGIN_SOURCE_MAX_ATTEMPTS = '20';

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    redis = new IoRedisClient(redisUrl);
    const identity = await prisma.$queryRaw<Array<{ database_name: string; server_address: string | null }>>`
      SELECT current_database() AS database_name, COALESCE(inet_server_addr()::text, '') AS server_address
    `;
    const databaseName = identity[0]?.database_name || '';
    if (!databaseName.startsWith('matinee_m0520_')) throw new Error('Verified database name is not disposable.');
    if (!(await redis.isHealthy())) throw new Error('Dedicated Redis is unavailable.');

    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
        AND column_name IN ('password_hash', 'auth_version')
    `;
    expect(columns.map((column) => column.column_name).sort()).toEqual(['auth_version', 'password_hash']);

    const [{ app: importedApp }] = await Promise.all([import('../src/app.js')]);
    app = importedApp;

    const suffix = `m0521-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const staffPasswordHash = await hashStaffPassword('M0521 synthetic staff password');
    const user = await prisma.user.create({ data: { email: `${suffix}@local.invalid`, role: Role.CINEMA_ADMIN, passwordHash: staffPasswordHash } });
    userId = user.id;
    const cinema = await prisma.cinema.create({ data: { name: suffix, neighborhood: 'Local', address: 'Disposable', features: [] } });
    cinemaId = cinema.id;
    const auditorium = await prisma.auditorium.create({ data: { cinemaId, name: suffix, screenNumber: 1, supportedFormats: ['STANDARD_2D'] } });
    auditoriumId = auditorium.id;
    const seat = await prisma.seat.create({ data: { auditoriumId, row: 'A', column: 1, seatNumber: `${suffix}-A1`, tier: SeatTier.STANDARD } });
    seatId = seat.id;
    const movie = await prisma.movie.create({ data: { title: suffix, synopsis: 'Disposable integration fixture', runtime: 90, ageRating: 'PG', releaseYear: 2026, genres: ['Test'], formats: ['STANDARD_2D'] } });
    movieId = movie.id;
    const showtime = await prisma.showtime.create({ data: { movieId, auditoriumId, startTime: new Date(Date.now() + 3600000), endTime: new Date(Date.now() + 7200000), format: ScreenFormat.STANDARD_2D, status: ShowtimeStatus.OPEN_FOR_BOOKING } });
    showtimeId = showtime.id;
    const booking = await prisma.booking.create({ data: { bookingReference: suffix, userId, showtimeId, status: BookingStatus.CONFIRMED, seatCount: 1, subtotalKobo: 700000, totalKobo: 700000, contactEmail: `${suffix}@local.invalid`, confirmedAt: new Date() } });
    bookingId = booking.id;
    const payment = await prisma.paymentAttempt.create({ data: { bookingId, provider: PaymentProvider.TEST_GATEWAY, providerTransactionId: suffix, amountKobo: 700000, status: PaymentStatus.SUCCEEDED } });
    paymentId = payment.id;
    const ticket = await prisma.ticket.create({ data: { ticketCode: suffix, bookingId, showtimeId, seatId, tier: SeatTier.STANDARD, priceKobo: 700000, status: TicketStatus.CONFIRMED } });
    ticketId = ticket.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.ticket.deleteMany({ where: { id: ticketId } });
    await prisma.paymentAttempt.deleteMany({ where: { id: paymentId } });
    await prisma.booking.deleteMany({ where: { id: bookingId } });
    await prisma.seat.deleteMany({ where: { id: seatId } });
    await prisma.showtime.deleteMany({ where: { id: showtimeId } });
    await prisma.movie.deleteMany({ where: { id: movieId } });
    await prisma.auditorium.deleteMany({ where: { id: auditoriumId } });
    await prisma.cinema.deleteMany({ where: { id: cinemaId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await redis?.disconnect();
    await prisma.$disconnect();
  });

  it('logs in through the real database and honors current role/authVersion state', async () => {
    const login = await testRequest(app, { method: 'POST', url: '/api/v1/staff-auth/login', body: { email: `${(await prisma.user.findUnique({ where: { id: userId } }))?.email}`, password: 'M0521 synthetic staff password' } });
    expect(login.status).toBe(200);
    token = login.body.data.token;
    const deniedPassword = await testRequest(app, { method: 'POST', url: '/api/v1/staff-auth/login', body: { email: 'missing@local.invalid', password: 'wrong' } });
    expect(deniedPassword.status).toBe(401);
    await prisma.user.update({ where: { id: userId }, data: { role: Role.CUSTOMER } });
    const roleDenied = await testRequest(app, { method: 'POST', url: '/api/v1/tickets/verify', headers: { Authorization: `Bearer ${token}` }, body: { token: 'not-used' } });
    expect(roleDenied.status).toBe(403);
    await prisma.user.update({ where: { id: userId }, data: { role: Role.CINEMA_ADMIN, authVersion: { increment: 1 } } });
    const revoked = await testRequest(app, { method: 'POST', url: '/api/v1/tickets/verify', headers: { Authorization: `Bearer ${token}` }, body: { token: 'not-used' } });
    expect(revoked.status).toBe(401);
  });

  it('runs real Redis rate limiting and the protected scanner flow', async () => {
    const limiter = new StaffLoginRateLimiter(redis);
    const auth = new StaffAuthService(prisma, limiter);
    const staff = await auth.login(`${(await prisma.user.findUnique({ where: { id: userId } }))?.email}`, 'M0521 synthetic staff password', 'local-source');
    const qr = new TicketQrService({ prisma });
    const qrToken = await qr.issueForTicket(ticketId);
    const verified = await testRequest(app, { method: 'POST', url: '/api/v1/tickets/verify', headers: { Authorization: `Bearer ${staff.token}` }, body: { token: qrToken, showtimeId } });
    expect(verified.status).toBe(200);
    const scans = await Promise.all([
      testRequest(app, { method: 'POST', url: '/api/v1/tickets/check-in', headers: { Authorization: `Bearer ${staff.token}` }, body: { token: qrToken, showtimeId } }),
      testRequest(app, { method: 'POST', url: '/api/v1/tickets/check-in', headers: { Authorization: `Bearer ${staff.token}` }, body: { token: qrToken, showtimeId } }),
    ]);
    expect(scans.filter((scan) => scan.status === 200)).toHaveLength(1);
    expect(scans.filter((scan) => scan.status !== 200)).toHaveLength(1);
  });
});
