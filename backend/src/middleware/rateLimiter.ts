import rateLimit from 'express-rate-limit';
import { createRedisStore } from '../utils/redis-rate-store';

// Global limiter: 500 requests per 15 minutes per IP
// Redis-backed so limits are shared across restarts and multiple instances
export const globalRateLimiter = rateLimit({
  windowMs:        Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:             Number(process.env.RATE_LIMIT_MAX)        || 500,
  standardHeaders: true,
  legacyHeaders:   false,
  store:           createRedisStore('global'),
  message:         { success: false, message: 'Too many requests, please try again later.' },
  skip:            (req) => req.path === '/health' || req.path === '/metrics',
});

// Auth limiter: 50 FAILED attempts per email per 15 minutes
export const authRateLimiter = rateLimit({
  windowMs:               15 * 60 * 1000,
  max:                    Number(process.env.AUTH_RATE_LIMIT_MAX) || 50,
  standardHeaders:        true,
  legacyHeaders:          false,
  store:                  createRedisStore('auth'),
  keyGenerator:           (req) => String(req.body?.email || req.ip || 'unknown'),
  skipSuccessfulRequests: true,
  message:                { success: false, message: 'Too many failed login attempts. Please try again in 15 minutes.' },
});

export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      30,
  store:    createRedisStore('upload'),
  message:  { success: false, message: 'Upload rate limit exceeded.' },
});
