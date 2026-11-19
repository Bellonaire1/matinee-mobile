import { Request, Response, NextFunction } from 'express';
import seatHoldService from '../services/seatHoldService.js';
import { CreateHoldBody } from '../schemas/holdSchemas.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Extracts hold capability token strictly from secure HTTP headers.
 * Tokens are NEVER accepted from URL path parameters or query strings
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

export async function createHold(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const showtimeId = req.params.id || req.body.showtimeId;
    if (!showtimeId) {
      throw new AppError('Showtime ID is required', 400, 'MISSING_SHOWTIME_ID');
    }

    const body = req.body as CreateHoldBody;
    const idempotencyKey = req.header('Idempotency-Key') || undefined;
    const customHeader = req.header('X-Hold-Token');
    const authHeader = req.header('Authorization');
    const proofToken =
      customHeader?.trim() ||
      (authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : undefined);

    const holdResult = await seatHoldService.acquireHold({
      showtimeId,
      seatIds: body.seatIds,
      idempotencyKey,
      proofToken,
    });

    res.status(201).json({
      status: 'success',
      data: holdResult,
    });
  } catch (error) {
    next(error);
  }
}

export async function getHold(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const holdToken = extractHoldToken(req);
    const holdDetails = await seatHoldService.getHold(holdToken);

    if (!holdDetails) {
      throw new AppError('Hold not found or has already expired', 404, 'HOLD_NOT_FOUND');
    }

    res.status(200).json({
      status: 'success',
      data: holdDetails,
    });
  } catch (error) {
    next(error);
  }
}

export async function releaseHold(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const holdToken = extractHoldToken(req);
    const releaseResult = await seatHoldService.releaseHold(holdToken);

    res.status(200).json({
      status: 'success',
      data: releaseResult,
    });
  } catch (error) {
    next(error);
  }
}

export async function heartbeatHold(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const holdToken = extractHoldToken(req);
    const extendResult = await seatHoldService.extendHold(holdToken);

    res.status(200).json({
      status: 'success',
      data: extendResult,
    });
  } catch (error) {
    next(error);
  }
}
