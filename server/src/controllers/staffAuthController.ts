import { NextFunction, Request, Response } from 'express';
import { staffLoginBodySchema } from '../schemas/staffAuthSchemas.js';
import { staffAuthService } from '../services/staffAuthService.js';

export async function loginStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = staffLoginBodySchema.parse(req.body);
    const result = await staffAuthService.login(body.email, body.password, req.ip || 'unknown');
    res.status(200).json({
      status: 'success',
      data: { token: result.token, tokenType: 'Bearer', expiresAt: result.expiresAt.toISOString() },
    });
  } catch (error) {
    next(error);
  }
}
