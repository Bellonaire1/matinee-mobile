import { PrismaClient, TicketStatus } from '@prisma/client';
import defaultPrisma from '../db.js';
import {
  assertTicketEligibleForQr,
  resolveTicketQrConfig,
  TicketQrDatabase,
  TicketQrError,
  verifyTicketQrToken,
} from './ticketQrService.js';

export type StaffRole = 'CINEMA_ADMIN' | 'SYSTEM_ADMIN';

export interface AuthenticatedStaffIdentity {
  id: string;
  role: StaffRole;
}

export interface CheckInDatabase extends TicketQrDatabase {
  $transaction<T>(callback: (transaction: TicketQrDatabase) => Promise<T>): Promise<T>;
}

export class TicketCheckInService {
  private readonly database: CheckInDatabase;

  constructor(options?: { prisma?: PrismaClient | CheckInDatabase }) {
    this.database = (options?.prisma || defaultPrisma) as unknown as CheckInDatabase;
  }

  async verifyAndCheckIn(
    token: string,
    staff: AuthenticatedStaffIdentity | undefined,
    expectedShowtimeId?: string,
    now: Date = new Date()
  ): Promise<{ ticketId: string; showtimeId: string; checkedInAt: Date }> {
    if (!staff) {
      throw new TicketQrError('Authenticated staff identity is required for check-in.', 'STAFF_AUTH_REQUIRED');
    }
    if (!staff.id || (staff.role !== 'CINEMA_ADMIN' && staff.role !== 'SYSTEM_ADMIN')) {
      throw new TicketQrError('Staff identity is not authorized for check-in.', 'STAFF_NOT_AUTHORIZED');
    }

    const config = resolveTicketQrConfig();
    const claims = verifyTicketQrToken(token, config, now);
    if (expectedShowtimeId && claims.showtimeId !== expectedShowtimeId) {
      throw new TicketQrError('Ticket is not valid for this showtime.', 'SHOWTIME_MISMATCH');
    }

    return this.database.$transaction(async (transaction) => {
      const ticket = await transaction.ticket.findUnique({
        where: { id: claims.ticketId },
        include: { booking: { include: { paymentAttempts: true } } },
      });
      if (!ticket) {
        throw new TicketQrError('Ticket was not found.', 'TICKET_NOT_FOUND');
      }
      if (ticket.qrPayload !== token) {
        throw new TicketQrError('Ticket QR has been revoked or replaced.', 'QR_REVOKED');
      }
      if (ticket.showtimeId !== claims.showtimeId) {
        throw new TicketQrError('Ticket QR showtime does not match the ticket.', 'SHOWTIME_MISMATCH');
      }
      if (ticket.status === TicketStatus.CHECKED_IN) {
        throw new TicketQrError('Ticket has already been checked in.', 'TICKET_ALREADY_USED');
      }

      assertTicketEligibleForQr(ticket);
      const checkedInAt = now;
      const update = await transaction.ticket.updateMany({
        where: { id: ticket.id, status: TicketStatus.CONFIRMED, checkedInAt: null },
        data: { status: TicketStatus.CHECKED_IN, checkedInAt },
      });
      if (update.count !== 1) {
        throw new TicketQrError('Ticket has already been checked in.', 'TICKET_ALREADY_USED');
      }

      return { ticketId: ticket.id, showtimeId: ticket.showtimeId, checkedInAt };
    });
  }
}

export const ticketCheckInService = new TicketCheckInService();
