import { Request, Response } from 'express';
import { env } from '../config/env.js';
import { prisma as defaultPrisma } from '../db.js';
import { getRedisClient, IRedisClient } from '../services/redis/index.js';
import { verifyDatabaseIsolation } from '../config/databaseIsolation.js';

export interface ReadinessCheckOptions {
  prismaClient?: { $queryRawUnsafe: (query: string) => Promise<unknown> };
  redisClient?: IRedisClient;
  databaseUrl?: string;
  timeoutMs?: number;
  enforceIsolationCheck?: boolean;
}

export interface ReadinessReport {
  ready: boolean;
  status: 'ready' | 'not_ready';
  timestamp: string;
  uptimeSeconds: number;
  checks: {
    database: 'healthy' | 'unhealthy';
    redis: 'healthy' | 'unhealthy';
  };
  errors?: {
    database?: string;
    redis?: string;
  };
}

/**
 * Executes live dependency readiness verification with strict timeouts.
 * Checks:
 * 1. PostgreSQL live read-only query (SELECT 1).
 * 2. Redis live protocol ping (PING -> PONG).
 * 3. Staging database identity isolation (rejects protected Neon main branch).
 *
 * Security Invariant: Sanitized output ONLY. Never leaks database URLs,
 * passwords, internal IP addresses, or Redis credentials.
 */
export async function checkReadiness(
  options: ReadinessCheckOptions = {}
): Promise<ReadinessReport> {
  const timeoutMs = options.timeoutMs ?? 2500;
  const prismaClient = options.prismaClient ?? defaultPrisma;
  const redisClient = options.redisClient ?? getRedisClient();
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  const enforceIsolation =
    options.enforceIsolationCheck ??
    (process.env.STAGING_VERIFY_DISPOSABLE_DB === 'true' ||
      process.env.NODE_ENV === 'staging' ||
      process.env.APP_ENV === 'staging' ||
      process.env.DEPLOYMENT_ENV === 'staging');

  let databaseHealthy = false;
  let dbErrorReason: string | undefined;

  // Step 1: Database isolation check for staging environments
  if (enforceIsolation && databaseUrl) {
    const isolation = verifyDatabaseIsolation(databaseUrl, {
      requireDisposableBranch: true,
      expectedEndpointPrefix: process.env.EXPECTED_NEON_BRANCH_ENDPOINT,
    });
    if (!isolation.isSafe) {
      databaseHealthy = false;
      dbErrorReason = 'Database isolation failed: protected branch or endpoint mismatch.';
    }
  }

  // Step 2: PostgreSQL connectivity check (SELECT 1)
  if (!dbErrorReason) {
    try {
      const dbPromise = prismaClient.$queryRawUnsafe('SELECT 1');
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database connectivity timed out')), timeoutMs)
      );

      await Promise.race([dbPromise, timeoutPromise]);
      databaseHealthy = true;
    } catch {
      databaseHealthy = false;
      dbErrorReason = 'Database connectivity check failed';
    }
  }

  // Step 3: Redis protocol ping check
  let redisHealthy = false;
  let redisErrorReason: string | undefined;

  try {
    const redisPromise = redisClient.ping();
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('Redis ping timed out')), timeoutMs)
    );

    const pingResponse = await Promise.race([redisPromise, timeoutPromise]);
    if (pingResponse === 'PONG' || pingResponse === 'OK') {
      redisHealthy = true;
    } else {
      redisHealthy = false;
      redisErrorReason = 'Redis returned unexpected ping response';
    }
  } catch {
    redisHealthy = false;
    redisErrorReason = 'Redis ping check failed';
  }

  const isReady = databaseHealthy && redisHealthy;
  const report: ReadinessReport = {
    ready: isReady,
    status: isReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    checks: {
      database: databaseHealthy ? 'healthy' : 'unhealthy',
      redis: redisHealthy ? 'healthy' : 'unhealthy',
    },
  };

  if (!isReady) {
    report.errors = {};
    if (dbErrorReason) report.errors.database = dbErrorReason;
    if (redisErrorReason) report.errors.redis = redisErrorReason;
  }

  return report;
}

/**
 * GET /api/v1/health
 * Public Liveness Probe: confirms the HTTP process is running and accepting requests.
 * Does not block on external dependencies.
 */
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
      database: 'unconnected (see /api/v1/ready for live dependency probe)',
      redis: 'unconnected (see /api/v1/ready for live dependency probe)',
      payments: 'disabled (non-transactional preview mode)',
    },
  });
}

/**
 * Factory for Express readiness route handler, supporting dependency injection for testing.
 */
export function createReadinessHandler(
  options?: ReadinessCheckOptions
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    const report = await checkReadiness(options);

    if (report.ready) {
      res.status(200).json(report);
    } else {
      res.status(503).json(report);
    }
  };
}

/**
 * GET /api/v1/ready
 * Public Readiness Probe: confirms PostgreSQL and Redis are both operational.
 * Returns HTTP 200 if both pass, HTTP 503 if either fails.
 */
export const getReadinessStatus = createReadinessHandler();
