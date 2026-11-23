import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkReadiness,
  getReadinessStatus,
  createReadinessHandler,
} from '../src/controllers/healthController.js';
import {
  verifyDatabaseIsolation,
  extractSanitizedHost,
  PROTECTED_NEON_IDENTIFIERS,
} from '../src/config/databaseIsolation.js';
import { InMemoryRedisClient } from '../src/services/redis/inMemoryRedisClient.js';
import { FailingRedisClient } from '../src/services/redis/failingRedisClient.js';
import { Request, Response } from 'express';

describe('Readiness Probe & Database Isolation', () => {
  describe('Database Isolation Guard', () => {
    it('sanitizes connection string and extracts host without exposing credentials', () => {
      const connStr =
        'postgresql://neondb_owner:mock_fake_secret_pass_123!@ep-disposable-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require';
      const host = extractSanitizedHost(connStr);
      expect(host).toBe('ep-disposable-xyz.us-east-2.aws.neon.tech');
      expect(host).not.toContain('mock_fake_secret_pass_123!');
      expect(host).not.toContain('neondb_owner');
    });

    it('identifies and blocks all protected Neon main identifiers', () => {
      for (const id of PROTECTED_NEON_IDENTIFIERS) {
        const connStr = `postgresql://owner:pass@${id}.us-east-2.aws.neon.tech/neondb`;
        const result = verifyDatabaseIsolation(connStr);
        expect(result.isSafe).toBe(false);
        expect(result.isProtectedMain).toBe(true);
        expect(result.error).toContain('DATABASE ISOLATION VIOLATION');
      }
    });

    it('blocks connection if host contains br-small-frog-bjztb5yj or ep-small-frog', () => {
      const protectedUrls = [
        'postgres://user:pass@ep-small-frog-123456.us-east-2.aws.neon.tech/neondb',
        'postgres://user:pass@ep-small-frog.pooler.us-east-2.aws.neon.tech/neondb',
        'postgresql://user:pass@br-small-frog-bjztb5yj.aws.neon.tech/db',
      ];

      for (const url of protectedUrls) {
        const result = verifyDatabaseIsolation(url);
        expect(result.isSafe).toBe(false);
        expect(result.isProtectedMain).toBe(true);
      }
    });

    it('allows verified disposable branch endpoints', () => {
      const disposableUrl =
        'postgresql://user:pass@ep-staging-loadtest-01.us-east-2.aws.neon.tech/neondb?sslmode=require';
      const result = verifyDatabaseIsolation(disposableUrl, {
        requireDisposableBranch: true,
      });

      expect(result.isSafe).toBe(true);
      expect(result.isProtectedMain).toBe(false);
      expect(result.endpointPrefix).toBe('ep-staging-loadtest-01');
    });

    it('enforces expectedEndpointPrefix match if specified', () => {
      const disposableUrl =
        'postgresql://user:pass@ep-disposable-branch-abc.us-east-2.aws.neon.tech/neondb';

      const matchResult = verifyDatabaseIsolation(disposableUrl, {
        expectedEndpointPrefix: 'ep-disposable-branch-abc',
      });
      expect(matchResult.isSafe).toBe(true);

      const mismatchResult = verifyDatabaseIsolation(disposableUrl, {
        expectedEndpointPrefix: 'ep-other-branch',
      });
      expect(mismatchResult.isSafe).toBe(false);
      expect(mismatchResult.error).toContain('DATABASE ISOLATION MISMATCH');
    });

    it('fails closed when DATABASE_URL is missing or empty', () => {
      const result = verifyDatabaseIsolation(undefined);
      expect(result.isSafe).toBe(false);
      expect(result.error).toContain('DATABASE_URL is not configured');
    });
  });

  describe('checkReadiness core logic', () => {
    let mockPrisma: { $queryRawUnsafe: ReturnType<typeof vi.fn> };
    let mockRedis: InMemoryRedisClient;

    beforeEach(() => {
      mockPrisma = {
        $queryRawUnsafe: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
      };
      mockRedis = new InMemoryRedisClient();
    });

    it('returns ready=true when database (SELECT 1) and redis (PING) succeed', async () => {
      const report = await checkReadiness({
        prismaClient: mockPrisma,
        redisClient: mockRedis,
        databaseUrl: 'postgres://user:pass@ep-staging-valid.us-east-2.aws.neon.tech/db',
        enforceIsolationCheck: false,
      });

      expect(report.ready).toBe(true);
      expect(report.status).toBe('ready');
      expect(report.checks.database).toBe('healthy');
      expect(report.checks.redis).toBe('healthy');
      expect(report.errors).toBeUndefined();
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
    });

    it('returns ready=false with HTTP 503 semantics when database fails', async () => {
      mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error('Connection terminated'));

      const report = await checkReadiness({
        prismaClient: mockPrisma,
        redisClient: mockRedis,
      });

      expect(report.ready).toBe(false);
      expect(report.status).toBe('not_ready');
      expect(report.checks.database).toBe('unhealthy');
      expect(report.checks.redis).toBe('healthy');
      expect(report.errors?.database).toBe('Database connectivity check failed');
    });

    it('returns ready=false when Redis ping throws', async () => {
      const failingRedis = new FailingRedisClient('Redis unavailable');

      const report = await checkReadiness({
        prismaClient: mockPrisma,
        redisClient: failingRedis,
      });

      expect(report.ready).toBe(false);
      expect(report.status).toBe('not_ready');
      expect(report.checks.database).toBe('healthy');
      expect(report.checks.redis).toBe('unhealthy');
      expect(report.errors?.redis).toBe('Redis ping check failed');
    });

    it('returns ready=false when Redis client is unhealthy', async () => {
      mockRedis.setHealthy(false);

      const report = await checkReadiness({
        prismaClient: mockPrisma,
        redisClient: mockRedis,
      });

      expect(report.ready).toBe(false);
      expect(report.checks.redis).toBe('unhealthy');
    });

    it('times out if database query hangs beyond timeoutMs', async () => {
      mockPrisma.$queryRawUnsafe.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 500))
      );

      const report = await checkReadiness({
        prismaClient: mockPrisma,
        redisClient: mockRedis,
        timeoutMs: 50, // fast timeout for unit test
      });

      expect(report.ready).toBe(false);
      expect(report.checks.database).toBe('unhealthy');
    });

    it('times out if Redis ping hangs beyond timeoutMs', async () => {
      const slowRedis = {
        ping: () => new Promise<string>((resolve) => setTimeout(() => resolve('PONG'), 500)),
      } as any;

      const report = await checkReadiness({
        prismaClient: mockPrisma,
        redisClient: slowRedis,
        timeoutMs: 50,
      });

      expect(report.ready).toBe(false);
      expect(report.checks.redis).toBe('unhealthy');
    });

    it('blocks readiness when database points to protected Neon main branch under isolation check', async () => {
      const protectedUrl =
        'postgresql://neondb_owner:secret@ep-small-frog-123.us-east-2.aws.neon.tech/neondb';

      const report = await checkReadiness({
        prismaClient: mockPrisma,
        redisClient: mockRedis,
        databaseUrl: protectedUrl,
        enforceIsolationCheck: true,
      });

      expect(report.ready).toBe(false);
      expect(report.checks.database).toBe('unhealthy');
      expect(report.errors?.database).toContain('Database isolation failed');
      // Verify SELECT 1 was never even executed against protected main!
      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('does not leak connection strings, passwords, or secrets in report output', async () => {
      const secretUrl =
        'postgresql://super_user:SUPER_SECRET_PASSWORD@ep-small-frog.neon.tech/prod_db';

      const report = await checkReadiness({
        prismaClient: mockPrisma,
        redisClient: mockRedis,
        databaseUrl: secretUrl,
        enforceIsolationCheck: true,
      });

      const serialized = JSON.stringify(report);
      expect(serialized).not.toContain('SUPER_SECRET_PASSWORD');
      expect(serialized).not.toContain('super_user');
      expect(serialized).not.toContain('prod_db');
    });
  });

  describe('getReadinessStatus HTTP Controller', () => {
    it('sends HTTP 200 when system dependencies are healthy', async () => {
      const mockReq = {} as Request;
      let statusCode = 0;
      let jsonPayload: any = null;

      const mockRes = {
        status: vi.fn().mockImplementation((code: number) => {
          statusCode = code;
          return mockRes;
        }),
        json: vi.fn().mockImplementation((payload: any) => {
          jsonPayload = payload;
          return mockRes;
        }),
      } as unknown as Response;

      const mockPrisma = {
        $queryRawUnsafe: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
      };
      const mockRedis = new InMemoryRedisClient();

      const handler = createReadinessHandler({
        prismaClient: mockPrisma,
        redisClient: mockRedis,
      });

      await handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(statusCode).toBe(200);
      expect(jsonPayload.ready).toBe(true);
      expect(jsonPayload.status).toBe('ready');
      expect(jsonPayload.checks.database).toBe('healthy');
      expect(jsonPayload.checks.redis).toBe('healthy');
    });

    it('sends HTTP 503 when any dependency is unhealthy', async () => {
      const mockReq = {} as Request;
      let statusCode = 0;
      let jsonPayload: any = null;

      const mockRes = {
        status: vi.fn().mockImplementation((code: number) => {
          statusCode = code;
          return mockRes;
        }),
        json: vi.fn().mockImplementation((payload: any) => {
          jsonPayload = payload;
          return mockRes;
        }),
      } as unknown as Response;

      const mockPrisma = {
        $queryRawUnsafe: vi.fn().mockRejectedValue(new Error('DB unreachable')),
      };
      const mockRedis = new InMemoryRedisClient();

      const handler = createReadinessHandler({
        prismaClient: mockPrisma,
        redisClient: mockRedis,
      });

      await handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(statusCode).toBe(503);
      expect(jsonPayload.ready).toBe(false);
      expect(jsonPayload.status).toBe('not_ready');
      expect(jsonPayload.checks.database).toBe('unhealthy');
    });
  });
});
