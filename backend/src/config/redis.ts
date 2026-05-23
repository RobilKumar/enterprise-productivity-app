import Redis from 'ioredis';
import { logger } from '../utils/logger';

let redisClient: Redis;

export async function connectRedis(): Promise<void> {
  // REDIS_URL is used for cloud services like Upstash (single connection string).
  // Fall back to individual host/port/password for local Docker.
  const redisUrl = process.env.REDIS_URL;

  redisClient = redisUrl
    ? new Redis(redisUrl, {
        tls: redisUrl.startsWith('rediss://') ? {} : undefined,
        retryStrategy:       (times) => Math.min(times * 100, 3000),
        maxRetriesPerRequest: 3,
        lazyConnect: false,
      })
    : new Redis({
        host:     process.env.REDIS_HOST     || 'localhost',
        port:     Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        retryStrategy:       (times) => Math.min(times * 100, 3000),
        maxRetriesPerRequest: 3,
        lazyConnect: false,
      });

  redisClient.on('connect', () => logger.info('Redis connected'));
  redisClient.on('error',   (e) => logger.error('Redis error:', e.message));
  await redisClient.ping();
}

// Export singleton — available after connectRedis() resolves
export { redisClient as redis };
