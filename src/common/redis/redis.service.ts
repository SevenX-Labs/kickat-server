import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    this.client = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD', '') || undefined,
      db: this.configService.get<number>('REDIS_DB', 0),
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    this.client.connect().catch((err) => {
      this.logger.warn(`Redis connection failed: ${err.message}. App will fall through to DB.`);
    });

    this.client.on('error', (err) => {
      this.logger.warn(`Redis error: ${err.message}`);
    });
  }

  private isReady(): boolean {
    return this.client.status === 'ready';
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.isReady()) return null;
      const raw = await this.client.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      if (!this.isReady()) return;
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // fall through
    }
  }

  async del(key: string | string[]): Promise<void> {
    try {
      if (!this.isReady()) return;
      const keys = Array.isArray(key) ? key : [key];
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch {
      // fall through
    }
  }

  async delByPattern(pattern: string): Promise<void> {
    try {
      if (!this.isReady()) return;
      let cursor = '0';
      do {
        const [next, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = next;
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      } while (cursor !== '0');
    } catch {
      // fall through
    }
  }

  /** SET NX with TTL in milliseconds — for distributed locks */
  async setNX(key: string, value: string, ttlMs: number): Promise<boolean> {
    try {
      if (!this.isReady()) return false;
      const result = await this.client.set(key, value, 'PX', ttlMs, 'NX');
      return result === 'OK';
    } catch {
      return false;
    }
  }

  /** Atomic compare-and-delete for lock release */
  async releaseLock(key: string, token: string): Promise<boolean> {
    try {
      if (!this.isReady()) return false;
      const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
      const result = await this.client.eval(script, 1, key, token);
      return result === 1;
    } catch {
      return false;
    }
  }

  async incr(key: string): Promise<number> {
    try {
      if (!this.isReady()) return 0;
      return await this.client.incr(key);
    } catch {
      return 0;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    try {
      if (!this.isReady()) return;
      await this.client.expire(key, ttlSeconds);
    } catch {
      // fall through
    }
  }

  async hset(key: string, field: string, value: string): Promise<boolean> {
    try {
      if (!this.isReady()) return false;
      await this.client.hset(key, field, value);
      return true;
    } catch {
      return false;
    }
  }

  async hget(key: string, field: string): Promise<string | null> {
    try {
      if (!this.isReady()) return null;
      return await this.client.hget(key, field);
    } catch {
      return null;
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      if (!this.isReady()) return {};
      return await this.client.hgetall(key);
    } catch {
      return {};
    }
  }

  async hlen(key: string): Promise<number> {
    try {
      if (!this.isReady()) return 0;
      return await this.client.hlen(key);
    } catch {
      return 0;
    }
  }

  async hdel(key: string, ...fields: string[]): Promise<void> {
    try {
      if (!this.isReady()) return;
      if (fields.length > 0) {
        await this.client.hdel(key, ...fields);
      }
    } catch {
      // fall through
    }
  }

  async zincrby(key: string, increment: number, member: string): Promise<string> {
    try {
      if (!this.isReady()) return '0';
      return await this.client.zincrby(key, increment, member);
    } catch {
      return '0';
    }
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      if (!this.isReady()) return [];
      return await this.client.zrevrange(key, start, stop);
    } catch {
      return [];
    }
  }

  async ping(): Promise<boolean> {
    try {
      if (!this.isReady()) return false;
      const res = await this.client.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
    } catch {
      // ignore
    }
  }
}
