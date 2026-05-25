import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { z } from 'zod';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { sendEmail } from '../services/email.service';
import { createAuditLog } from '../services/audit.service';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import type { AuthRequest } from '../types';

// ─── Zod Schemas ─────────────────────────────────────────────
const LoginSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  password:   z.string().min(6),
});

const RegisterSchema = z.object({
  firstName:    z.string().min(1).max(100),
  lastName:     z.string().min(1).max(100),
  email:        z.string().email(),
  phone:        z.string().optional(),
  password:     z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/,
                  'Password must contain uppercase, lowercase, number and special character'),
  roleId:       z.string().uuid(),
  departmentId: z.string().uuid().optional(),
  teamId:       z.string().uuid().optional(),
  // Super admin can supply a custom Employee ID; if omitted, one is auto-generated
  employeeId:   z.string().min(1).max(20).optional(),
});

const RefreshSchema = z.object({ refreshToken: z.string() });
const OtpSchema     = z.object({ email: z.string().email(), otp: z.string().length(6) });
const ResetSchema   = z.object({
  email:       z.string().email(),
  otp:         z.string().length(6),
  newPassword: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}/),
});

// ─── Helper: Generate tokens ──────────────────────────────────
function signAccessToken(payload: Record<string, unknown>): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: (process.env.JWT_EXPIRES_IN || '15m') as any,
    algorithm: 'HS256',
  });
}

function signRefreshToken(payload: Record<string, unknown>): string {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any,
    algorithm: 'HS256',
  });
}

// ─── Login ───────────────────────────────────────────────────
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { employeeId, password } = LoginSchema.parse(req.body);

    // Look up by employeeId (case-insensitive, trimmed)
    const user = await prisma.user.findFirst({
      where: { employeeId: { equals: employeeId.trim().toUpperCase(), mode: 'insensitive' }, deletedAt: null },
      include: { role: true },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new AppError('Invalid Employee ID or password', 401);
    }

    if (user.status === 'SUSPENDED') {
      throw new AppError('Account suspended. Contact your administrator.', 403);
    }
    if (user.status === 'INACTIVE') {
      throw new AppError('Account inactive. Contact your administrator.', 403);
    }

    // 2FA check
    if (user.twoFactorEnabled) {
      const tempToken = jwt.sign(
        { userId: user.id, purpose: '2fa' },
        process.env.JWT_SECRET!,
        { expiresIn: '5m' }
      );
      return res.json({ success: true, requires2FA: true, tempToken });
    }

    const tokenPayload = { userId: user.id, role: user.role.name, email: user.email };
    const accessToken  = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken({ userId: user.id });

    // Store refresh token in DB
    await prisma.refreshToken.create({
      data: {
        userId:    user.id,
        token:     refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data:  { lastLoginAt: new Date(), isOnline: true },
    });

    // Activity log
    await prisma.activityLog.create({
      data: { userId: user.id, event: 'LOGIN', metadata: JSON.stringify({ ip: req.ip }) },
    });

    // Cache user session in Redis
    await redis.setex(`session:${user.id}`, 900, JSON.stringify(tokenPayload));

    await createAuditLog({ userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id, req });

    return res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id:         user.id,
          employeeId: user.employeeId,
          firstName:  user.firstName,
          lastName:   user.lastName,
          email:      user.email,
          role:       user.role.name,
          avatarUrl:  user.avatarUrl,
          permissions: user.role.permissions,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Refresh Token ────────────────────────────────────────────
export async function refreshToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = RefreshSchema.parse(req.body);

    let payload: any;
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!);
    } catch {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    const storedToken = await prisma.refreshToken.findFirst({
      where: { token: refreshToken, isRevoked: false, expiresAt: { gt: new Date() } },
    });

    if (!storedToken) throw new AppError('Refresh token not found or revoked', 401);

    const user = await prisma.user.findFirst({
      where: { id: payload.userId, deletedAt: null },
      include: { role: true },
    });

    if (!user) throw new AppError('User not found', 401);

    const tokenPayload = { userId: user.id, role: user.role.name, email: user.email };
    const newAccess  = signAccessToken(tokenPayload);
    const newRefresh = signRefreshToken({ userId: user.id });

    // Rotate: revoke old, create new
    await prisma.refreshToken.update({ where: { id: storedToken.id }, data: { isRevoked: true } });
    await prisma.refreshToken.create({
      data: {
        userId:    user.id,
        token:     newRefresh,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    await redis.setex(`session:${user.id}`, 900, JSON.stringify(tokenPayload));

    return res.json({ success: true, data: { accessToken: newAccess, refreshToken: newRefresh } });
  } catch (err) {
    next(err);
  }
}

// ─── Logout ──────────────────────────────────────────────────
export async function logout(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken, userId: req.user!.userId },
        data:  { isRevoked: true },
      });
    }

    await prisma.user.update({
      where: { id: req.user!.userId },
      data:  { isOnline: false },
    });

    await redis.del(`session:${req.user!.userId}`);

    await prisma.activityLog.create({
      data: { userId: req.user!.userId, event: 'LOGOUT', metadata: JSON.stringify({ ip: req.ip }) },
    });

    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── Forgot Password — Send OTP ───────────────────────────────
export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);

    const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });

    // Always return success to prevent user enumeration
    if (!user) {
      return res.json({ success: true, message: 'If the email exists, OTP has been sent.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + Number(process.env.OTP_EXPIRES_MINUTES || 10) * 60000);

    await prisma.otpRecord.create({
      data: { userId: user.id, otp, purpose: 'password_reset', expiresAt },
    });

    await sendEmail({
      to:      user.email,
      subject: 'Password Reset OTP',
      html: `
        <h2>Password Reset Request</h2>
        <p>Your OTP is: <strong style="font-size:24px;letter-spacing:4px">${otp}</strong></p>
        <p>This OTP expires in ${process.env.OTP_EXPIRES_MINUTES || 10} minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
    });

    logger.info(`OTP sent to ${email}`);
    return res.json({ success: true, message: 'If the email exists, OTP has been sent.' });
  } catch (err) {
    next(err);
  }
}

// ─── Verify OTP ──────────────────────────────────────────────
export async function verifyOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, otp } = OtpSchema.parse(req.body);

    const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
    if (!user) throw new AppError('Invalid OTP', 400);

    const otpRecord = await prisma.otpRecord.findFirst({
      where: {
        userId: user.id, otp, purpose: 'password_reset',
        isUsed: false, expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) throw new AppError('Invalid or expired OTP', 400);

    await prisma.otpRecord.update({ where: { id: otpRecord.id }, data: { isUsed: true } });

    // Return a short-lived reset token
    const resetToken = jwt.sign(
      { userId: user.id, purpose: 'password_reset' },
      process.env.JWT_SECRET!,
      { expiresIn: '10m' }
    );

    return res.json({ success: true, data: { resetToken } });
  } catch (err) {
    next(err);
  }
}

// ─── Reset Password ──────────────────────────────────────────
export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { newPassword } = z.object({ newPassword: z.string().min(8) }).parse(req.body);
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new AppError('Reset token required', 400);

    const token = authHeader.replace('Bearer ', '');
    let payload: any;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET!);
    } catch {
      throw new AppError('Invalid or expired reset token', 400);
    }

    if (payload.purpose !== 'password_reset') throw new AppError('Invalid token purpose', 400);

    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: payload.userId },
      data:  { passwordHash: hash },
    });

    // Revoke all existing refresh tokens
    await prisma.refreshToken.updateMany({
      where: { userId: payload.userId },
      data:  { isRevoked: true },
    });

    await createAuditLog({ userId: payload.userId, action: 'PASSWORD_RESET', entity: 'User', entityId: payload.userId, req });

    return res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── Register (Admin only) ────────────────────────────────────
export async function register(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const body = RegisterSchema.parse(req.body);

    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) throw new AppError('Email already registered', 409);

    const hash = await bcrypt.hash(body.password, 12);

    // Use supplied Employee ID or auto-generate one
    let employeeId = body.employeeId?.trim().toUpperCase();
    if (!employeeId) {
      const count = await prisma.user.count();
      employeeId = `EMP${String(count + 1).padStart(5, '0')}`;
    } else {
      // Ensure uniqueness of custom ID
      const idExists = await prisma.user.findUnique({ where: { employeeId } });
      if (idExists) throw new AppError(`Employee ID "${employeeId}" is already taken`, 409);
    }

    // Destructure to exclude 'password' — Prisma model has passwordHash, not password
    const { password: _pw, ...userFields } = body;

    const user = await prisma.user.create({
      data: {
        ...userFields,
        employeeId,
        passwordHash: hash,
        joiningDate: new Date(),
      },
      include: { role: true },
    });

    await createAuditLog({
      userId:   req.user!.userId,
      action:   'CREATE_USER',
      entity:   'User',
      entityId: user.id,
      newData:  { email: user.email, role: user.role.name },
      req,
    });

    return res.status(201).json({
      success: true,
      data: {
        id:         user.id,
        employeeId: user.employeeId,
        firstName:  user.firstName,
        lastName:   user.lastName,
        email:      user.email,
        role:       user.role.name,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Get current user profile ─────────────────────────────────
export async function getMe(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.user!.userId, deletedAt: null },
      include: {
        role:       true,
        department: true,
        team:       { include: { leader: { select: { id: true, firstName: true, lastName: true } } } },
        badges:     { include: { badge: true } },
      },
    });

    if (!user) throw new AppError('User not found', 404);

    // Sanitize
    const { passwordHash, twoFactorSecret, ...safeUser } = user as any;
    return res.json({ success: true, data: safeUser });
  } catch (err) {
    next(err);
  }
}
