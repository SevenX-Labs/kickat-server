import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { CacheKeys } from '../redis/cache-keys';

export type OtpCooldownType = 'phone' | 'email' | 'user-phone' | 'user-email';

export interface IOtpCacheService {
  isCooldownActive(identifier: string, type: OtpCooldownType): Promise<boolean>;
  setCooldown(identifier: string, type: OtpCooldownType, ttlMs?: number): Promise<void>;
  clearCooldown(identifier: string, type: OtpCooldownType): Promise<void>;
  getOtpAttempts(otpId: string): Promise<number>;
  incrementOtpAttempts(otpId: string, ttlMs?: number): Promise<number>;
  clearOtpAttempts(otpId: string): Promise<void>;
  get<T = any>(key: string): Promise<T | null>;
  set<T = any>(key: string, value: T, ttlMs?: number): Promise<void>;
  del(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
}

@Injectable()
export class OtpCacheService implements IOtpCacheService {
  private readonly logger = new Logger(OtpCacheService.name);

  private readonly DEFAULT_COOLDOWN_TTL_S = 60;
  private readonly DEFAULT_OTP_ATTEMPTS_TTL_S = 300; // 5 minutes

  constructor(private readonly redis: RedisService) {}

  private buildCooldownKey(identifier: string, type: OtpCooldownType): string {
    const isEmail = type === 'email' || type === 'user-email';
    const sanitizedIdentifier = isEmail
      ? identifier.trim().toLowerCase()
      : identifier.trim();
    return CacheKeys.otpCooldown(type, sanitizedIdentifier);
  }

  private buildAttemptsKey(otpId: string): string {
    return CacheKeys.otpAttempts(otpId.trim());
  }

  async isCooldownActive(identifier: string, type: OtpCooldownType): Promise<boolean> {
    const key = this.buildCooldownKey(identifier, type);
    const val = await this.redis.get<boolean>(key);
    return val === true;
  }

  async setCooldown(
    identifier: string,
    type: OtpCooldownType,
    ttlMs: number = this.DEFAULT_COOLDOWN_TTL_S * 1000,
  ): Promise<void> {
    const key = this.buildCooldownKey(identifier, type);
    const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
    await this.redis.set(key, true, ttlSeconds);
  }

  async clearCooldown(identifier: string, type: OtpCooldownType): Promise<void> {
    const key = this.buildCooldownKey(identifier, type);
    await this.redis.del(key);
  }

  async getOtpAttempts(otpId: string): Promise<number> {
    const key = this.buildAttemptsKey(otpId);
    const count = await this.redis.get<number>(key);
    return typeof count === 'number' ? count : 0;
  }

  async incrementOtpAttempts(
    otpId: string,
    ttlMs: number = this.DEFAULT_OTP_ATTEMPTS_TTL_S * 1000,
  ): Promise<number> {
    const key = this.buildAttemptsKey(otpId);
    const current = await this.getOtpAttempts(otpId);
    const next = current + 1;
    const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
    await this.redis.set(key, next, ttlSeconds);
    return next;
  }

  async clearOtpAttempts(otpId: string): Promise<void> {
    const key = this.buildAttemptsKey(otpId);
    await this.redis.del(key);
  }

  async get<T = any>(key: string): Promise<T | null> {
    return this.redis.get<T>(key);
  }

  async set<T = any>(key: string, value: T, ttlMs?: number): Promise<void> {
    const ttlSeconds = ttlMs ? Math.max(1, Math.ceil(ttlMs / 1000)) : 3600;
    await this.redis.set(key, value, ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async has(key: string): Promise<boolean> {
    const val = await this.redis.get(key);
    return val !== null;
  }
}
