import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { createAuditLog } from '../services/audit.service';
import type { AuthRequest } from '../types';

const AttendanceQuerySchema = z.object({
  page:      z.coerce.number().min(1).default(1),
  limit:     z.coerce.number().min(1).max(100).default(30),
  userId:    z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate:   z.string().optional(),
  status:    z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY', 'WEEKEND']).optional(),
});

// ─── Check In ───────────────────────────────────────────────────────────────
export async function checkIn(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { notes, latitude, longitude } = z.object({
      notes:     z.string().optional(),
      latitude:  z.number().optional(),
      longitude: z.number().optional(),
    }).parse(req.body);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.attendance.findFirst({
      where: { userId: req.user!.userId, date: today },
    });

    if (existing?.checkIn) {
      throw new AppError('Already checked in today', 400);
    }

    const now = new Date();
    // Determine if late (after 9:30 AM)
    const isLate = now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 30);

    const attendance = await prisma.attendance.upsert({
      where: { userId_date: { userId: req.user!.userId, date: today } },
      update: { checkIn: now, status: isLate ? 'LATE' : 'PRESENT', notes },
      create: {
        userId:    req.user!.userId,
        date:      today,
        checkIn:   now,
        status:    isLate ? 'LATE' : 'PRESENT',
        notes,
        latitude,
        longitude,
      },
    });

    return res.json({ success: true, data: attendance, isLate });
  } catch (err) {
    next(err);
  }
}

// ─── Check Out ──────────────────────────────────────────────────────────────
export async function checkOut(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await prisma.attendance.findFirst({
      where: { userId: req.user!.userId, date: today },
    });

    if (!attendance?.checkIn) throw new AppError('Not checked in today', 400);
    if (attendance.checkOut) throw new AppError('Already checked out', 400);

    const now = new Date();
    const workMinutes = Math.round((now.getTime() - attendance.checkIn.getTime()) / 60000);

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        checkOut:    now,
        workMinutes,
        status: workMinutes < 240 ? 'HALF_DAY' : attendance.status,
      },
    });

    return res.json({ success: true, data: updated, workHours: Math.round(workMinutes / 60 * 10) / 10 });
  } catch (err) {
    next(err);
  }
}

// ─── Get Attendance History ──────────────────────────────────────────────────
export async function getAttendance(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const query = AttendanceQuerySchema.parse(req.query);
    const { userId: currentUserId, role } = req.user!;

    // RBAC: employees can only see own records
    let targetUserId = query.userId;
    if (role === 'EMPLOYEE') targetUserId = currentUserId;

    const where: any = {};
    if (targetUserId) where.userId = targetUserId;
    if (query.status)    where.status = query.status;

    if (query.startDate || query.endDate) {
      where.date = {};
      if (query.startDate) where.date.gte = new Date(query.startDate);
      if (query.endDate)   where.date.lte = new Date(query.endDate);
    }

    const [records, total] = await prisma.$transaction([
      prisma.attendance.findMany({
        where,
        skip:    (query.page - 1) * query.limit,
        take:    query.limit,
        orderBy: { date: 'desc' },
        include: { user: { select: { id: true, firstName: true, lastName: true, employeeId: true } } },
      }),
      prisma.attendance.count({ where }),
    ]);

    return res.json({
      success: true,
      data:    records,
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Today's Status ──────────────────────────────────────────────────────────
export async function getTodayStatus(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await prisma.attendance.findFirst({
      where: { userId: req.user!.userId, date: today },
    });

    return res.json({ success: true, data: attendance });
  } catch (err) {
    next(err);
  }
}

// ─── Attendance Stats ────────────────────────────────────────────────────────
export async function getAttendanceStats(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { userId, startDate, endDate } = z.object({
      userId:    z.string().uuid().optional(),
      startDate: z.string().optional(),
      endDate:   z.string().optional(),
    }).parse(req.query);

    const targetId = (req.user!.role === 'EMPLOYEE') ? req.user!.userId : (userId || req.user!.userId);

    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(1));
    const end   = endDate   ? new Date(endDate)   : new Date();

    const stats = await prisma.attendance.groupBy({
      by:    ['status'],
      where: { userId: targetId, date: { gte: start, lte: end } },
      _count: { _all: true },
    });

    const totalDays     = stats.reduce((s, r) => s + r._count._all, 0);
    const presentDays   = stats.find(s => s.status === 'PRESENT')?._count._all  || 0;
    const lateDays      = stats.find(s => s.status === 'LATE')?._count._all     || 0;
    const absentDays    = stats.find(s => s.status === 'ABSENT')?._count._all   || 0;
    const leaveDays     = stats.find(s => s.status === 'ON_LEAVE')?._count._all || 0;

    const workHoursAgg = await prisma.attendance.aggregate({
      where: { userId: targetId, date: { gte: start, lte: end } },
      _avg:  { workMinutes: true },
      _sum:  { workMinutes: true },
    });

    return res.json({
      success: true,
      data: {
        totalDays, presentDays, lateDays, absentDays, leaveDays,
        attendanceRate: totalDays > 0 ? Math.round(((presentDays + lateDays) / totalDays) * 100) : 0,
        avgWorkHours:   Math.round(((workHoursAgg._avg.workMinutes || 0) / 60) * 10) / 10,
        totalWorkHours: Math.round(((workHoursAgg._sum.workMinutes || 0) / 60) * 10) / 10,
        breakdown:      stats,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Admin: Override Attendance ──────────────────────────────────────────────
export async function overrideAttendance(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(req.user!.role)) {
      throw new AppError('Insufficient permissions', 403);
    }

    const { userId, date, status, checkIn, checkOut, notes } = z.object({
      userId:   z.string().uuid(),
      date:     z.string(),
      status:   z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY']),
      checkIn:  z.string().datetime().optional(),
      checkOut: z.string().datetime().optional(),
      notes:    z.string().optional(),
    }).parse(req.body);

    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);

    const record = await prisma.attendance.upsert({
      where: { userId_date: { userId, date: dateObj } },
      update: { status, checkIn: checkIn ? new Date(checkIn) : undefined, checkOut: checkOut ? new Date(checkOut) : undefined, notes, isOverride: true },
      create: { userId, date: dateObj, status, checkIn: checkIn ? new Date(checkIn) : undefined, checkOut: checkOut ? new Date(checkOut) : undefined, notes, isOverride: true },
    });

    await createAuditLog({ userId: req.user!.userId, action: 'OVERRIDE_ATTENDANCE', entity: 'Attendance', entityId: record.id, newData: { userId, date, status }, req });

    return res.json({ success: true, data: record });
  } catch (err) {
    next(err);
  }
}
