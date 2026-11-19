import { describe, it, expect } from 'vitest';
import {
  validateSeedEnvironment,
  AUTHORIZED_DEV_ENDPOINT,
  AUTHORIZED_DEV_DATABASE,
} from '../prisma/seed.js';

describe('Seed Safety & Environment Guards', () => {
  const authorizedDevUrl = `postgresql://user:pass@${AUTHORIZED_DEV_ENDPOINT}.aws-eu-west-2.neon.tech/${AUTHORIZED_DEV_DATABASE}?sslmode=require`;

  it('rejects execution when DATABASE_URL is missing or empty', () => {
    const res = validateSeedEnvironment('', { NODE_ENV: 'development' });
    expect(res.allowed).toBe(false);
    expect(res.error).toContain('DATABASE_URL environment variable is not defined');
  });

  it('rejects execution in production when ALLOW_PRODUCTION_SEED is "false"', () => {
    const res = validateSeedEnvironment(authorizedDevUrl, {
      NODE_ENV: 'production',
      ALLOW_PRODUCTION_SEED: 'false',
      CONFIRM_MATINEE_DEV_SEED: 'true',
    });
    expect(res.allowed).toBe(false);
    expect(res.error).toContain('Strict override ALLOW_PRODUCTION_SEED=true is required');
  });

  it('strictly rejects any DATABASE_URL containing blacklisted keyword "rota"', () => {
    const dangerousUrl = 'postgresql://user:pass@ep-other-123.neon.tech/rota_production?sslmode=require';
    const res = validateSeedEnvironment(dangerousUrl, {
      NODE_ENV: 'development',
      CONFIRM_MATINEE_DEV_SEED: 'true',
    });
    expect(res.allowed).toBe(false);
    expect(res.error).toContain("prohibited system keyword 'rota'");
  });

  it('strictly rejects any DATABASE_URL containing blacklisted keyword "taibell"', () => {
    const dangerousUrl = 'postgresql://user:pass@ep-other-456.neon.tech/taibell_dev?sslmode=require';
    const res = validateSeedEnvironment(dangerousUrl, {
      NODE_ENV: 'development',
      CONFIRM_MATINEE_DEV_SEED: 'true',
    });
    expect(res.allowed).toBe(false);
    expect(res.error).toContain("prohibited system keyword 'taibell'");
  });

  it('rejects an unauthorized remote host or unexpected database name', () => {
    const foreignUrl = 'postgresql://user:pass@ep-foreign-999.neon.tech/unknown_db?sslmode=require';
    const res = validateSeedEnvironment(foreignUrl, {
      NODE_ENV: 'development',
      CONFIRM_MATINEE_DEV_SEED: 'true',
    });
    expect(res.allowed).toBe(false);
    expect(res.error).toContain('points to an unauthorized remote host');
  });

  it('requires explicit CONFIRM_MATINEE_DEV_SEED=true for remote Matinee dev database', () => {
    const res = validateSeedEnvironment(authorizedDevUrl, {
      NODE_ENV: 'development',
      CONFIRM_MATINEE_DEV_SEED: 'false',
    });
    expect(res.allowed).toBe(false);
    expect(res.error).toContain('CONFIRM_MATINEE_DEV_SEED=true');
  });

  it('approves execution for authorized Matinee dev database with explicit confirmation', () => {
    const res = validateSeedEnvironment(authorizedDevUrl, {
      NODE_ENV: 'development',
      CONFIRM_MATINEE_DEV_SEED: 'true',
    });
    expect(res.allowed).toBe(true);
    expect(res.targetType).toBe('MATINEE_DEV');
  });

  it('approves execution for local development database (localhost / 127.0.0.1)', () => {
    const localUrl = 'postgresql://postgres:postgres@localhost:5432/matinee_local';
    const res = validateSeedEnvironment(localUrl, {
      NODE_ENV: 'development',
    });
    expect(res.allowed).toBe(true);
    expect(res.targetType).toBe('LOCAL');
  });
});
