import { Request, Response, NextFunction } from 'express';
import bookingService from '../services/bookingService.js';
import { CreateBookingBody, validateIdempotencyKey } from '../schemas/bookingSchemas.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Extracts hold capability token strictly from secure HTTP headers.
 * Secret tokens are NEVER accepted from URL paths, query parameters or request body
 * to prevent leaking credentials into proxy/server access logs.
 */
function extractHoldToken(req: Request): string {
  const customHeader = req.header('X-Hold-Token');
  if (customHeader && customHeader.trim()) {
    return customHeader.trim();
  }
  const authHeader = req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.substring(7).trim();
    if (bearer) return bearer;
  }
  throw new AppError(
    'Hold capability token must be provided via X-Hold-Token header or Authorization Bearer header',
    401,
    'MISSING_HOLD_TOKEN'
  );
}

export async function createBooking(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const holdToken = extractHoldToken(req);
    const body = req.body as CreateBookingBody;

    // Validate mandatory Idempotency-Key header strictly
    const rawIdempotencyKey = req.header('Idempotency-Key');
    const idempotencyKey = validateIdempotencyKey(rawIdempotencyKey);

    const booking = await bookingService.createBooking({
      showtimeId: body.showtimeId,
      seatIds: body.seatIds,
      contactEmail: body.contactEmail,
      contactName: body.contactName,
      contactPhone: body.contactPhone,
      totalPriceKobo: body.totalPriceKobo,
      holdToken,
      idempotencyKey,
    });

    if (booking.isReplay) {
      const { isReplay, ...cleanBooking } = booking;
      res.set('Idempotency-Replay', 'true');
      res.status(200).json({
        status: 'success',
        data: cleanBooking,
      });
      return;
    }

    res.status(201).json({
      status: 'success',
      data: booking,
    });
  } catch (error) {
    next(error);
  }
}
