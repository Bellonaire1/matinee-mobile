import { z } from 'zod';
import { MAX_HOLD_SEATS, MIN_HOLD_SEATS } from '../services/seatHoldService.js';

export const createHoldBodySchema = z.object({
  showtimeId: z.string().trim().min(1, 'Showtime ID is required').optional(),
  seatIds: z
    .array(z.string().trim().min(1, 'Seat ID cannot be empty'))
    .min(MIN_HOLD_SEATS, `At least ${MIN_HOLD_SEATS} seat must be selected`)
    .max(MAX_HOLD_SEATS, `Cannot hold more than ${MAX_HOLD_SEATS} seats`),
});

export const showtimeHoldParamsSchema = z.object({
  id: z.string().trim().min(1, 'Showtime ID is required'),
});

export type CreateHoldBody = z.infer<typeof createHoldBodySchema>;
export type ShowtimeHoldParams = z.infer<typeof showtimeHoldParamsSchema>;
