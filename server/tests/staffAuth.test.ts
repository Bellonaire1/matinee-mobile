import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { testRequest } from './helpers/testRequest.js';
import {
  hashStaffPassword,
  resolveStaffAuthConfig,
  signStaffToken,
  StaffLoginRateLimiter,
  StaffAuthService,
  staffLoginRateLimiter,
} from '../src/services/staffAuthService.js';
import { FailingRedisClient, InMemoryRedisClient } from '../src/services/redis/index.js';

const now = new Date('2026-11-25T12:00:00.000Z');
const secret = 'staff-auth-signing-key-that-is-at-least-32-bytes-long';
const configSource = {
  STAFF_AUTH_ENABLED: 'true',
  STAFF_AUTH_JWT_SECRET: secret,
  STAFF_AUTH_ISSUER: 'matinee-staff-auth',
  STAFF_AUTH_AUDIENCE: 'matinee-staff-scanner',
  STAFF_AUTH_TTL_SECONDS: '900',
  STAFF_AUTH_LOGIN_WINDOW_SECONDS: '60',
  STAFF_AUTH_LOGIN_ACCOUNT_MAX_ATTEMPTS: '5',
  STAFF_AUTH_LOGIN_SOURCE_MAX_ATTEMPTS: '20',
};

function makeDatabase(user: any): any {
  return { user: { findUnique: async () => user } };
}

describe('M05.19 staff authentication boundary', () => {
  let passwordHash: string;

  beforeEach(async () => {
    process.env.STAFF_AUTH_ENABLED = 'true';
    process.env.STAFF_AUTH_JWT_SECRET = secret;
    process.env.STAFF_AUTH_ISSUER = configSource.STAFF_AUTH_ISSUER;
    process.env.STAFF_AUTH_AUDIENCE = configSource.STAFF_AUTH_AUDIENCE;
    process.env.STAFF_AUTH_TTL_SECONDS = configSource.STAFF_AUTH_TTL_SECONDS;
    process.env.STAFF_AUTH_LOGIN_WINDOW_SECONDS = configSource.STAFF_AUTH_LOGIN_WINDOW_SECONDS;
    process.env.STAFF_AUTH_LOGIN_ACCOUNT_MAX_ATTEMPTS = configSource.STAFF_AUTH_LOGIN_ACCOUNT_MAX_ATTEMPTS;
    process.env.STAFF_AUTH_LOGIN_SOURCE_MAX_ATTEMPTS = configSource.STAFF_AUTH_LOGIN_SOURCE_MAX_ATTEMPTS;
    await staffLoginRateLimiter.reset();
    passwordHash ||= await hashStaffPassword('correct horse battery staple');
  });

  afterAll(() => {
    delete process.env.STAFF_AUTH_ENABLED;
    delete process.env.STAFF_AUTH_JWT_SECRET;
    delete process.env.STAFF_AUTH_LOGIN_ACCOUNT_MAX_ATTEMPTS;
    delete process.env.STAFF_AUTH_LOGIN_SOURCE_MAX_ATTEMPTS;
  });

  it('authenticates a staff account with a scrypt password hash and short-lived token', async () => {
    const service = new StaffAuthService(makeDatabase({
      id: 'staff-1', role: 'CINEMA_ADMIN', passwordHash, authVersion: 1,
    }));
    const result = await service.login('STAFF@EXAMPLE.COM', 'correct horse battery staple', 'test-ip', now);
    expect(result.staff).toEqual({ id: 'staff-1', role: 'CINEMA_ADMIN' });
    expect((await service.authenticate(result.token, now)).id).toBe('staff-1');
    expect(result.expiresAt.getTime()).toBe(now.getTime() + 900000);
  });

  it('rejects missing, malformed, tampered, and expired tokens', async () => {
    const service = new StaffAuthService(makeDatabase({ id: 'staff-1', role: 'SYSTEM_ADMIN', authVersion: 1 }));
    await expect(service.authenticate('')).rejects.toMatchObject({ code: 'STAFF_TOKEN_INVALID' });
    await expect(service.authenticate('not-a-jwt')).rejects.toMatchObject({ code: 'STAFF_TOKEN_INVALID' });
    const config = resolveStaffAuthConfig(configSource);
    const token = signStaffToken({ id: 'staff-1', role: 'SYSTEM_ADMIN' }, 1, config, now);
    await expect(service.authenticate(`${token.slice(0, -1)}x`, now)).rejects.toMatchObject({ code: 'STAFF_TOKEN_INVALID' });
    const expired = signStaffToken(
      { id: 'staff-1', role: 'SYSTEM_ADMIN' },
      1,
      { ...config, ttlSeconds: 1 },
      new Date(now.getTime() - 10000)
    );
    await expect(service.authenticate(expired, now)).rejects.toMatchObject({ code: 'STAFF_TOKEN_INVALID' });
  });

  it('rejects customer accounts and rechecks the current database role', async () => {
    const user = { id: 'user-1', role: 'CUSTOMER', passwordHash, authVersion: 1 };
    const customerService = new StaffAuthService(makeDatabase(user));
    await expect(customerService.login('customer@example.com', 'correct horse battery staple', 'ip', now)).rejects.toMatchObject({
      code: 'STAFF_LOGIN_FAILED',
    });

    user.role = 'CINEMA_ADMIN';
    const result = await customerService.login('customer@example.com', 'correct horse battery staple', 'ip-2', now);
    user.role = 'CUSTOMER';
    await expect(customerService.authenticate(result.token, now)).rejects.toMatchObject({ code: 'STAFF_FORBIDDEN' });
  });

  it('uses atomic account/source counters, expires the window, and fails closed when Redis is unavailable', async () => {
    const redis = new InMemoryRedisClient();
    const rateLimiter = new StaffLoginRateLimiter(redis);
    const config = { ...resolveStaffAuthConfig(configSource), loginWindowSeconds: 1, loginAccountMaxAttempts: 5, loginSourceMaxAttempts: 20 };

    vi.useFakeTimers();
    try {
      const results = await Promise.all(
        Array.from({ length: 10 }, () => rateLimiter.allow('same-account@example.com', 'same-source', config))
      );
      expect(results.filter(Boolean)).toHaveLength(5);
      expect(results.filter((allowed) => !allowed)).toHaveLength(5);
      vi.advanceTimersByTime(1001);
      await expect(rateLimiter.allow('same-account@example.com', 'same-source', config)).resolves.toBe(true);
    } finally {
      vi.useRealTimers();
    }

    const unavailable = new StaffLoginRateLimiter(new FailingRedisClient());
    await expect(unavailable.allow('account@example.com', 'source', config)).rejects.toMatchObject({
      code: 'STAFF_RATE_LIMIT_UNAVAILABLE',
      statusCode: 503,
    });
  });

  it('rejects invalid credentials and applies login attempt throttling', async () => {
    const service = new StaffAuthService(makeDatabase({
      id: 'staff-1', role: 'CINEMA_ADMIN', passwordHash, authVersion: 1,
    }));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(service.login('staff@example.com', 'wrong password', 'same-ip', now)).rejects.toMatchObject({
        code: 'STAFF_LOGIN_FAILED',
      });
    }
    await expect(service.login('staff@example.com', 'correct horse battery staple', 'same-ip', now)).rejects.toMatchObject({
      code: 'STAFF_LOGIN_RATE_LIMITED',
      statusCode: 429,
    });
  });

  it('fails closed when enabled configuration is missing and keeps scanner routes disabled by default', async () => {
    expect(() => resolveStaffAuthConfig({ STAFF_AUTH_ENABLED: 'true' })).toThrowError(
      expect.objectContaining({ code: 'STAFF_AUTH_UNAVAILABLE' })
    );
    const unauthorized = await testRequest(app, {
      method: 'POST',
      url: '/api/v1/tickets/check-in',
      body: { token: 'not-used' },
    });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body.code).toBe('STAFF_AUTH_REQUIRED');

    process.env.STAFF_AUTH_ENABLED = 'false';
    delete process.env.STAFF_AUTH_JWT_SECRET;
    const response = await testRequest(app, {
      method: 'POST',
      url: '/api/v1/tickets/check-in',
      body: { token: 'not-used' },
    });
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('STAFF_AUTH_DISABLED');
  });
});
