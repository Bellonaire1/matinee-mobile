import { IRedisClient } from './redisInterface.js';
import { AppError } from '../../middleware/errorHandler.js';

/**
 * Fail-Closed Redis client for production safety.
 *
 * If REDIS_URL is not configured in production or staging, this client guarantees
 * that all seat hold operations fail closed with 503 Service Unavailable, preventing
 * accidental in-memory state in multi-instance production environments.
 */
export class FailingRedisClient implements IRedisClient {
  private reason: string;

  constructor(reason = 'Redis connection is not configured or unavailable.') {
    this.reason = reason;
  }

  private throwError(): never {
    throw new AppError(
      `Seat hold service is temporarily unavailable. ${this.reason}`,
      503,
      'HOLD_SERVICE_UNAVAILABLE'
    );
  }

  async isHealthy(): Promise<boolean> {
    return false;
  }

  async ping(): Promise<string> {
    this.throwError();
  }

  async get(_key: string): Promise<string | null> {
    this.throwError();
  }

  async set(
    _key: string,
    _value: string,
    _mode?: 'EX' | 'PX',
    _duration?: number,
    _flag?: 'NX' | 'XX'
  ): Promise<'OK' | null> {
    this.throwError();
  }

  async del(..._keys: string[]): Promise<number> {
    this.throwError();
  }

  async ttl(_key: string): Promise<number> {
    this.throwError();
  }

  async eval(
    _script: string,
    _numKeys: number,
    ..._args: (string | number)[]
  ): Promise<unknown> {
    this.throwError();
  }
}
