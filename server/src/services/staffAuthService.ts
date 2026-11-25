import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import defaultPrisma from '../db.js';
import { AppError } from '../middleware/errorHandler.js';
import { getRedisClient, IRedisClient, STAFF_LOGIN_RATE_LIMIT_LUA } from './redis/index.js';

const STAFF_ROLES = new Set(['CINEMA_ADMIN', 'SYSTEM_ADMIN']);
const PASSWORD_HASH_PREFIX = 'scrypt';
const PASSWORD_KEY_BYTES = 64;
const PASSWORD_COST = 16384;
const PASSWORD_BLOCK_SIZE = 8;
const PASSWORD_PARALLELIZATION = 1;

export interface StaffAuthConfig {
  enabled: boolean;
  jwtSecret: string;
  issuer: string;
  audience: string;
  ttlSeconds: number;
  loginWindowSeconds: number;
  loginAccountMaxAttempts: number;
  loginSourceMaxAttempts: number;
}

export interface StaffIdentity {
  id: string;
  role: 'CINEMA_ADMIN' | 'SYSTEM_ADMIN';
}

export interface StaffAuthDatabase {
  user: {
    findUnique(args: unknown): Promise<any>;
  };
}

interface StaffTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  ver: number;
  iat: number;
  exp: number;
  jti: string;
}

export class StaffAuthError extends AppError {
  constructor(message: string, statusCode: number, code: string) {
    super(message, statusCode, code);
    this.name = 'StaffAuthError';
  }
}

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function hmac(input: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(input).digest('base64url');
}

function isPlaceholder(value: string): boolean {
  return /placeholder|development|changeme|secret/i.test(value);
}

export function resolveStaffAuthConfig(source: NodeJS.ProcessEnv = process.env): StaffAuthConfig {
  const enabled = ['true', '1'].includes((source.STAFF_AUTH_ENABLED || '').trim().toLowerCase());
  const jwtSecret = source.STAFF_AUTH_JWT_SECRET?.trim() || '';
  const config: StaffAuthConfig = {
    enabled,
    jwtSecret,
    issuer: source.STAFF_AUTH_ISSUER?.trim() || 'matinee-staff-auth',
    audience: source.STAFF_AUTH_AUDIENCE?.trim() || 'matinee-staff-scanner',
    ttlSeconds: Number(source.STAFF_AUTH_TTL_SECONDS || 900),
    loginWindowSeconds: Number(source.STAFF_AUTH_LOGIN_WINDOW_SECONDS || 60),
    loginAccountMaxAttempts: Number(source.STAFF_AUTH_LOGIN_ACCOUNT_MAX_ATTEMPTS || 5),
    loginSourceMaxAttempts: Number(source.STAFF_AUTH_LOGIN_SOURCE_MAX_ATTEMPTS || 20),
  };

  if (
    enabled &&
    (!jwtSecret || Buffer.byteLength(jwtSecret, 'utf8') < 32 || isPlaceholder(jwtSecret) ||
      !config.issuer || !config.audience || !Number.isInteger(config.ttlSeconds) || config.ttlSeconds <= 0 ||
      !Number.isInteger(config.loginWindowSeconds) || config.loginWindowSeconds <= 0 ||
      !Number.isInteger(config.loginAccountMaxAttempts) || config.loginAccountMaxAttempts <= 0 ||
      !Number.isInteger(config.loginSourceMaxAttempts) || config.loginSourceMaxAttempts <= 0)
  ) {
    throw new StaffAuthError('Staff authentication configuration is unavailable.', 503, 'STAFF_AUTH_UNAVAILABLE');
  }

  return config;
}

function derivePasswordKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      PASSWORD_KEY_BYTES,
      { N: PASSWORD_COST, r: PASSWORD_BLOCK_SIZE, p: PASSWORD_PARALLELIZATION, maxmem: 32 * 1024 * 1024 },
      (error, derivedKey) => (error ? reject(error) : resolve(derivedKey))
    );
  });
}

export async function hashStaffPassword(password: string): Promise<string> {
  if (!password || password.length < 12) {
    throw new StaffAuthError('Staff password does not meet minimum requirements.', 400, 'INVALID_CREDENTIALS');
  }
  const salt = crypto.randomBytes(16);
  const derivedKey = await derivePasswordKey(password, salt);
  return `${PASSWORD_HASH_PREFIX}$${PASSWORD_COST}$${PASSWORD_BLOCK_SIZE}$${PASSWORD_PARALLELIZATION}$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
}

async function verifyStaffPassword(password: string, encodedHash: string): Promise<boolean> {
  const parts = encodedHash.split('$');
  if (parts.length !== 6 || parts[0] !== PASSWORD_HASH_PREFIX) return false;
  const [, cost, blockSize, parallelization, saltEncoded, keyEncoded] = parts;
  if (
    Number(cost) !== PASSWORD_COST ||
    Number(blockSize) !== PASSWORD_BLOCK_SIZE ||
    Number(parallelization) !== PASSWORD_PARALLELIZATION
  ) return false;
  try {
    const derivedKey = await derivePasswordKey(password, Buffer.from(saltEncoded, 'base64url'));
    const expected = Buffer.from(keyEncoded, 'base64url');
    return expected.length === derivedKey.length && crypto.timingSafeEqual(expected, derivedKey);
  } catch {
    return false;
  }
}

export function signStaffToken(identity: StaffIdentity, authVersion: number, config: StaffAuthConfig, now = new Date()): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims: StaffTokenClaims = {
    iss: config.issuer,
    aud: config.audience,
    sub: identity.id,
    ver: authVersion,
    iat: issuedAt,
    exp: issuedAt + config.ttlSeconds,
    jti: crypto.randomUUID(),
  };
  const payload = encode(JSON.stringify(claims));
  const input = `${header}.${payload}`;
  return `${input}.${hmac(input, config.jwtSecret)}`;
}

function verifyStaffToken(token: string, config: StaffAuthConfig, now = new Date()): StaffTokenClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new StaffAuthError('Staff authentication token is invalid.', 401, 'STAFF_TOKEN_INVALID');
  let header: { alg?: string; typ?: string };
  let claims: StaffTokenClaims;
  try {
    header = JSON.parse(decode(parts[0])) as { alg?: string; typ?: string };
    claims = JSON.parse(decode(parts[1])) as StaffTokenClaims;
  } catch {
    throw new StaffAuthError('Staff authentication token is invalid.', 401, 'STAFF_TOKEN_INVALID');
  }
  const expected = Buffer.from(hmac(`${parts[0]}.${parts[1]}`, config.jwtSecret));
  const actual = Buffer.from(parts[2]);
  if (
    header.alg !== 'HS256' || header.typ !== 'JWT' || expected.length !== actual.length ||
    !crypto.timingSafeEqual(expected, actual)
  ) throw new StaffAuthError('Staff authentication token is invalid.', 401, 'STAFF_TOKEN_INVALID');

  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (
    claims.iss !== config.issuer || claims.aud !== config.audience || !claims.sub || !Number.isInteger(claims.ver) ||
    !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) || !claims.jti || claims.exp <= nowSeconds ||
    claims.iat > nowSeconds + 60
  ) throw new StaffAuthError('Staff authentication token is expired or invalid.', 401, 'STAFF_TOKEN_INVALID');
  return claims;
}

export class StaffLoginRateLimiter {
  private readonly keys = new Set<string>();

  constructor(private readonly redis: IRedisClient = getRedisClient()) {}

  async allow(email: string, source: string, config: StaffAuthConfig): Promise<boolean> {
    const accountKey = `staff-auth:login:account:${crypto.createHash('sha256').update(email).digest('hex')}`;
    const sourceKey = `staff-auth:login:source:${crypto.createHash('sha256').update(source || 'unknown').digest('hex')}`;
    this.keys.add(accountKey);
    this.keys.add(sourceKey);
    try {
      const result = (await this.redis.eval(
        STAFF_LOGIN_RATE_LIMIT_LUA,
        2,
        accountKey,
        sourceKey,
        config.loginWindowSeconds,
        config.loginAccountMaxAttempts,
        config.loginSourceMaxAttempts
      )) as unknown[];
      return Number(result[0]) === 1;
    } catch {
      throw new StaffAuthError('Staff login rate limiting is unavailable.', 503, 'STAFF_RATE_LIMIT_UNAVAILABLE');
    }
  }

  async reset(): Promise<void> {
    if (this.keys.size > 0) await this.redis.del(...this.keys);
    this.keys.clear();
  }
}

export const staffLoginRateLimiter = new StaffLoginRateLimiter();

export class StaffAuthService {
  constructor(
    private readonly database: StaffAuthDatabase | PrismaClient = defaultPrisma,
    private readonly rateLimiter: StaffLoginRateLimiter = staffLoginRateLimiter
  ) {}

  async login(email: string, password: string, clientKey: string, now = new Date()): Promise<{ token: string; expiresAt: Date; staff: StaffIdentity }> {
    const config = resolveStaffAuthConfig();
    if (!config.enabled) throw new StaffAuthError('Staff authentication is disabled.', 503, 'STAFF_AUTH_DISABLED');
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      throw new StaffAuthError('Invalid staff credentials or too many login attempts.', 401, 'STAFF_LOGIN_FAILED');
    }
    if (!(await this.rateLimiter.allow(normalizedEmail, clientKey, config))) {
      throw new StaffAuthError('Too many staff login attempts. Try again later.', 429, 'STAFF_LOGIN_RATE_LIMITED');
    }
    const user = await (this.database as StaffAuthDatabase).user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, role: true, passwordHash: true, authVersion: true },
    });
    if (!user?.passwordHash || !(await verifyStaffPassword(password, user.passwordHash))) {
      throw new StaffAuthError('Invalid staff credentials or too many login attempts.', 401, 'STAFF_LOGIN_FAILED');
    }
    if (!STAFF_ROLES.has(user.role)) {
      throw new StaffAuthError('Invalid staff credentials or too many login attempts.', 401, 'STAFF_LOGIN_FAILED');
    }
    const staff: StaffIdentity = { id: user.id, role: user.role };
    const token = signStaffToken(staff, user.authVersion, config, now);
    return { token, expiresAt: new Date((Math.floor(now.getTime() / 1000) + config.ttlSeconds) * 1000), staff };
  }

  async authenticate(token: string, now = new Date()): Promise<StaffIdentity> {
    const config = resolveStaffAuthConfig();
    if (!config.enabled) throw new StaffAuthError('Staff authentication is disabled.', 503, 'STAFF_AUTH_DISABLED');
    const claims = verifyStaffToken(token, config, now);
    const user = await (this.database as StaffAuthDatabase).user.findUnique({
      where: { id: claims.sub },
      select: { id: true, role: true, authVersion: true },
    });
    if (!user || user.authVersion !== claims.ver) {
      throw new StaffAuthError('Staff authentication token is invalid.', 401, 'STAFF_TOKEN_INVALID');
    }
    if (!STAFF_ROLES.has(user.role)) {
      throw new StaffAuthError('Account is not authorized for staff tools.', 403, 'STAFF_FORBIDDEN');
    }
    return { id: user.id, role: user.role };
  }
}

export const staffAuthService = new StaffAuthService();
