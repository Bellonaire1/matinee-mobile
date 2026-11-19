import { z } from 'zod';
import { MAX_HOLD_SEATS, MIN_HOLD_SEATS } from '../services/seatHoldService.js';
import { AppError } from '../middleware/errorHandler.js';

export const createBookingBodySchema = z.object({
  showtimeId: z.string().trim().min(1, 'Showtime ID is required'),
  seatIds: z
    .array(z.string().trim().min(1, 'Seat ID cannot be empty'))
    .min(MIN_HOLD_SEATS, `At least ${MIN_HOLD_SEATS} seat must be selected`)
    .max(MAX_HOLD_SEATS, `Cannot book more than ${MAX_HOLD_SEATS} seats`),
  contactEmail: z.string().trim().email('A valid contact email address is required'),
  contactName: z.string().trim().min(1).max(100).optional(),
  contactPhone: z.string().trim().min(1).max(30).optional(),
  totalPriceKobo: z.number().int().positive().optional(),
});

export type CreateBookingBody = z.infer<typeof createBookingBodySchema>;

/**
 * High-entropy idempotency key format validator:
 * Accepts valid UUID v4 formats or client-generated high-entropy tokens
 * between 16 and 128 characters using URL-safe characters [A-Za-z0-9_-].
 * Rejects missing, blank, trivial, or malformed keys.
 */
export const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9_-]{16,128}$/;

export function validateIdempotencyKey(key: string | undefined): string {
  if (!key || !key.trim()) {
    throw new AppError(
      'Idempotency-Key header is required for booking checkout initialization',
      400,
      'MISSING_IDEMPOTENCY_KEY'
    );
  }
  const cleanKey = key.trim();
  if (!IDEMPOTENCY_KEY_REGEX.test(cleanKey)) {
    throw new AppError(
      'Idempotency-Key header is malformed. Must be a valid UUID or high-entropy string (16-128 alphanumeric characters, hyphens, or underscores)',
      400,
      'MALFORMED_IDEMPOTENCY_KEY'
    );
  }
  return cleanKey;
}
