import { describe, it, expect, vi } from 'vitest';
import {
  enforceStartupSafety,
  PROTECTED_NEON_IDENTIFIERS,
} from '../src/config/databaseIsolation.js';

describe('Enforceable Startup Database Isolation Gate', () => {
  const validMockPrisma = {
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  };

  describe('Staging Deployment Safety Enforcement', () => {
    it('permits startup when staging configuration is fully verified and database probe succeeds', async () => {
      const mockEnv: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        STAGING_ENV_ID: 'staging-run-01',
        EXPECTED_NEON_BRANCH_ENDPOINT: 'ep-disposable-staging-987654',
        DATABASE_URL:
          'postgresql://user:secret@ep-disposable-staging-987654.us-east-2.aws.neon.tech/neondb?sslmode=require',
      };

      const result = await enforceStartupSafety({
        env: mockEnv,
        prismaClient: validMockPrisma,
      });

      expect(result.isSafe).toBe(true);
      expect(result.deploymentMode).toBe('staging');
      expect(result.stagingEnvId).toBe('staging-run-01');
      expect(result.verifiedEndpoint).toBe('ep-disposable-staging-987654');
      expect(result.sanitizedHost).toBe('ep-disposable-staging-987654.us-east-2.aws.neon.tech');
    });

    it('blocks startup when STAGING_ENV_ID is missing or too short', async () => {
      const mockEnv: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        STAGING_ENV_ID: '', // Missing
        EXPECTED_NEON_BRANCH_ENDPOINT: 'ep-disposable-staging-987654',
        DATABASE_URL:
          'postgresql://user:secret@ep-disposable-staging-987654.us-east-2.aws.neon.tech/neondb',
      };

      await expect(
        enforceStartupSafety({
          env: mockEnv,
          prismaClient: validMockPrisma,
        })
      ).rejects.toThrow('STAGING_ENV_ID (or DISPOSABLE_ENV_ID) of at least 3 characters');
    });

    it('blocks startup when STAGING_ENV_ID contains forbidden keywords (e.g. production/main)', async () => {
      const forbiddenSamples = [
        'staging-prod-test',
        'staging-main-branch',
        'staging-live-run',
        'default-staging',
      ];

      for (const sample of forbiddenSamples) {
        const mockEnv: NodeJS.ProcessEnv = {
          NODE_ENV: 'production',
          APP_ENV: 'staging',
          STAGING_ENV_ID: sample,
          EXPECTED_NEON_BRANCH_ENDPOINT: 'ep-disposable-staging-987654',
          DATABASE_URL:
            'postgresql://user:secret@ep-disposable-staging-987654.us-east-2.aws.neon.tech/neondb',
        };

        await expect(
          enforceStartupSafety({
            env: mockEnv,
            prismaClient: validMockPrisma,
          })
        ).rejects.toThrow('contains forbidden keyword');
      }
    });

    it('blocks startup when EXPECTED_NEON_BRANCH_ENDPOINT is missing in staging', async () => {
      const mockEnv: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        STAGING_ENV_ID: 'staging-run-01',
        DATABASE_URL:
          'postgresql://user:secret@ep-disposable-staging-987654.us-east-2.aws.neon.tech/neondb',
      };

      await expect(
        enforceStartupSafety({
          env: mockEnv,
          prismaClient: validMockPrisma,
        })
      ).rejects.toThrow('requires EXPECTED_NEON_BRANCH_ENDPOINT to be explicitly configured');
    });

    it('blocks startup when EXPECTED_NEON_BRANCH_ENDPOINT specifies protected Neon main identifiers', async () => {
      for (const id of PROTECTED_NEON_IDENTIFIERS) {
        const mockEnv: NodeJS.ProcessEnv = {
          NODE_ENV: 'production',
          APP_ENV: 'staging',
          STAGING_ENV_ID: 'staging-run-01',
          EXPECTED_NEON_BRANCH_ENDPOINT: id,
          DATABASE_URL: `postgresql://user:secret@${id}.aws.neon.tech/neondb`,
        };

        await expect(
          enforceStartupSafety({
            env: mockEnv,
            prismaClient: validMockPrisma,
          })
        ).rejects.toThrow();
      }
    });

    it('blocks startup when DATABASE_URL targets protected Neon main branch', async () => {
      const mockEnv: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        STAGING_ENV_ID: 'staging-run-01',
        EXPECTED_NEON_BRANCH_ENDPOINT: 'ep-disposable-staging-987654',
        DATABASE_URL:
          'postgresql://user:secret@ep-small-frog-12345.us-east-2.aws.neon.tech/neondb',
      };

      await expect(
        enforceStartupSafety({
          env: mockEnv,
          prismaClient: validMockPrisma,
        })
      ).rejects.toThrow('Target database points to protected Neon production main branch');
    });

    it('blocks startup on endpoint mismatch between DATABASE_URL and EXPECTED_NEON_BRANCH_ENDPOINT', async () => {
      const mockEnv: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        STAGING_ENV_ID: 'staging-run-01',
        EXPECTED_NEON_BRANCH_ENDPOINT: 'ep-disposable-staging-987654',
        DATABASE_URL:
          'postgresql://user:secret@ep-other-branch-111111.us-east-2.aws.neon.tech/neondb',
      };

      await expect(
        enforceStartupSafety({
          env: mockEnv,
          prismaClient: validMockPrisma,
        })
      ).rejects.toThrow('DATABASE ISOLATION MISMATCH');
    });

    it('blocks startup when DATABASE_URL is missing or empty', async () => {
      const mockEnv: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        STAGING_ENV_ID: 'staging-run-01',
        EXPECTED_NEON_BRANCH_ENDPOINT: 'ep-disposable-staging-987654',
        DATABASE_URL: '',
      };

      await expect(
        enforceStartupSafety({
          env: mockEnv,
          prismaClient: validMockPrisma,
        })
      ).rejects.toThrow('DATABASE_URL environment variable is missing or empty');
    });

    it('blocks startup when pre-flight database connection probe fails', async () => {
      const failingMockPrisma = {
        $queryRawUnsafe: vi.fn().mockRejectedValue(new Error('Connection terminated by host')),
      };

      const mockEnv: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        STAGING_ENV_ID: 'staging-run-01',
        EXPECTED_NEON_BRANCH_ENDPOINT: 'ep-disposable-staging-987654',
        DATABASE_URL:
          'postgresql://user:secret@ep-disposable-staging-987654.us-east-2.aws.neon.tech/neondb',
      };

      await expect(
        enforceStartupSafety({
          env: mockEnv,
          prismaClient: failingMockPrisma,
        })
      ).rejects.toThrow('Pre-flight database connectivity verification failed before HTTP listener start');
    });

    it('blocks startup when pre-flight database connection probe times out', async () => {
      const slowMockPrisma = {
        $queryRawUnsafe: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 500))
        ),
      };

      const mockEnv: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        STAGING_ENV_ID: 'staging-run-01',
        EXPECTED_NEON_BRANCH_ENDPOINT: 'ep-disposable-staging-987654',
        DATABASE_URL:
          'postgresql://user:secret@ep-disposable-staging-987654.us-east-2.aws.neon.tech/neondb',
      };

      await expect(
        enforceStartupSafety({
          env: mockEnv,
          prismaClient: slowMockPrisma,
          timeoutMs: 50,
        })
      ).rejects.toThrow('Pre-flight database connectivity verification failed before HTTP listener start');
    });
  });

  describe('Hosted Non-Test Execution & Local Development', () => {
    it('blocks startup in hosted production when explicit deployment identity is missing', async () => {
      const mockEnv: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        // Neither APP_ENV nor DEPLOYMENT_ENV is set
        DATABASE_URL: 'postgresql://user:secret@ep-custom-prod.aws.neon.tech/neondb',
      };

      await expect(
        enforceStartupSafety({
          env: mockEnv,
          prismaClient: validMockPrisma,
        })
      ).rejects.toThrow('Hosted non-test execution requires an explicit deployment identity');
    });

    it('allows local development to localhost database without requiring staging endpoint', async () => {
      const mockEnv: NodeJS.ProcessEnv = {
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/matinee_db',
      };

      const result = await enforceStartupSafety({
        env: mockEnv,
        prismaClient: validMockPrisma,
      });

      expect(result.isSafe).toBe(true);
      expect(result.deploymentMode).toBe('development');
      expect(result.sanitizedHost).toBe('localhost');
    });

    it('blocks local development if DATABASE_URL mistakenly points to protected Neon main', async () => {
      const mockEnv: NodeJS.ProcessEnv = {
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:secret@ep-small-frog.aws.neon.tech/matinee_db',
      };

      await expect(
        enforceStartupSafety({
          env: mockEnv,
          prismaClient: validMockPrisma,
        })
      ).rejects.toThrow('Target database points to protected Neon production main branch');
    });

    it('strictly guarantees sensitive credentials and passwords are never exposed in error messages', async () => {
      const mockEnv: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        STAGING_ENV_ID: 'staging-run-01',
        EXPECTED_NEON_BRANCH_ENDPOINT: 'ep-other-expected',
        DATABASE_URL:
          'postgresql://super_admin:SUPER_SECRET_UNLEAKABLE_TOKEN_999@ep-small-frog.aws.neon.tech/secret_prod_db',
      };

      try {
        await enforceStartupSafety({
          env: mockEnv,
          prismaClient: validMockPrisma,
        })
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err.message).not.toContain('SUPER_SECRET_UNLEAKABLE_TOKEN_999');
        expect(err.message).not.toContain('super_admin');
        expect(err.message).not.toContain('secret_prod_db');
      }
    });
  });
});
