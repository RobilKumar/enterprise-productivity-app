import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { NotificationService } from '../services/notification.service';
import { createAuditLog } from '../services/audit.service';
import type { AuthRequest } from '../types';

const CreateLeaveSchema = z.object({
  type:      z.enum(['ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'UNPAID', 'EMERGENCY', 'OTHER']),
  startDate: z.string(),
  endDate:   z.string(),
  reason:    z.string().min(5).max(500),
  isHalfDay: z.boolean().default(false),
});

// ─── Apply for Leave ─────────────────────────────────────────────────────────
export async function applyLeave(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const body = CreateLeaveSchema.parse(req.body);

    const start = new Date(body.startDate);
    const end   = new Date(body.endDate);
    if (end < start) throw new AppError('End date must be after start date', 400);

    // Check overlapping leaves
    const overlap = await prisma.leaveRequest.findFirst({
      where: {
        userId:    req.user!.userId,
        status:    { notIn: ['REJECTED', 'CANCELLED'] },
        OR: [
          { startDate: { lte: end   }, endDate: { gte: start } },
        ],
      },
    });
    if (overlap) throw new AppError('Overlapping leave request exists', 409);

    // Calculate working days
    const workingDays = calculateWorkingDays(start, end);

    // Check leave balance
    const balance = await prisma.leaveBalance.findFirst({
      where: { userId: req.user!.userId, leaveType: body.type, year: new Date().getFullYear() },
    });
    if (balance && balance.remaining < workingDays) {
      throw new AppError(`Insufficient ${body.type} leave balance. Available: ${balance.remaining} days`, 400);
    }

    const leave = await prisma.leaveRequest.create({
      data: {
        userId:      req.user!.userId,
        type:        body.type,
        startDate:   start,
        endDate:     end,
        reason:      body.reason,
        isHalfDay:   body.isHalfDay,
        workingDays,
      },
      include: { user: { select: { firstName: true, lastName: true, teamId: true } } },
    });

    // Notify manager/admin
    const managers = await prisma.user.findMany({
      where: { role: { name: { in: ['ADMIN', 'MANAGER'] } }, deletedAt: null },
      select: { id: true, fcmToken: true },
    });

    for (const mgr of managers) {
      await NotificationService.send({
        userId: mgr.id,
        type:   'LEAVE_REQUEST',
        title:  'New Leave Request',
        body:   `${leave.user.firstName} ${leave.user.lastName} applied for ${body.type} leave`,
        data:   { leaveId: leave.id },
        fcmToken: mgr.fcmToken || undefined,
      });
    }

    return res.status(201).json({ success: true, data: leave });
  } catch (err) {
    next(err);
  }
}

// ─── Get Leave Requests ──────────────────────────────────────────────────────
export async function getLeaves(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { page, limit, status, userId, type } = z.object({
      page:   z.coerce.number().default(1),
      limit:  z.coerce.number().default(20),
      status: z.string().optional(),
      userId: z.string().uuid().optional(),
      type:   z.string().optional(),
    }).parse(req.query);

    const where: any = {};
    if (req.user!.role === 'EMPLOYEE') {
      where.userId = req.user!.userId;
    } else if (userId) {
      where.userId = userId;
    }
    if (status) where.status = status;
    if (type)   where.type   = type;

    const [leaves, total] = await prisma.$transaction([
      prisma.leaveRequest.findMany({
        where,
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user:       { select: { id: true, firstName: true, lastName: true, employeeId: true, avatarUrl: true } },
          approvedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.leaveRequest.count({ where }),
    ]);

    return res.json({
      success: true, data: leaves,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Approve / Reject Leave ──────────────────────────────────────────────────
export async function reviewLeave(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(req.user!.role)) {
      throw new AppError('Insufficient permissions', 403);
    }

    const { id } = req.params;
    const { status, rejectionReason } = z.object({
      status:          z.enum(['APPROVED', 'REJECTED']),
      rejectionReason: z.string().optional(),
    }).parse(req.body);

    if (status === 'REJECTED' && !rejectionReason) {
      throw new AppError('Rejection reason is required', 400);
    }

    const leave = await prisma.leaveRequest.findUnique({ where: { id }, include: { user: true } });
    if (!leave) throw new AppError('Leave request not found', 404);
    if (leave.status !== 'PENDING') throw new AppError('Leave request already reviewed', 400);

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status,
        approvedById:    req.user!.userId,
        approvedAt:      new Date(),
        rejectionReason: status === 'REJECTED' ? rejectionReason : undefined,
      },
    });

    // If approved, deduct from balance and mark attendance as leave
    if (status === 'APPROVED') {
      await prisma.leaveBalance.updateMany({
        where: { userId: leave.userId, leaveType: leave.type, year: new Date().getFullYear() },
        data:  { used: { increment: leave.workingDays }, remaining: { decrement: leave.workingDays } },
      });

      // Mark attendance as ON_LEAVE for the period
      const dates = getDatesBetween(leave.startDate, leave.endDate);
      for (const date of dates) {
        if (!isWeekend(date)) {
          await prisma.attendance.upsert({
            where:  { userId_date: { userId: leave.userId, date } },
            update: { status: 'ON_LEAVE' },
            create: { userId: leave.userId, date, status: 'ON_LEAVE' },
          });
        }
      }
    }

    // Notify employee
    await NotificationService.send({
      userId: leave.userId,
      type:   'LEAVE_REVIEWED',
      title:  `Leave ${status.charAt(0) + status.slice(1).toLowerCase()}`,
      body:   status === 'APPROVED'
        ? `Your ${leave.type} leave has been approved`
        : `Your ${leave.type} leave was rejected: ${rejectionReason}`,
      data: { leaveId: id },
    });

    await createAuditLog({ userId: req.user!.userId, action: `LEAVE_${status}`, entity: 'LeaveRequest', entityId: id, req });

    return res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// ─── Cancel Leave ────────────────────────────────────────────────────────────
export async function cancelLeave(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const leave = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!leave) throw new AppError('Leave request not found', 404);
    if (leave.userId !== req.user!.userId && !['SUPER_ADMIN', 'ADMIN'].includes(req.user!.role)) {
      throw new AppError('Cannot cancel another user\'s leave', 403);
    }
    if (!['PENDING', 'APPROVED'].includes(leave.status)) {
      throw new AppError('Cannot cancel this leave request', 400);
    }

    await prisma.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' } });

    // Restore balance if was approved
    if (leave.status === 'APPROVED') {
      await prisma.leaveBalance.updateMany({
        where: { userId: leave.userId, leaveType: leave.type, year: new Date().getFullYear() },
        data:  { used: { decrement: leave.workingDays }, remaining: { increment: leave.workingDays } },
      });
    }

    return res.json({ success: true, message: 'Leave cancelled successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── Get Leave Balance ───────────────────────────────────────────────────────
export async function getLeaveBalance(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const targetId = (req.user!.role === 'EMPLOYEE')
      ? req.user!.userId
      : (req.query.userId as string || req.user!.userId);

    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    const balances = await prisma.leaveBalance.findMany({
      where: { userId: targetId, year },
    });

    return res.json({ success: true, data: balances });
  } catch (err) {
    next(err);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function calculateWorkingDays(start: Date, end: Date): number {
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function getDatesBetween(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}
