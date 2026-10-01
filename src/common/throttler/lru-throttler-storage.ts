import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { LRUCache } from 'lru-cache';

export interface LruThrottlerEntry {
  totalHits: number;
  expiresAt: number;
  blockExpiresAt?: number;
  isBlocked?: boolean;
}

export interface LruThrottlerStorageOptions {
  max?: number;
}

@Injectable()
export class LruThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(LruThrottlerStorage.name);
  private readonly cache: LRUCache<string, LruThrottlerEntry>;

  constructor(options?: LruThrottlerStorageOptions) {
    const maxSize = options?.max || 50000;
    this.cache = new LRUCache<string, LruThrottlerEntry>({
      max: maxSize,
    });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const storageKey = throttlerName
      ? `kickat:throttle:${throttlerName}:${key}`
      : `kickat:throttle:${key}`;
    const now = Date.now();
    const entry = this.cache.get(storageKey);

    if (!entry || entry.expiresAt <= now) {
      const expiresAt = now + ttl;
      const newEntry: LruThrottlerEntry = {
        totalHits: 1,
        expiresAt,
        isBlocked: false,
        blockExpiresAt: 0,
      };
      this.cache.set(storageKey, newEntry, { ttl });

      return {
        totalHits: 1,
        timeToExpire: Math.max(0, Math.ceil(ttl / 1000)),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }

    // Check if entry is currently blocked
    if (entry.isBlocked) {
      const blockRemaining = (entry.blockExpiresAt || 0) - now;
      if (blockRemaining > 0) {
        return {
          totalHits: entry.totalHits,
          timeToExpire: Math.max(0, Math.ceil((entry.expiresAt - now) / 1000)),
          isBlocked: true,
          timeToBlockExpire: Math.ceil(blockRemaining / 1000),
        };
      }
      // Block duration expired
      entry.isBlocked = false;
      entry.blockExpiresAt = 0;
    }

    entry.totalHits += 1;
    const remainingTtlMs = Math.max(0, entry.expiresAt - now);
    const timeToExpire = Math.max(0, Math.ceil(remainingTtlMs / 1000));
    const isBlocked = entry.totalHits > limit;

    if (isBlocked && !entry.isBlocked) {
      entry.isBlocked = true;
      entry.blockExpiresAt =
        blockDuration > 0 ? now + blockDuration : entry.expiresAt;
    }

    const timeToBlockExpire = isBlocked
      ? Math.max(
          0,
          Math.ceil(((entry.blockExpiresAt || entry.expiresAt) - now) / 1000),
        )
      : 0;

    // Update entry in LRU cache with remaining TTL
    this.cache.set(storageKey, entry, { ttl: Math.max(1, remainingTtlMs) });

    return {
      totalHits: entry.totalHits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire,
    };
  }

  get(key: string, throttlerName?: string): LruThrottlerEntry | undefined {
    const storageKey = throttlerName
      ? `kickat:throttle:${throttlerName}:${key}`
      : `kickat:throttle:${key}`;
    return this.cache.get(storageKey);
  }

  get size(): number {
    return this.cache.size;
  }

  get max(): number {
    return this.cache.max;
  }

  clear(): void {
    this.cache.clear();
  }
}
