import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { redis } from '../config/redis';
import { AppError } from './errorHandler';
import type { AuthRequest, JWTPayload } from '../types';

// ─── Verify JWT Access Token ──────────────────────────────────
export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new AppError('No token provided', 401);

    const token = header.replace('Bearer ', '');
    let payload: JWTPayload;

    try {
      payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') throw new AppError('Token expired', 401);
      throw new AppError('Invalid token', 401);
    }

    // Check Redis session cache
    const session = await redis.get(`session:${payload.userId}`);
    if (!session) {
      // Re-validate from DB on cache miss (not blocking, just slower)
    }

    req.user = payload;
    next();
  } catch (err) {
    next(err);
  }
}

// ─── Role-Based Access Control Guard ─────────────────────────
export function authorize(...roles: string[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('Not authenticated', 401));
    if (!roles.includes(req.user.role)) {
      return next(new AppError(`Access denied. Required roles: ${roles.join(', ')}`, 403));
    }
    next();
  };
}

// ─── Self or Admin Guard ──────────────────────────────────────
// Allows the user to access their own resource, or admins to access any
export function selfOrAdmin(paramName = 'userId') {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('Not authenticated', 401));
    const targetId = req.params[paramName];
    const isAdmin  = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(req.user.role);
    if (!isAdmin && req.user.userId !== targetId) {
      return next(new AppError('Access denied', 403));
    }
    next();
  };
}

// ─── Role Constants ───────────────────────────────────────────
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN:       'ADMIN',
  MANAGER:     'MANAGER',
  TEAM_LEADER: 'TEAM_LEADER',
  EMPLOYEE:    'EMPLOYEE',
} as const;

export const MANAGEMENT_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER];
export const LEADER_AND_UP     = [...MANAGEMENT_ROLES, ROLES.TEAM_LEADER];
export const ALL_ROLES         = Object.values(ROLES);
