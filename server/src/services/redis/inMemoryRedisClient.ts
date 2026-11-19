import { IRedisClient } from './redisInterface.js';
import { ACQUIRE_HOLD_LUA, RELEASE_HOLD_LUA, EXTEND_HOLD_LUA } from './luaScripts.js';

interface MemoryEntry {
  value: string;
  expiresAt: number | null; // epoch ms or null for infinite
}

/**
 * High-fidelity In-Memory Redis client for local development and unit/integration testing.
 * Implements precise millisecond TTL expiry and atomic multi-key operations identical
 * to Redis Lua script execution.
 */
export class InMemoryRedisClient implements IRedisClient {
  private store = new Map<string, MemoryEntry>();
  private healthy = true;

  constructor(healthy = true) {
    this.healthy = healthy;
  }

  setHealthy(status: boolean): void {
    this.healthy = status;
  }

  async isHealthy(): Promise<boolean> {
    return this.healthy;
  }

  async ping(): Promise<string> {
    if (!this.healthy) {
      throw new Error('ECONNREFUSED: Redis connection refused (simulated)');
    }
    return 'PONG';
  }

  private cleanExpired(key: string): void {
    const entry = this.store.get(key);
    if (entry && entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.healthy) {
      throw new Error('ECONNREFUSED: Redis connection refused (simulated)');
    }
    this.cleanExpired(key);
    const entry = this.store.get(key);
    return entry ? entry.value : null;
  }

  async set(
    key: string,
    value: string,
    mode?: 'EX' | 'PX',
    duration?: number,
    flag?: 'NX' | 'XX'
  ): Promise<'OK' | null> {
    if (!this.healthy) {
      throw new Error('ECONNREFUSED: Redis connection refused (simulated)');
    }
    this.cleanExpired(key);
    const exists = this.store.has(key);
    if (flag === 'NX' && exists) {
      return null;
    }
    if (flag === 'XX' && !exists) {
      return null;
    }

    let expiresAt: number | null = null;
    if (mode === 'EX' && duration !== undefined) {
      expiresAt = Date.now() + duration * 1000;
    } else if (mode === 'PX' && duration !== undefined) {
      expiresAt = Date.now() + duration;
    }
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    if (!this.healthy) {
      throw new Error('ECONNREFUSED: Redis connection refused (simulated)');
    }
    let count = 0;
    for (const key of keys) {
      this.cleanExpired(key);
      if (this.store.delete(key)) {
        count++;
      }
    }
    return count;
  }

  async ttl(key: string): Promise<number> {
    if (!this.healthy) {
      throw new Error('ECONNREFUSED: Redis connection refused (simulated)');
    }
    this.cleanExpired(key);
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    const remainingMs = entry.expiresAt - Date.now();
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }

  async eval(
    script: string,
    numKeys: number,
    ...args: (string | number)[]
  ): Promise<unknown> {
    if (!this.healthy) {
      throw new Error('ECONNREFUSED: Redis connection refused (simulated)');
    }

    const keys = args.slice(0, numKeys).map(String);
    const argv = args.slice(numKeys).map(String);

    // Clean expired keys before evaluation
    for (const key of keys) {
      this.cleanExpired(key);
    }

    // 1. ACQUIRE HOLD
    if (script === ACQUIRE_HOLD_LUA || script.includes('conflictingKeys')) {
      const numSeatKeys = keys.length - 1;
      const tokenKey = keys[keys.length - 1];
      const holdToken = argv[0];
      const ttl = Number(argv[1]);
      const seatPayload = argv[2];
      const tokenPayload = argv[3];

      const conflictingKeys: string[] = [];
      for (let i = 0; i < numSeatKeys; i++) {
        const key = keys[i];
        this.cleanExpired(key);
        const existing = this.store.get(key);
        if (existing) {
          try {
            const data = JSON.parse(existing.value);
            if (data.holdToken !== holdToken) {
              conflictingKeys.push(key);
            }
          } catch {
            conflictingKeys.push(key);
          }
        }
      }

      if (conflictingKeys.length > 0) {
        return [0, conflictingKeys];
      }

      const expiresAt = Date.now() + ttl * 1000;
      for (let i = 0; i < numSeatKeys; i++) {
        this.store.set(keys[i], { value: seatPayload, expiresAt });
      }

      this.store.set(tokenKey, { value: tokenPayload, expiresAt });
      return [1, 'OK'];
    }

    // 2. EXTEND HOLD (HEARTBEAT)
    if (script === EXTEND_HOLD_LUA || script.includes('MAX_EXTENSIONS_EXCEEDED')) {
      const numSeatKeys = keys.length - 1;
      const tokenKey = keys[keys.length - 1];
      const holdToken = argv[0];
      const extensionTtl = Number(argv[1]);
      const maxExtensions = Number(argv[2]);
      const nowMs = Number(argv[3]) || Date.now();
      const maxLifetimeMs = Number(argv[4]);

      this.cleanExpired(tokenKey);
      const tokenEntry = this.store.get(tokenKey);
      if (!tokenEntry) {
        return [0, 'TOKEN_NOT_FOUND'];
      }

      let tokenData: any;
      try {
        tokenData = JSON.parse(tokenEntry.value);
        if (tokenData.holdToken !== holdToken) {
          return [0, 'TOKEN_MISMATCH'];
        }
      } catch {
        return [0, 'TOKEN_MISMATCH'];
      }

      const currentExtensions = Number(tokenData.extensionCount || 0);
      if (currentExtensions >= maxExtensions) {
        return [0, 'MAX_EXTENSIONS_EXCEEDED'];
      }

      const createdAt = Number(tokenData.createdAt);
      let newExpiresAt = nowMs + extensionTtl * 1000;
      if (newExpiresAt - createdAt > maxLifetimeMs) {
        newExpiresAt = createdAt + maxLifetimeMs;
      }
      const newTtl = Math.floor((newExpiresAt - nowMs) / 1000);
      if (newTtl <= 0) {
        return [0, 'MAX_LIFETIME_EXCEEDED'];
      }

      tokenData.extensionCount = currentExtensions + 1;
      tokenData.expiresAt = newExpiresAt;

      const tokenJson = JSON.stringify(tokenData);
      this.store.set(tokenKey, { value: tokenJson, expiresAt: newExpiresAt });

      for (let i = 0; i < numSeatKeys; i++) {
        const key = keys[i];
        this.cleanExpired(key);
        const existing = this.store.get(key);
        if (existing) {
          try {
            const seatData = JSON.parse(existing.value);
            if (seatData.holdToken === holdToken) {
              seatData.expiresAt = newExpiresAt;
              this.store.set(key, { value: JSON.stringify(seatData), expiresAt: newExpiresAt });
            }
          } catch {
            // ignore
          }
        }
      }

      return [1, newTtl, newExpiresAt, tokenData.extensionCount];
    }

    // 3. RELEASE HOLD
    if (script === RELEASE_HOLD_LUA || script.includes('deletedCount')) {
      const numSeatKeys = keys.length - 1;
      const tokenKey = keys[keys.length - 1];
      const holdToken = argv[0];

      this.cleanExpired(tokenKey);
      const tokenEntry = this.store.get(tokenKey);
      if (!tokenEntry) {
        return [0, 'TOKEN_NOT_FOUND'];
      }

      try {
        const tokenData = JSON.parse(tokenEntry.value);
        if (tokenData.holdToken !== holdToken) {
          return [0, 'TOKEN_MISMATCH'];
        }
      } catch {
        return [0, 'TOKEN_MISMATCH'];
      }

      let deletedCount = 0;
      for (let i = 0; i < numSeatKeys; i++) {
        const key = keys[i];
        this.cleanExpired(key);
        const existing = this.store.get(key);
        if (existing) {
          try {
            const data = JSON.parse(existing.value);
            if (data.holdToken === holdToken) {
              this.store.delete(key);
              deletedCount++;
            }
          } catch {
            // ignore
          }
        }
      }

      this.store.delete(tokenKey);
      return [1, deletedCount];
    }

    throw new Error(`Unsupported script evaluated in InMemoryRedisClient`);
  }

  // Diagnostic helper for tests
  clear(): void {
    this.store.clear();
  }

  expireKeyNow(key: string): void {
    this.store.delete(key);
  }

  expireAllNow(): void {
    this.store.clear();
  }
}
