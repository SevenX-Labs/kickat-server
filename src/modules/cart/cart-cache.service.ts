import { Injectable } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';
import { CacheKeys } from '../../common/redis/cache-keys';

export interface CartItemEntry {
  id: string;
  variantId: string | null;
  productId: string;
  quantity: number;
  addedAt: string;
}

const AUTH_TTL_DAYS = 30;
const GUEST_TTL_DAYS = 7;

@Injectable()
export class CartCacheService {
  constructor(private readonly redis: RedisService) {}

  private ttlSeconds(isGuest: boolean): number {
    return (isGuest ? GUEST_TTL_DAYS : AUTH_TTL_DAYS) * 86400;
  }

  static cartKey(userId: string): string {
    return CacheKeys.cart(userId);
  }

  static guestKey(sessionId: string): string {
    return CacheKeys.guestCart(sessionId);
  }

  static fieldKey(productId: string, variantId?: string | null): string {
    return variantId ? `${productId}:${variantId}` : productId;
  }

  async getCart(key: string): Promise<CartItemEntry[] | null> {
    const hash = await this.redis.hgetall(key);
    if (!hash || Object.keys(hash).length === 0) return null;

    const items: CartItemEntry[] = [];
    for (const field of Object.keys(hash)) {
      try {
        items.push(JSON.parse(hash[field]) as CartItemEntry);
      } catch {
        // corrupted entry — skip
      }
    }
    return items.length > 0 ? items : null;
  }

  async getItem(key: string, fieldKey: string): Promise<CartItemEntry | null> {
    const raw = await this.redis.hget(key, fieldKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CartItemEntry;
    } catch {
      return null;
    }
  }

  async setItem(
    key: string,
    fieldKey: string,
    data: CartItemEntry,
    isGuest: boolean,
  ): Promise<boolean> {
    const ok = await this.redis.hset(key, fieldKey, JSON.stringify(data));
    if (ok) {
      await this.redis.expire(key, this.ttlSeconds(isGuest));
    }
    return ok;
  }

  async removeItem(key: string, fieldKey: string): Promise<void> {
    await this.redis.hdel(key, fieldKey);
  }

  async removeItems(key: string, fieldKeys: string[]): Promise<void> {
    if (fieldKeys.length > 0) {
      await this.redis.hdel(key, ...fieldKeys);
    }
  }

  async clearCart(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async getItemCount(key: string): Promise<number> {
    return this.redis.hlen(key);
  }
}
