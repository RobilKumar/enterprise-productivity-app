import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { createRedisStore } from '../utils/redis-rate-store';

// ─── Custom Application Error ─────────────────────────────────
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  details?: unknown;

  constructor(message: string, statusCode = 500, details?: unknown) {
    super(message);
    this.statusCode      = statusCode;
    this.isOperational   = true;
    this.details         = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── Global Error Handler ─────────────────────────────────────
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  let statusCode = err.statusCode || 500;
  let message    = err.message    || 'Internal Server Error';
  let details    = err.details;

  // Prisma errors
  if (err.code === 'P2002') {
    statusCode = 409;
    message    = 'A record with this value already exists';
    details    = err.meta?.target;
  } else if (err.code === 'P2025') {
    statusCode = 404;
    message    = 'Record not found';
  } else if (err.code === 'P2003') {
    statusCode = 400;
    message    = 'Related record not found';
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    statusCode = 422;
    message    = 'Validation error';
    details    = err.errors?.map((e: any) => ({ field: e.path.join('.'), message: e.message }));
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError')   { statusCode = 401; message = 'Invalid token'; }
  if (err.name === 'TokenExpiredError')   { statusCode = 401; message = 'Token expired'; }

  if (statusCode >= 500) {
    logger.error(`[${req.method}] ${req.path} → ${statusCode}: ${message}`, { stack: err.stack });
  } else {
    logger.warn(`[${req.method}] ${req.path} → ${statusCode}: ${message}`);
  }

  return res.status(statusCode).json({
    success:   false,
    message,
    ...(details    ? { details }         : {}),
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
}

// ─── Request Logger Middleware ────────────────────────────────
export function requestLogger(req: Request, _res: Response, next: NextFunction) {
  (req as any).requestId = uuidv4();
  logger.http(`→ ${req.method} ${req.path} [${(req as any).requestId}]`);
  next();
}

// ─── Rate Limiters ────────────────────────────────────────────
// All three limiters use a Redis-backed store so:
//  1. Counters survive backend restarts
//  2. Limits are shared across multiple backend instances
//  3. skipSuccessfulRequests works correctly for auth (only failed attempts count)

export const globalRateLimiter = rateLimit({
  windowMs:        Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:             Number(process.env.RATE_LIMIT_MAX)        || 500,
  standardHeaders: true,
  legacyHeaders:   false,
  store:           createRedisStore('global'),
  message:         { success: false, message: 'Too many requests, please try again later.' },
});

export const authRateLimiter = rateLimit({
  windowMs:               15 * 60 * 1000,   // 15-minute sliding window
  max:                    Number(process.env.AUTH_RATE_LIMIT_MAX) || 50,
  standardHeaders:        true,
  legacyHeaders:          false,
  store:                  createRedisStore('auth'),
  // Key = email so each user account has its own bucket (not shared by IP)
  keyGenerator:           (req) => String(req.body?.email || req.ip || 'unknown'),
  // Only count FAILED attempts — a successful login does NOT consume quota
  skipSuccessfulRequests: true,
  message:                { success: false, message: 'Too many failed login attempts. Please try again in 15 minutes.' },
});

export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      30,
  store:    createRedisStore('upload'),
  message:  { success: false, message: 'Upload rate limit exceeded.' },
});
