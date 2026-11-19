export interface IRedisClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode?: 'EX' | 'PX',
    duration?: number,
    flag?: 'NX' | 'XX'
  ): Promise<'OK' | null>;
  del(...keys: string[]): Promise<number>;
  ttl(key: string): Promise<number>; // returns remaining TTL in seconds (-2 if not exists, -1 if no TTL)
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
  ping(): Promise<string>;
  isHealthy(): Promise<boolean>;
  disconnect?(): Promise<void>;
}
