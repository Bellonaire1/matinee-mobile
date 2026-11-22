import { Request, Response, NextFunction } from 'express';
import paymentService from '../services/payment/paymentService.js';
import {
  initializePaymentBodySchema,
  verifyPaymentParamsSchema,
} from '../schemas/paymentSchemas.js';

/**
 * Extracts hold capability token if present from secure HTTP headers.
 */
function extractOptionalHoldToken(req: Request): string | undefined {
  const customHeader = req.header('X-Hold-Token');
  if (customHeader && customHeader.trim()) {
    return customHeader.trim();
  }
  const authHeader = req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.substring(7).trim();
    if (bearer) return bearer;
  }
  return undefined;
}

/**
 * POST /api/v1/payments/initialize
 * Initializes a test payment checkout for a valid, unexpired PENDING booking.
 */
export async function initializePayment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsedBody = initializePaymentBodySchema.parse(req.body);
    const holdToken = extractOptionalHoldToken(req);
    const customerId = (req as any).user?.id;

    const result = await paymentService.initializePayment({
      bookingId: parsedBody.bookingId,
      userId: customerId,
      holdToken,
      contactEmail: parsedBody.email,
    });

    res.status(201).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/payments/webhook
 * Offline Paystack webhook ingestion path with HMAC-SHA512 verification
 * and durable event deduplication.
 */
export async function handleWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const paystackSignature = req.header('paystack-signature');
    const legacySignature = req.header('x-paystack-signature');
    const rawBody = (req as any).rawBody ?? JSON.stringify(req.body);

    const result = await paymentService.processWebhook(rawBody, {
      paystackSignature,
      legacySignature,
    });

    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/payments/status/:reference
 * Read-only status check for a payment attempt.
 * Protected by capability token proof or authenticated user ownership.
 */
export async function getPaymentStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { reference } = verifyPaymentParamsSchema.parse(req.params);
    const holdToken = extractOptionalHoldToken(req);
    const userId = (req as any).user?.id;

    const result = await paymentService.getPaymentStatus({
      reference,
      userId,
      holdToken,
    });

    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
