import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

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
    const blockKey = `${storageKey}:blocked`;

    // Check if blocked
    const blockedUntil = await this.redis.get<number>(blockKey);
    if (blockedUntil && Date.now() < blockedUntil) {
      const timeToBlockExpire = Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
      return {
        totalHits: limit + 1,
        timeToExpire: timeToBlockExpire,
        isBlocked: true,
        timeToBlockExpire,
      };
    }

    const totalHits = await this.redis.incr(storageKey);

    // Set TTL on first hit
    if (totalHits === 1) {
      const ttlSeconds = Math.max(1, Math.ceil(ttl / 1000));
      await this.redis.expire(storageKey, ttlSeconds);
    }

    const isBlocked = totalHits > limit;
    let timeToBlockExpire = 0;

    if (isBlocked && blockDuration > 0) {
      const blockExpires = Date.now() + blockDuration;
      const blockTtlSeconds = Math.max(1, Math.ceil(blockDuration / 1000));
      await this.redis.set(blockKey, blockExpires, blockTtlSeconds);
      timeToBlockExpire = Math.ceil(blockDuration / 1000);
    }

    const timeToExpire = Math.max(1, Math.ceil(ttl / 1000));

    return {
      totalHits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire,
    };
  }
}
