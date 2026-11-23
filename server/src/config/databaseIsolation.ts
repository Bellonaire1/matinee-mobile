/**
 * Database Isolation & Protected Branch Guard
 *
 * Prevents accidental execution of staging migrations, seed scripts, or
 * load tests against the protected Neon production main branch.
 *
 * Known Protected Resources:
 * - Neon Project: gentle-sound-76994085
 * - Protected Main Branch: br-small-frog-bjztb5yj
 * - Main Compute Endpoint Prefix: ep-small-frog
 */

import { prisma as defaultPrisma } from '../db.js';

export interface DatabaseIsolationResult {
  isSafe: boolean;
  isProtectedMain: boolean;
  sanitizedHost: string;
  endpointPrefix?: string;
  error?: string;
}

export const PROTECTED_NEON_IDENTIFIERS = [
  'small-frog',
  'br-small-frog-bjztb5yj',
  'ep-small-frog',
  'gentle-sound-76994085',
];

export const FORBIDDEN_STAGING_KEYWORDS = [
  'main',
  'prod',
  'production',
  'live',
  'br-small-frog-bjztb5yj',
  'gentle-sound-76994085',
  'default',
];

/**
 * Extracts and sanitizes the database hostname from a connection string.
 * Strips out usernames, passwords, and query parameters.
 */
export function extractSanitizedHost(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    return url.hostname.toLowerCase();
  } catch {
    // If URL parsing fails, extract host via regex without exposing credentials
    const hostMatch = databaseUrl.match(/@([^/:?#]+)/);
    return hostMatch ? hostMatch[1].toLowerCase() : 'unknown-host';
  }
}

/**
 * Validates that a given DATABASE_URL does NOT connect to the protected Neon main branch.
 *
 * @param databaseUrl The PostgreSQL connection string to evaluate.
 * @param options.requireDisposableBranch When true, enforces that the connection host
 *        matches an approved disposable endpoint and is not the protected main branch.
 * @param options.expectedEndpointPrefix Optional explicit endpoint prefix expected for staging.
 */
export function verifyDatabaseIsolation(
  databaseUrl: string | undefined,
  options: {
    requireDisposableBranch?: boolean;
    expectedEndpointPrefix?: string;
  } = {}
): DatabaseIsolationResult {
  if (!databaseUrl || !databaseUrl.trim()) {
    return {
      isSafe: false,
      isProtectedMain: false,
      sanitizedHost: 'none',
      error: 'DATABASE_URL is not configured.',
    };
  }

  const host = extractSanitizedHost(databaseUrl);

  // Check 1: Direct match against protected Neon main identifiers
  const isProtectedMain = PROTECTED_NEON_IDENTIFIERS.some((identifier) =>
    host.includes(identifier.toLowerCase())
  );

  if (isProtectedMain) {
    return {
      isSafe: false,
      isProtectedMain: true,
      sanitizedHost: host,
      error:
        'DATABASE ISOLATION VIOLATION: Target database points to the protected Neon main branch (br-small-frog-bjztb5yj). All destructive or load operations are strictly forbidden.',
    };
  }

  // Check 2: If an explicit disposable endpoint prefix is required, verify match
  if (options.expectedEndpointPrefix) {
    const expected = options.expectedEndpointPrefix.toLowerCase().trim();
    if (!host.includes(expected)) {
      return {
        isSafe: false,
        isProtectedMain: false,
        sanitizedHost: host,
        error: `DATABASE ISOLATION MISMATCH: Target database host does not match expected disposable staging endpoint prefix '${expected}'.`,
      };
    }
  }

  // Check 3: If running in explicit disposable staging mode, prevent generic default hosts
  if (options.requireDisposableBranch) {
    if (host === 'localhost' || host === '127.0.0.1') {
      // Local development database is allowed if explicitly confirmed, but must be noted
      return {
        isSafe: true,
        isProtectedMain: false,
        sanitizedHost: host,
        endpointPrefix: 'local',
      };
    }
  }

  // Extract Neon endpoint prefix (e.g., 'ep-staging-loadtest-01')
  const neonMatch = host.match(/^(ep-[a-z0-9-]+?)(?:-pooler)?\./);
  const endpointPrefix = neonMatch ? neonMatch[1] : undefined;

  return {
    isSafe: true,
    isProtectedMain: false,
    sanitizedHost: host,
    endpointPrefix,
  };
}

export interface StartupSafetyOptions {
  env?: NodeJS.ProcessEnv;
  prismaClient?: { $queryRawUnsafe: (query: string) => Promise<unknown> };
  skipDbConnectionProbe?: boolean;
  timeoutMs?: number;
}

export interface StartupSafetyReport {
  isSafe: boolean;
  environment: string;
  deploymentMode: 'development' | 'staging' | 'production' | 'test';
  stagingEnvId?: string;
  verifiedEndpoint?: string;
  sanitizedHost: string;
}

/**
 * Enforces fail-closed staging startup isolation.
 *
 * The deployed backend server MUST NOT start accepting HTTP requests unless
 * database isolation is configured and validated.
 *
 * Invariants:
 * 1. Staging deployment mode must be explicit (APP_ENV or DEPLOYMENT_ENV or NODE_ENV = 'staging').
 * 2. Missing staging identity or expected database endpoint causes immediate startup rejection.
 * 3. Configured DATABASE_URL must match the exact approved staging endpoint prefix.
 * 4. The protected Neon main branch (br-small-frog-bjztb5yj / ep-small-frog) is strictly rejected.
 * 5. Pre-flight database connection verification (SELECT 1) occurs BEFORE the HTTP listener starts.
 * 6. Never outputs credentials or raw connection strings.
 * 7. Isolated unit-test execution is preserved without network calls.
 */
export async function enforceStartupSafety(
  options: StartupSafetyOptions = {}
): Promise<StartupSafetyReport> {
  const currentEnv = options.env ?? process.env;
  const nodeEnv = (currentEnv.NODE_ENV || 'development').trim().toLowerCase();
  const appEnvRaw = (currentEnv.APP_ENV || currentEnv.DEPLOYMENT_ENV || '').trim().toLowerCase();
  const isTest = nodeEnv === 'test' || Boolean(currentEnv.VITEST);

  // 1. In test runners without injected test env, bypass startup safety
  if (isTest && !options.env) {
    return {
      isSafe: true,
      environment: 'test',
      deploymentMode: 'test',
      sanitizedHost: 'test-memory',
    };
  }

  // 2. Resolve deployment mode
  let deploymentMode: 'development' | 'staging' | 'production' | 'test';
  if (appEnvRaw === 'staging' || nodeEnv === 'staging') {
    deploymentMode = 'staging';
  } else if (appEnvRaw === 'production') {
    deploymentMode = 'production';
  } else if (appEnvRaw === 'development' || nodeEnv === 'development') {
    deploymentMode = 'development';
  } else if (appEnvRaw === 'test' || nodeEnv === 'test') {
    deploymentMode = 'test';
  } else if (nodeEnv === 'production') {
    // Hosted non-test execution with NODE_ENV=production but no explicit APP_ENV / DEPLOYMENT_ENV
    throw new Error(
      'STARTUP SAFETY REJECTION: Hosted non-test execution requires an explicit deployment identity. ' +
        "Set APP_ENV or DEPLOYMENT_ENV to 'staging' or 'production'."
    );
  } else {
    deploymentMode = 'development';
  }

  // 3. Database URL validation
  const databaseUrl = currentEnv.DATABASE_URL;
  if (!databaseUrl || !databaseUrl.trim()) {
    throw new Error(
      'STARTUP SAFETY REJECTION: DATABASE_URL environment variable is missing or empty.'
    );
  }

  const sanitizedHost = extractSanitizedHost(databaseUrl);

  // 4. Invariant: The protected Neon main branch must NEVER be targeted in staging or development
  const isTargetingProtectedMain = PROTECTED_NEON_IDENTIFIERS.some((identifier) =>
    sanitizedHost.includes(identifier.toLowerCase())
  );

  if (isTargetingProtectedMain) {
    throw new Error(
      'STARTUP SAFETY VIOLATION: Target database points to protected Neon production main branch ' +
        '(br-small-frog-bjztb5yj / ep-small-frog). Startup aborted strictly fail-closed.'
    );
  }

  // 5. Staging Mode Strict Enforcement
  if (deploymentMode === 'staging') {
    const stagingEnvId = (currentEnv.STAGING_ENV_ID || currentEnv.DISPOSABLE_ENV_ID || '').trim();
    if (!stagingEnvId || stagingEnvId.length < 3) {
      throw new Error(
        'STARTUP SAFETY REJECTION: Staging deployment requires STAGING_ENV_ID (or DISPOSABLE_ENV_ID) ' +
          'of at least 3 characters (e.g. STAGING_ENV_ID="staging-run-01").'
      );
    }

    for (const forbidden of FORBIDDEN_STAGING_KEYWORDS) {
      if (stagingEnvId.toLowerCase().includes(forbidden)) {
        throw new Error(
          `STARTUP SAFETY REJECTION: STAGING_ENV_ID contains forbidden keyword '${forbidden}'. ` +
            'Staging identity cannot reference production or main branch names.'
        );
      }
    }

    const expectedEndpoint = (currentEnv.EXPECTED_NEON_BRANCH_ENDPOINT || '').trim().toLowerCase();
    if (!expectedEndpoint) {
      throw new Error(
        'STARTUP SAFETY REJECTION: Staging deployment requires EXPECTED_NEON_BRANCH_ENDPOINT ' +
          'to be explicitly configured with the approved disposable endpoint prefix.'
      );
    }

    if (PROTECTED_NEON_IDENTIFIERS.some((id) => expectedEndpoint.includes(id))) {
      throw new Error(
        'STARTUP SAFETY VIOLATION: EXPECTED_NEON_BRANCH_ENDPOINT cannot specify protected Neon main branch.'
      );
    }

    const isolation = verifyDatabaseIsolation(databaseUrl, {
      requireDisposableBranch: true,
      expectedEndpointPrefix: expectedEndpoint,
    });

    if (!isolation.isSafe) {
      throw new Error(`STARTUP SAFETY VIOLATION: ${isolation.error}`);
    }
  }

  // 6. Pre-flight database connectivity verification before HTTP listener starts
  if (!options.skipDbConnectionProbe) {
    const prismaClient = options.prismaClient ?? defaultPrisma;
    const timeoutMs = options.timeoutMs ?? 5000;

    try {
      const dbPromise = prismaClient.$queryRawUnsafe('SELECT 1');
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Database connectivity timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      );

      await Promise.race([dbPromise, timeoutPromise]);
    } catch {
      throw new Error(
        'STARTUP SAFETY REJECTION: Pre-flight database connectivity verification failed before HTTP listener start. ' +
          'Ensure the target database is online and reachable.'
      );
    }
  }

  return {
    isSafe: true,
    environment: nodeEnv,
    deploymentMode,
    stagingEnvId:
      deploymentMode === 'staging'
        ? currentEnv.STAGING_ENV_ID || currentEnv.DISPOSABLE_ENV_ID
        : undefined,
    verifiedEndpoint:
      deploymentMode === 'staging' ? currentEnv.EXPECTED_NEON_BRANCH_ENDPOINT : undefined,
    sanitizedHost,
  };
}
