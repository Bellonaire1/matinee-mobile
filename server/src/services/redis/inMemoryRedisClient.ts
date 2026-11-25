import { IRedisClient } from './redisInterface.js';
import {
  ACQUIRE_HOLD_LUA,
  RELEASE_HOLD_LUA,
  EXTEND_HOLD_LUA,
  RELEASE_IDEMPOTENCY_LOCK_LUA,
  COMPLETE_IDEMPOTENCY_LUA,
  RELEASE_LOCK_LUA,
  STAFF_LOGIN_RATE_LIMIT_LUA,
} from './luaScripts.js';

interface MemoryEntry {
  value: string;
  expiresAt?: number; // timestamp in ms, undefined = no expiration
}

/**
 * In-memory fallback implementation of IRedisClient for testing and offline environments.
 * Emulates key expiration, string commands, atomic Lua scripts, and Redis error modes.
 */
export class InMemoryRedisClient implements IRedisClient {
  private store: Map<string, MemoryEntry> = new Map();
  private healthy = true;

  constructor() {}

  setHealthy(status: boolean): void {
    this.healthy = status;
  }

  private cleanExpired(key: string): void {
    const entry = this.store.get(key);
    if (entry && entry.expiresAt && Date.now() >= entry.expiresAt) {
      this.store.delete(key);
    }
  }

  async isHealthy(): Promise<boolean> {
    return this.healthy;
  }

  async ping(): Promise<string> {
    if (!this.healthy) throw new Error('InMemoryRedisClient is down');
    return 'PONG';
  }

  async get(key: string): Promise<string | null> {
    if (!this.healthy) throw new Error('InMemoryRedisClient is down');
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
    if (!this.healthy) throw new Error('InMemoryRedisClient is down');
    this.cleanExpired(key);
    const exists = this.store.has(key);

    if (flag === 'NX' && exists) {
      return null;
    }
    if (flag === 'XX' && !exists) {
      return null;
    }

    let expiresAt: number | undefined;
    if (mode && duration !== undefined) {
      const ms = mode === 'EX' ? duration * 1000 : duration;
      expiresAt = Date.now() + ms;
    }

    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    if (!this.healthy) throw new Error('InMemoryRedisClient is down');
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
    if (!this.healthy) throw new Error('InMemoryRedisClient is down');
    this.cleanExpired(key);
    const entry = this.store.get(key);
    if (!entry) return -2; // Key does not exist
    if (!entry.expiresAt) return -1; // Key exists but has no associated expire
    const remainingMs = entry.expiresAt - Date.now();
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }

  async disconnect(): Promise<void> {
    this.store.clear();
  }

  /**
   * Emulates atomic Redis Lua scripts used in seat holding.
   */
  async eval(
    script: string,
    numKeys: number,
    ...args: (string | number)[]
  ): Promise<unknown> {
    if (!this.healthy) throw new Error('InMemoryRedisClient is down');

    if (script === STAFF_LOGIN_RATE_LIMIT_LUA) {
      if (numKeys !== 2 || args.length !== 5) throw new Error('Invalid staff login rate-limit arguments');
      const accountKey = String(args[0]);
      const sourceKey = String(args[1]);
      const windowSeconds = Number(args[2]);
      const accountLimit = Number(args[3]);
      const sourceLimit = Number(args[4]);
      const increment = (key: string): number => {
        this.cleanExpired(key);
        const current = Number(this.store.get(key)?.value || 0) + 1;
        const expiresAt = this.store.get(key)?.expiresAt || Date.now() + windowSeconds * 1000;
        this.store.set(key, { value: String(current), expiresAt });
        return current;
      };
      const accountCount = increment(accountKey);
      const sourceCount = increment(sourceKey);
      return [
        accountCount <= accountLimit && sourceCount <= sourceLimit ? 1 : 0,
        accountCount,
        sourceCount,
        await this.ttl(accountKey),
      ];
    }

    const keys = args.slice(0, numKeys).map(String);
    const argv = args.slice(numKeys);

    // 1. ACQUIRE HOLD
    if (script === ACQUIRE_HOLD_LUA || script.includes('conflictingKeys')) {
      const numSeatKeys = keys.length - 1;
      const tokenKey = keys[keys.length - 1];
      const holdToken = argv[0];
      const ttl = Number(argv[1]);
      const seatPayload = String(argv[2]);
      const tokenPayload = String(argv[3]);

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
      const currentExpiresAt = Number(tokenData.expiresAt) || (createdAt + 600000);

      if (nowMs >= currentExpiresAt) {
        return [0, 'TOKEN_NOT_FOUND'];
      }

      let newExpiresAt = currentExpiresAt + extensionTtl * 1000;
      const maxExpiresAt = createdAt + maxLifetimeMs;
      if (newExpiresAt > maxExpiresAt) {
        newExpiresAt = maxExpiresAt;
      }
      if (newExpiresAt < currentExpiresAt) {
        newExpiresAt = currentExpiresAt;
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

    // 4. RELEASE IDEMPOTENCY LOCK
    if (
      script === RELEASE_IDEMPOTENCY_LOCK_LUA ||
      (script.includes('lockOwnerId') && script.includes('DEL'))
    ) {
      const key = keys[0];
      const lockOwnerId = String(argv[0]);
      this.cleanExpired(key);
      const entry = this.store.get(key);
      if (entry) {
        try {
          const data = JSON.parse(entry.value);
          if (data.lockOwnerId === lockOwnerId && data.status === 'IN_PROGRESS') {
            this.store.delete(key);
            return 1;
          }
        } catch {
          // ignore
        }
      }
      return 0;
    }

    // 5. COMPLETE IDEMPOTENCY
    if (
      script === COMPLETE_IDEMPOTENCY_LUA ||
      (script.includes('lockOwnerId') && script.includes('SET'))
    ) {
      const key = keys[0];
      const lockOwnerId = String(argv[0]);
      const payload = String(argv[1]);
      const ttlSeconds = Number(argv[2]);
      this.cleanExpired(key);
      const entry = this.store.get(key);
      if (entry) {
        try {
          const data = JSON.parse(entry.value);
          if (data.lockOwnerId === lockOwnerId && data.status === 'IN_PROGRESS') {
            this.store.set(key, {
              value: payload,
              expiresAt: Date.now() + ttlSeconds * 1000,
            });
            return 1;
          }
        } catch {
          // ignore
        }
      }
      return 0;
    }

    // 6. RELEASE GENERIC LOCK (COMPARE AND DELETE VIA ARGV[1])
    if (
      script === RELEASE_LOCK_LUA ||
      (script.includes("redis.call('GET', KEYS[1]) == ARGV[1]") &&
        script.includes("redis.call('DEL', KEYS[1])"))
    ) {
      const key = keys[0];
      const expectedNonce = String(argv[0]);
      this.cleanExpired(key);
      const entry = this.store.get(key);
      if (entry && entry.value === expectedNonce) {
        this.store.delete(key);
        return 1;
      }
      return 0;
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
