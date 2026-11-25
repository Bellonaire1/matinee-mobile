import { NextFunction, Request, Response } from 'express';
import {
  resolveStaffAuthConfig,
  StaffAuthError,
  StaffIdentity,
  staffAuthService,
} from '../services/staffAuthService.js';

export interface StaffAuthenticatedRequest extends Request {
  staff?: StaffIdentity;
}

export async function requireStaffAuth(
  req: StaffAuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authorization = req.header('Authorization');
    const config = resolveStaffAuthConfig();
    if (!config.enabled) {
      throw new StaffAuthError('Staff authentication is disabled.', 503, 'STAFF_AUTH_DISABLED');
    }
    if (!authorization) {
      throw new StaffAuthError('Staff bearer authentication is required.', 401, 'STAFF_AUTH_REQUIRED');
    }
    if (!/^Bearer\s+\S+$/.test(authorization)) {
      throw new StaffAuthError('Staff bearer authentication is malformed.', 401, 'STAFF_AUTH_INVALID');
    }
    const token = authorization!.slice(7).trim();
    req.staff = await staffAuthService.authenticate(token);
    next();
  } catch (error) {
    next(error);
  }
}
