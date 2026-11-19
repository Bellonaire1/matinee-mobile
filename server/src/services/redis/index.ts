import { IRedisClient } from './redisInterface.js';
import { InMemoryRedisClient } from './inMemoryRedisClient.js';
import { IoRedisClient } from './ioredisClient.js';
import { FailingRedisClient } from './failingRedisClient.js';

export * from './redisInterface.js';
export * from './inMemoryRedisClient.js';
export * from './ioredisClient.js';
export * from './failingRedisClient.js';
export * from './luaScripts.js';

let redisInstance: IRedisClient | null = null;

/**
 * Resolves the active Redis client with strict production fail-closed semantics:
 * 1. If an explicit client has been injected (e.g. for testing via setRedisClient), return it.
 * 2. In unit test runners (NODE_ENV=test or VITEST), allow InMemoryRedisClient if USE_REAL_REDIS is not set.
 * 3. In all other environments (production, staging, dev runtime), if REDIS_URL is absent or invalid,
 *    return a FailingRedisClient that strictly rejects hold operations with 503 HOLD_SERVICE_UNAVAILABLE.
 */
export function getRedisClient(): IRedisClient {
  if (redisInstance) {
    return redisInstance;
  }

  const isTestEnvironment =
    process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
  const useRealRedis = process.env.USE_REAL_REDIS === 'true';

  if (isTestEnvironment && !useRealRedis) {
    redisInstance = new InMemoryRedisClient();
    return redisInstance;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl || !redisUrl.trim()) {
    // Strict production fail-closed guard: NEVER fall back to in-memory state in production
    redisInstance = new FailingRedisClient(
      'REDIS_URL environment variable is missing. Production seat holds require configured Redis infrastructure.'
    );
    return redisInstance;
  }

  redisInstance = new IoRedisClient(redisUrl);
  return redisInstance;
}

export function setRedisClient(client: IRedisClient | null): void {
  redisInstance = client;
}
