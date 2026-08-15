import { Injectable, Logger } from '@nestjs/common';
import LRU from 'lru-cache';

export interface IOtpCacheService {
  isCooldownActive(identifier: string, type: 'phone' | 'email'): boolean;
  setCooldown(identifier: string, type: 'phone' | 'email', ttlMs?: number): void;
  clearCooldown(identifier: string, type: 'phone' | 'email'): void;
  getOtpAttempts(otpId: string): number;
  incrementOtpAttempts(otpId: string, ttlMs?: number): number;
  clearOtpAttempts(otpId: string): void;
  get<T = any>(key: string): T | undefined;
  set<T = any>(key: string, value: T, ttlMs?: number): void;
  del(key: string): void;
  has(key: string): boolean;
}

@Injectable()
export class OtpCacheService implements IOtpCacheService {
  private readonly logger = new Logger(OtpCacheService.name);
  private readonly cache: LRU<string, any>;

  // Default TTLs in milliseconds
  private readonly DEFAULT_COOLDOWN_TTL_MS = 60 * 1000; // 60 seconds
  private readonly DEFAULT_OTP_ATTEMPTS_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.cache = new LRU<string, any>({
      max: 10000, // Maximum 10,000 active keys
      maxAge: 60 * 60 * 1000, // Default 1 hour fallback TTL
    });
  }

  /**
   * Builds an isolated cache key for phone or email send cooldown.
   * Example: otp:cooldown:phone:+919876543210 or otp:cooldown:email:user@example.com
   */
  private buildCooldownKey(identifier: string, type: 'phone' | 'email'): string {
    const sanitizedIdentifier =
      type === 'email' ? identifier.trim().toLowerCase() : identifier.trim();
    return `otp:cooldown:${type}:${sanitizedIdentifier}`;
  }

  /**
   * Builds an isolated cache key for per-OTP verification attempt counter.
   * Example: otp:attempts:uuid-of-otp-log
   */
  private buildAttemptsKey(otpId: string): string {
    return `otp:attempts:${otpId.trim()}`;
  }

  /**
   * Checks if an OTP send cooldown is currently active.
   */
  isCooldownActive(identifier: string, type: 'phone' | 'email'): boolean {
    const key = this.buildCooldownKey(identifier, type);
    return this.cache.has(key);
  }

  /**
   * Sets an OTP send cooldown for 60 seconds (or custom TTL).
   */
  setCooldown(
    identifier: string,
    type: 'phone' | 'email',
    ttlMs: number = this.DEFAULT_COOLDOWN_TTL_MS,
  ): void {
    const key = this.buildCooldownKey(identifier, type);
    this.cache.set(key, true, ttlMs);
  }

  /**
   * Clears an active OTP send cooldown.
   */
  clearCooldown(identifier: string, type: 'phone' | 'email'): void {
    const key = this.buildCooldownKey(identifier, type);
    this.cache.del(key);
  }

  /**
   * Gets the number of failed verification attempts for a specific OTP ID.
   */
  getOtpAttempts(otpId: string): number {
    const key = this.buildAttemptsKey(otpId);
    const count = this.cache.get(key);
    return typeof count === 'number' ? count : 0;
  }

  /**
   * Atomically increments and returns the failed attempt counter for a specific OTP ID.
   */
  incrementOtpAttempts(
    otpId: string,
    ttlMs: number = this.DEFAULT_OTP_ATTEMPTS_TTL_MS,
  ): number {
    const key = this.buildAttemptsKey(otpId);
    const current = this.getOtpAttempts(otpId);
    const next = current + 1;
    this.cache.set(key, next, ttlMs);
    return next;
  }

  /**
   * Clears the failed attempt counter for a specific OTP ID.
   */
  clearOtpAttempts(otpId: string): void {
    const key = this.buildAttemptsKey(otpId);
    this.cache.del(key);
  }

  /**
   * Generic get method.
   */
  get<T = any>(key: string): T | undefined {
    return this.cache.get(key);
  }

  /**
   * Generic set method with TTL in milliseconds.
   */
  set<T = any>(key: string, value: T, ttlMs?: number): void {
    if (ttlMs !== undefined) {
      this.cache.set(key, value, ttlMs);
    } else {
      this.cache.set(key, value);
    }
  }

  /**
   * Generic delete method.
   */
  del(key: string): void {
    this.cache.del(key);
  }

  /**
   * Generic has method.
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }
}
