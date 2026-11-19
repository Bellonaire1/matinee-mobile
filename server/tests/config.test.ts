import { describe, it, expect } from 'vitest';
import { envSchema, parseEnv } from '../src/config/env.js';

describe('Environment Configuration Validation', () => {
  it('parses valid environment variables with correct defaults', () => {
    const raw = {
      NODE_ENV: 'test',
      PORT: '5000',
      DATABASE_URL: 'postgresql://usr:pwd@localhost:5432/testdb?schema=public',
    };

    const parsed = parseEnv(raw);
    expect(parsed.NODE_ENV).toBe('test');
    expect(parsed.PORT).toBe(5000);
    expect(parsed.DATABASE_URL).toBe('postgresql://usr:pwd@localhost:5432/testdb?schema=public');
    expect(parsed.API_PREFIX).toBe('/api/v1');
    expect(parsed.CORS_ORIGIN).toBe('http://localhost:3000,http://localhost:8081');
  });

  it('rejects invalid PORT value', () => {
    const raw = {
      PORT: 'not-a-number',
    };

    const result = envSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects invalid DATABASE_URL', () => {
    const raw = {
      DATABASE_URL: 'invalid-url-without-protocol',
    };

    const result = envSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('applies default port 4000 when PORT is omitted', () => {
    const result = envSchema.parse({});
    expect(result.PORT).toBe(4000);
  });
});

