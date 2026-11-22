import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import apiRouter from './routes/index.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';

/**
 * Determines whether a given request origin is authorized per CORS policy.
 * - Requests without an Origin header (native mobile React Native/Expo app, curl, server-to-server)
 *   are always permitted.
 * - Browser origins must explicitly match the comma-separated whitelist configured in CORS_ORIGIN.
 * - Wildcard '*' is disallowed when credentials: true per W3C CORS specification to prevent
 *   arbitrary origin reflection.
 */
export function isOriginAllowed(origin: string | undefined, corsOriginConfig: string): boolean {
  if (!origin) {
    // Native mobile apps and server-to-server requests have no Origin header
    return true;
  }
  if (!corsOriginConfig || corsOriginConfig === '*') {
    // In production with credentials: true, arbitrary origins must not be reflected
    return false;
  }
  const allowed = corsOriginConfig
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(origin.toLowerCase());
}

export function createApp(): Express {
  const app = express();

  // Basic HTTP Security Headers
  app.use(helmet());

  // Controlled Cross-Origin Resource Sharing
  app.use(
    cors({
      origin: (origin, callback) => {
        if (isOriginAllowed(origin, env.CORS_ORIGIN)) {
          callback(null, true);
        } else {
          // Disallowed origin: omit CORS response headers so browser security blocks access
          callback(null, false);
        }
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Idempotency-Key',
        'X-Hold-Token',
        'Paystack-Signature',
        'x-paystack-signature',
      ],
      credentials: true,
    })
  );

  // Body Parsing with controlled size limits and rawBody retention for webhook signature verification
  app.use(
    express.json({
      limit: '1mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Root redirect/fallback info
  app.get('/', (req, res) => {
    res.status(200).json({
      name: 'Matinee Backend API',
      status: 'online',
      documentation: 'See /api/v1/health for service probe',
      version: '1.0.0',
    });
  });

  // Mount API v1 router
  app.use(env.API_PREFIX, apiRouter);

  // 404 Unmatched Route Handler
  app.use(notFoundHandler);

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}

export const app: Express = createApp();
export default app;

