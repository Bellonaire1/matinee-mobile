import crypto from 'crypto';
import { BookingStatus, PaymentStatus, PrismaClient, TicketStatus } from '@prisma/client';
import defaultPrisma from '../db.js';

const QR_ALGORITHM = 'HS256';
const MIN_SIGNING_KEY_BYTES = 32;

export interface TicketQrConfig {
  signingKey: string;
  signingKeyId: string;
  issuer: string;
  audience: string;
  ttlSeconds: number;
}

export interface TicketQrClaims {
  iss: string;
  aud: string;
  sub: string;
  ticketId: string;
  showtimeId: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface TicketQrDatabase {
  ticket: {
    findUnique(args: unknown): Promise<any>;
    update(args: unknown): Promise<any>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
}

export class TicketQrError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'TicketQrError';
  }
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
}

function signData(data: string, signingKey: string): string {
  return crypto
    .createHmac('sha256', signingKey)
    .update(data)
    .digest('base64url');
}

function isPlaceholderKey(key: string): boolean {
  return /placeholder|development|changeme|secret/i.test(key);
}

export function resolveTicketQrConfig(
  source: NodeJS.ProcessEnv = process.env
): TicketQrConfig {
  const signingKey = source.TICKET_QR_SIGNING_KEY?.trim();
  const signingKeyId = source.TICKET_QR_SIGNING_KEY_ID?.trim();
  const issuer = source.TICKET_QR_ISSUER?.trim() || 'matinee-admission';
  const audience = source.TICKET_QR_AUDIENCE?.trim() || 'matinee-scanner';
  const ttlSeconds = Number(source.TICKET_QR_TTL_SECONDS || 86400);

  if (!signingKey || Buffer.byteLength(signingKey, 'utf8') < MIN_SIGNING_KEY_BYTES || isPlaceholderKey(signingKey)) {
    throw new TicketQrError(
      'Ticket QR signing is unavailable because TICKET_QR_SIGNING_KEY is missing or insecure.',
      'QR_SIGNING_CONFIG_MISSING'
    );
  }
  if (!signingKeyId || !issuer || !audience || !Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new TicketQrError(
      'Ticket QR signing configuration is incomplete.',
      'QR_SIGNING_CONFIG_INVALID'
    );
  }

  return { signingKey, signingKeyId, issuer, audience, ttlSeconds };
}

export function signTicketQrClaims(claims: TicketQrClaims, config: TicketQrConfig): string {
  const header = encodeBase64Url(
    JSON.stringify({ alg: QR_ALGORITHM, kid: config.signingKeyId, typ: 'JWT' })
  );
  const payload = encodeBase64Url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  return `${signingInput}.${signData(signingInput, config.signingKey)}`;
}

export function verifyTicketQrToken(
  token: string,
  config: TicketQrConfig,
  now: Date = new Date()
): TicketQrClaims {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new TicketQrError('Ticket QR token is malformed.', 'QR_INVALID');
  }

  let header: { alg?: string; kid?: string };
  let claims: TicketQrClaims;
  try {
    header = JSON.parse(decodeBase64Url(parts[0])) as { alg?: string; kid?: string };
    claims = JSON.parse(decodeBase64Url(parts[1])) as TicketQrClaims;
  } catch {
    throw new TicketQrError('Ticket QR token is not valid JSON.', 'QR_INVALID');
  }

  if (header.alg !== QR_ALGORITHM || header.kid !== config.signingKeyId) {
    throw new TicketQrError('Ticket QR algorithm or signing key is not accepted.', 'QR_INVALID');
  }

  const expectedSignature = Buffer.from(signData(`${parts[0]}.${parts[1]}`, config.signingKey));
  const actualSignature = Buffer.from(parts[2]);
  if (
    expectedSignature.length !== actualSignature.length ||
    !crypto.timingSafeEqual(expectedSignature, actualSignature)
  ) {
    throw new TicketQrError('Ticket QR signature verification failed.', 'QR_INVALID');
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (
    claims.iss !== config.issuer ||
    claims.aud !== config.audience ||
    !claims.ticketId ||
    claims.sub !== claims.ticketId ||
    !claims.showtimeId ||
    !claims.jti ||
    !Number.isInteger(claims.iat) ||
    !Number.isInteger(claims.exp) ||
    claims.exp <= nowSeconds ||
    claims.iat > nowSeconds + 60
  ) {
    throw new TicketQrError('Ticket QR claims are invalid or expired.', 'QR_INVALID');
  }

  return claims;
}

function hasSuccessfulPayment(ticket: any): boolean {
  return ticket.booking?.paymentAttempts?.some(
    (payment: any) =>
      payment.status === PaymentStatus.SUCCEEDED &&
      Boolean(payment.providerTransactionId) &&
      payment.amountKobo === ticket.booking.totalKobo
  );
}

export function assertTicketEligibleForQr(ticket: any): void {
  if (!ticket || !ticket.booking) {
    throw new TicketQrError('Ticket was not found.', 'TICKET_NOT_FOUND');
  }
  if (ticket.status !== TicketStatus.CONFIRMED) {
    throw new TicketQrError('Ticket is not confirmed for admission.', 'TICKET_NOT_ELIGIBLE');
  }
  if (ticket.booking.status !== BookingStatus.CONFIRMED) {
    throw new TicketQrError('Booking is not confirmed for admission.', 'TICKET_NOT_ELIGIBLE');
  }
  if (ticket.showtimeId !== ticket.booking.showtimeId || !hasSuccessfulPayment(ticket)) {
    throw new TicketQrError('A verified successful payment is required for admission.', 'TICKET_NOT_ELIGIBLE');
  }
}

export class TicketQrService {
  private readonly database: TicketQrDatabase;

  constructor(options?: { prisma?: PrismaClient | TicketQrDatabase }) {
    this.database = (options?.prisma || defaultPrisma) as unknown as TicketQrDatabase;
  }

  async issueForTicket(ticketId: string, now: Date = new Date()): Promise<string> {
    const config = resolveTicketQrConfig();
    const ticket = await this.database.ticket.findUnique({
      where: { id: ticketId },
      include: { booking: { include: { paymentAttempts: true } } },
    });
    assertTicketEligibleForQr(ticket);

    const issuedAt = Math.floor(now.getTime() / 1000);
    const claims: TicketQrClaims = {
      iss: config.issuer,
      aud: config.audience,
      sub: ticket.id,
      ticketId: ticket.id,
      showtimeId: ticket.showtimeId,
      iat: issuedAt,
      exp: issuedAt + config.ttlSeconds,
      jti: crypto.randomUUID(),
    };
    const token = signTicketQrClaims(claims, config);
    await this.database.ticket.update({ where: { id: ticket.id }, data: { qrPayload: token } });
    return token;
  }

  async verifyForAdmission(
    token: string,
    expectedShowtimeId?: string,
    now: Date = new Date()
  ): Promise<{ ticketId: string; showtimeId: string; status: TicketStatus }> {
    const config = resolveTicketQrConfig();
    const claims = verifyTicketQrToken(token, config, now);
    if (expectedShowtimeId && claims.showtimeId !== expectedShowtimeId) {
      throw new TicketQrError('Ticket is not valid for this showtime.', 'SHOWTIME_MISMATCH');
    }
    const ticket = await this.database.ticket.findUnique({
      where: { id: claims.ticketId },
      include: { booking: { include: { paymentAttempts: true } } },
    });
    if (!ticket) throw new TicketQrError('Ticket was not found.', 'TICKET_NOT_FOUND');
    if (ticket.qrPayload !== token) throw new TicketQrError('Ticket QR has been revoked or replaced.', 'QR_REVOKED');
    if (ticket.showtimeId !== claims.showtimeId) {
      throw new TicketQrError('Ticket QR showtime does not match the ticket.', 'SHOWTIME_MISMATCH');
    }
    if (ticket.status === TicketStatus.CHECKED_IN) {
      throw new TicketQrError('Ticket has already been checked in.', 'TICKET_ALREADY_USED');
    }
    assertTicketEligibleForQr(ticket);
    return { ticketId: ticket.id, showtimeId: ticket.showtimeId, status: ticket.status };
  }
}

export const ticketQrService = new TicketQrService();
