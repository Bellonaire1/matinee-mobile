import { beforeEach, describe, expect, it } from 'vitest';
import { BookingStatus, PaymentStatus, TicketStatus } from '@prisma/client';
import {
  resolveTicketQrConfig,
  signTicketQrClaims,
  TicketQrConfig,
  TicketQrError,
  TicketQrService,
  verifyTicketQrToken,
} from '../src/services/ticketQrService.js';
import { TicketCheckInService } from '../src/services/ticketCheckInService.js';
import { hashStaffPassword, StaffAuthService } from '../src/services/staffAuthService.js';

const config: TicketQrConfig = {
  signingKey: 'qr-signing-key-that-is-at-least-32-bytes-long',
  signingKeyId: 'qr-key-2026-01',
  issuer: 'matinee-admission',
  audience: 'matinee-scanner',
  ttlSeconds: 3600,
};
const now = new Date('2026-11-25T12:00:00.000Z');

function makeTicket(overrides: Record<string, unknown> = {}): any {
  const booking = {
    id: 'booking-1',
    status: BookingStatus.CONFIRMED,
    showtimeId: 'showtime-1',
    totalKobo: 500000,
    paymentAttempts: [
      {
        status: PaymentStatus.SUCCEEDED,
        providerTransactionId: 'provider-txn-1',
        amountKobo: 500000,
      },
    ],
  };
  return {
    id: 'ticket-1',
    bookingId: booking.id,
    showtimeId: booking.showtimeId,
    status: TicketStatus.CONFIRMED,
    qrPayload: null,
    checkedInAt: null,
    booking,
    ...overrides,
  };
}

function makeDatabase(ticket = makeTicket()): any {
  const database = {
    ticket: {
      findUnique: async () => ticket,
      update: async ({ data }: any) => Object.assign(ticket, data),
      updateMany: async ({ where, data }: any) => {
        if (ticket.id !== where.id || ticket.status !== where.status || ticket.checkedInAt !== where.checkedInAt) {
          return { count: 0 };
        }
        Object.assign(ticket, data);
        return { count: 1 };
      },
    },
    $transaction: async (callback: any) => callback(database),
  };
  return database;
}

function claims(exp = Math.floor(now.getTime() / 1000) + 3600) {
  return {
    iss: config.issuer,
    aud: config.audience,
    sub: 'ticket-1',
    ticketId: 'ticket-1',
    showtimeId: 'showtime-1',
    iat: Math.floor(now.getTime() / 1000),
    exp,
    jti: 'jti-1',
  };
}

function expectQrError(action: () => unknown, code: string): void {
  expect(() => action()).toThrowError(expect.objectContaining({ code }));
}

describe('ticket QR signing and admission check-in', () => {
  beforeEach(() => {
    process.env.TICKET_QR_SIGNING_KEY = config.signingKey;
    process.env.TICKET_QR_SIGNING_KEY_ID = config.signingKeyId;
    process.env.TICKET_QR_ISSUER = config.issuer;
    process.env.TICKET_QR_AUDIENCE = config.audience;
    process.env.TICKET_QR_TTL_SECONDS = String(config.ttlSeconds);
    process.env.STAFF_AUTH_ENABLED = 'true';
    process.env.STAFF_AUTH_JWT_SECRET = 'staff-auth-signing-key-that-is-at-least-32-bytes-long';
  });

  it('issues only for a confirmed ticket with a verified successful payment', async () => {
    const database = makeDatabase();
    const token = await new TicketQrService({ prisma: database }).issueForTicket('ticket-1', now);
    const verified = verifyTicketQrToken(token, config, now);
    expect(verified.ticketId).toBe('ticket-1');
    expect(database.ticket.findUnique).toBeDefined();
  });

  it.each([
    ['pending ticket', { status: TicketStatus.PENDING_PAYMENT }],
    ['cancelled ticket', { status: TicketStatus.CANCELLED }],
    ['refunded ticket', { status: TicketStatus.REFUNDED_RESTRICTED }],
    ['pending booking', { booking: { ...makeTicket().booking, status: BookingStatus.PENDING } }],
    ['missing payment', { booking: { ...makeTicket().booking, paymentAttempts: [] } }],
    ['wrong payment amount', {
      booking: {
        ...makeTicket().booking,
        paymentAttempts: [{ status: PaymentStatus.SUCCEEDED, providerTransactionId: 'txn', amountKobo: 1 }],
      },
    }],
  ])('rejects %s', async (_label, overrides) => {
    await expect(
      new TicketQrService({ prisma: makeDatabase(makeTicket(overrides)) }).issueForTicket('ticket-1', now)
    ).rejects.toMatchObject({ code: 'TICKET_NOT_ELIGIBLE' });
  });

  it('rejects tampering, expiry, wrong issuer, wrong audience, and unknown key id', () => {
    const token = signTicketQrClaims(claims(), config);
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1].replace(/.$/, 'x')}.${parts[2]}`;
    expectQrError(() => verifyTicketQrToken(tampered, config, now), 'QR_INVALID');
    expectQrError(() => verifyTicketQrToken(signTicketQrClaims(claims(Math.floor(now.getTime() / 1000)), config), config, now), 'QR_INVALID');
    expectQrError(() => verifyTicketQrToken(signTicketQrClaims({ ...claims(), iss: 'other' }, config), config, now), 'QR_INVALID');
    expectQrError(() => verifyTicketQrToken(signTicketQrClaims({ ...claims(), aud: 'other' }, config), config, now), 'QR_INVALID');
    expectQrError(() => verifyTicketQrToken(token, { ...config, signingKeyId: 'unknown' }, now), 'QR_INVALID');
  });

  it('fails closed when the signing key is absent or a placeholder', () => {
    expect(() => resolveTicketQrConfig({ TICKET_QR_SIGNING_KEY_ID: 'id' })).toThrowError(
      expect.objectContaining({ code: 'QR_SIGNING_CONFIG_MISSING' })
    );
    expect(() => resolveTicketQrConfig({
      TICKET_QR_SIGNING_KEY: 'development-placeholder-key-that-is-long-enough',
      TICKET_QR_SIGNING_KEY_ID: 'id',
    })).toThrowError(expect.objectContaining({ code: 'QR_SIGNING_CONFIG_MISSING' }));
  });

  it('requires authenticated authorized staff and atomically prevents duplicate scans', async () => {
    const database = makeDatabase();
    const ticketService = new TicketQrService({ prisma: database });
    const token = await ticketService.issueForTicket('ticket-1', now);
    const checkIn = new TicketCheckInService({ prisma: database });

    await expect(checkIn.verifyAndCheckIn(token, undefined, undefined, now)).rejects.toMatchObject({
      code: 'STAFF_AUTH_REQUIRED',
    });
    await expect(checkIn.verifyAndCheckIn(token, { id: 'staff-1', role: 'INVALID' as any }, undefined, now)).rejects.toMatchObject({
      code: 'STAFF_NOT_AUTHORIZED',
    });
    await expect(checkIn.verifyAndCheckIn(token, { id: 'staff-1', role: 'CINEMA_ADMIN' }, undefined, now)).resolves.toMatchObject({
      ticketId: 'ticket-1',
    });
    await expect(checkIn.verifyAndCheckIn(token, { id: 'staff-1', role: 'CINEMA_ADMIN' }, undefined, now)).rejects.toMatchObject({
      code: 'TICKET_ALREADY_USED',
    });
  });

  it('allows only one of two concurrent scans to transition the ticket', async () => {
    const database = makeDatabase();
    const token = await new TicketQrService({ prisma: database }).issueForTicket('ticket-1', now);
    const checkIn = new TicketCheckInService({ prisma: database });
    const results = await Promise.allSettled([
      checkIn.verifyAndCheckIn(token, { id: 'staff-1', role: 'CINEMA_ADMIN' }, undefined, now),
      checkIn.verifyAndCheckIn(token, { id: 'staff-2', role: 'CINEMA_ADMIN' }, undefined, now),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('rehearses staff login through verified QR issuance and atomic check-in', async () => {
    const database = makeDatabase();
    const staffPasswordHash = await hashStaffPassword('correct horse battery staple');
    database.user = {
      findUnique: async () => ({ id: 'staff-1', role: 'CINEMA_ADMIN', passwordHash: staffPasswordHash, authVersion: 1 }),
    };
    const login = await new StaffAuthService(database).login(
      'staff@example.com',
      'correct horse battery staple',
      'local-test-source',
      now
    );
    const token = await new TicketQrService({ prisma: database }).issueForTicket('ticket-1', now);
    const result = await new TicketCheckInService({ prisma: database }).verifyAndCheckIn(
      token,
      login.staff,
      'showtime-1',
      now
    );
    expect(result).toMatchObject({ ticketId: 'ticket-1', showtimeId: 'showtime-1' });
  });

  it('rejects a showtime mismatch, revoked token, and already checked-in ticket', async () => {
    const ticket = makeTicket();
    const database = makeDatabase(ticket);
    const token = await new TicketQrService({ prisma: database }).issueForTicket('ticket-1', now);
    const checkIn = new TicketCheckInService({ prisma: database });
    await expect(checkIn.verifyAndCheckIn(token, { id: 'staff-1', role: 'SYSTEM_ADMIN' }, 'showtime-2', now)).rejects.toMatchObject({
      code: 'SHOWTIME_MISMATCH',
    });
    ticket.qrPayload = 'replaced-token';
    await expect(checkIn.verifyAndCheckIn(token, { id: 'staff-1', role: 'SYSTEM_ADMIN' }, undefined, now)).rejects.toMatchObject({
      code: 'QR_REVOKED',
    });
    ticket.qrPayload = token;
    ticket.status = TicketStatus.CHECKED_IN;
    await expect(checkIn.verifyAndCheckIn(token, { id: 'staff-1', role: 'SYSTEM_ADMIN' }, undefined, now)).rejects.toMatchObject({
      code: 'TICKET_ALREADY_USED',
    });
  });
});
