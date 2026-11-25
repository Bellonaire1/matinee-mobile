import { z } from 'zod';

export const staffLoginBodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(512),
});

export const ticketScanBodySchema = z.object({
  token: z.string().trim().min(1).max(4096),
  showtimeId: z.string().trim().min(1).optional(),
});

export type StaffLoginBody = z.infer<typeof staffLoginBodySchema>;
export type TicketScanBody = z.infer<typeof ticketScanBodySchema>;
