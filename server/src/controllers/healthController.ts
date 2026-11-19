import { Request, Response } from 'express';
import { env } from '../config/env.js';

export function getHealthStatus(req: Request, res: Response): void {
  const uptime = process.uptime();

  res.status(200).json({
    status: 'healthy',
    service: 'matinee-backend-api',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(uptime),
    environment: env.NODE_ENV,
    version: '1.0.0',
    subsystems: {
      api: 'operational',
      database: 'unconnected (provisioning pending in task M05.1)',
      redis: 'unconnected (hold engine planned for milestone M05.2)',
      payments: 'disabled (non-transactional preview mode)',
    },
  });
}

