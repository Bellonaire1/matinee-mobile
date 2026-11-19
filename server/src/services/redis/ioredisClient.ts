import Redis, { Redis as RedisInstance } from 'ioredis';
import { IRedisClient } from './redisInterface.js';

export class IoRedisClient implements IRedisClient {
  private client: RedisInstance;
  private isConnected = false;

  constructor(redisUrl?: string) {
    const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    this.client.on('connect', () => {
      this.isConnected = true;
    });

    this.client.on('error', () => {
      this.isConnected = false;
    });

    this.client.on('close', () => {
      this.isConnected = false;
    });
  }

  async isHealthy(): Promise<boolean> {
    try {
      const res = await this.client.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(
    key: string,
    value: string,
    mode?: 'EX' | 'PX',
    duration?: number,
    flag?: 'NX' | 'XX'
  ): Promise<'OK' | null> {
    const args: (string | number)[] = [key, value];
    if (mode && duration !== undefined) {
      args.push(mode, duration);
    }
    if (flag) {
      args.push(flag);
    }
    return (this.client as any).set(...args) as Promise<'OK' | null>;
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.client.del(...keys);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async eval(
    script: string,
    numKeys: number,
    ...args: (string | number)[]
  ): Promise<unknown> {
    return this.client.eval(script, numKeys, ...args);
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}
