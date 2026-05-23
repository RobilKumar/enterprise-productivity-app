/**
 * Redis-backed store for express-rate-limit v7.
 *
 * Why Redis instead of in-memory?
 *  - Works across multiple backend instances (horizontal scaling)
 *  - Survives server restarts — counters are not lost
 *  - skipSuccessfulRequests works correctly: only failed attempts accumulate
 *
 * Usage:
 *   import { createRedisStore } from '../utils/redis-rate-store';
 *   const store = createRedisStore('auth');   // prefix = namespace
 */
import type { Store, ClientRateLimitInfo, Options } from 'express-rate-limit';
import { redis } from '../config/redis';

export function createRedisStore(prefix: string): Store {
  // windowMs is injected by express-rate-limit when the limiter is created
  let windowMs = 15 * 60 * 1000; // safe default (15 min)

  return {
    /** Called once at startup; capture the real windowMs from options */
    init(options: Options): void {
      windowMs = options.windowMs;
    },

    /**
     * Increment the counter for `key`.
     * On the very first request for a key we set the Redis TTL so the window
     * automatically expires.  Subsequent increments keep the same TTL.
     */
    async increment(key: string): Promise<ClientRateLimitInfo> {
      const redisKey = `rl:${prefix}:${key}`;

      // Atomic increment
      const totalHits = await redis.incr(redisKey);

      // Only set TTL on the first request in this window
      if (totalHits === 1) {
        await redis.pexpire(redisKey, windowMs);
      }

      // How many milliseconds until the window resets?
      const pttl = await redis.pttl(redisKey);
      const resetTime = new Date(Date.now() + (pttl > 0 ? pttl : windowMs));

      return { totalHits, resetTime };
    },

    /** Decrement — called when skipSuccessfulRequests=true and the request succeeds */
    async decrement(key: string): Promise<void> {
      const redisKey = `rl:${prefix}:${key}`;
      const newVal = await redis.decr(redisKey);
      // Never let the counter go below 0
      if (newVal < 0) {
        await redis.set(redisKey, 0, 'KEEPTTL');
      }
    },

    /** Hard-reset a single key (admin action / test helper) */
    async resetKey(key: string): Promise<void> {
      await redis.del(`rl:${prefix}:${key}`);
    },

    /** Reset every key that belongs to this prefix */
    async resetAll(): Promise<void> {
      const keys = await redis.keys(`rl:${prefix}:*`);
      if (keys.length) {
        await redis.del(...keys);
      }
    },
  };
}
