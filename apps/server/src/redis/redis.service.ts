import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

const LOG_INTERVAL_MS = 60_000;
const DELETE_BATCH_SIZE = 100;

/**
 * Optional cache. With REDIS_URL unset every method is a no-op; with Redis
 * configured but unreachable, commands fail fast (<= ~500 ms) and are swallowed.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis | null;
  private lastLogAt = 0;

  constructor() {
    const url = process.env.REDIS_URL?.trim();
    if (!url) {
      this.client = null;
      this.logger.log('Redis disabled (REDIS_URL unset); cache is a no-op');
      return;
    }

    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      commandTimeout: 500,
      connectTimeout: 500,
      enableOfflineQueue: false,
      retryStrategy: (times: number) => Math.min(times * 1000, 30000),
    });
    this.client.on('error', (error: Error) => this.logRateLimited('Redis error', error));
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.connect();
      this.logger.log('Redis connection established');
    } catch (error) {
      this.logRateLimited('Redis connection failed', error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.quit();
      this.logger.log('Redis connection closed');
    } catch {
      this.client.disconnect();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    try {
      const value = await this.client.get(key);
      return value === null ? null : (JSON.parse(value) as T);
    } catch (error) {
      this.logRateLimited('Redis get failed', error);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds = 3600): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logRateLimited('Redis set failed', error);
    }
  }

  async deleteByPattern(pattern: string): Promise<void> {
    if (!this.client) return;
    try {
      let cursor = '0';
      const batch: string[] = [];
      do {
        const [next, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = next;
        batch.push(...keys);
        while (batch.length >= DELETE_BATCH_SIZE) {
          await this.client.unlink(...batch.splice(0, DELETE_BATCH_SIZE));
        }
      } while (cursor !== '0');
      if (batch.length > 0) {
        await this.client.unlink(...batch);
      }
    } catch (error) {
      this.logRateLimited('Redis deleteByPattern failed', error);
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(key);
    } catch (error) {
      this.logRateLimited('Redis delete failed', error);
    }
  }

  private logRateLimited(message: string, error: unknown): void {
    const now = Date.now();
    if (now - this.lastLogAt < LOG_INTERVAL_MS) return;
    this.lastLogAt = now;
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(`${message}: ${detail}`);
  }
}
