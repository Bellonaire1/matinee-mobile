import { NextFunction, Response } from 'express';
import { StaffAuthenticatedRequest } from '../middleware/staffAuth.js';
import { ticketScanBodySchema } from '../schemas/staffAuthSchemas.js';
import { ticketCheckInService } from '../services/ticketCheckInService.js';
import { ticketQrService } from '../services/ticketQrService.js';

export async function verifyTicket(
  req: StaffAuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = ticketScanBodySchema.parse(req.body);
    const result = await ticketQrService.verifyForAdmission(body.token, body.showtimeId);
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
}

export async function checkInTicket(
  req: StaffAuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = ticketScanBodySchema.parse(req.body);
    const result = await ticketCheckInService.verifyAndCheckIn(body.token, req.staff, body.showtimeId);
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
}
