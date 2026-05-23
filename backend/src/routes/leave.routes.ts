import { Router } from 'express';
import { z }       from 'zod';
import { prisma }  from '../config/database';
import { authenticate, authorize, MANAGEMENT_ROLES } from '../middleware/auth.middleware';
import { NotificationService } from '../services/notification.service';
import type { AuthRequest }    from '../types';

const router = Router();
router.use(authenticate);

const CreateLeaveSchema = z.object({
  type:      z.enum(['ANNUAL','SICK','CASUAL','MATERNITY','PATERNITY','UNPAID','OTHER']),
  startDate: z.string(),
  endDate:   z.string(),
  reason:    z.string().min(10).max(500),
  isHalfDay: z.boolean().default(false),
});

router.get('/my', async (req: AuthRequest, res, next) => {
  try {
    const page = Number(req.query.page) || 1; const limit = Number(req.query.limit) || 20;
    const [leaves, total] = await prisma.$transaction([
      prisma.leaveRequest.findMany({ where: { userId: req.user!.userId }, orderBy: { createdAt: 'desc' }, skip: (page-1)*limit, take: limit,
        include: { reviewer: { select: { firstName: true, lastName: true } } } }),
      prisma.leaveRequest.count({ where: { userId: req.user!.userId } }),
    ]);
    res.json({ success: true, data: leaves, pagination: { page, limit, total, totalPages: Math.ceil(total/limit) } });
  } catch (err) { next(err); }
});

router.get('/', authorize(...MANAGEMENT_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const page = Number(req.query.page) || 1; const limit = Number(req.query.limit) || 20;
    const where: any = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.teamId) where.user   = { teamId: req.query.teamId };
    const [leaves, total] = await prisma.$transaction([
      prisma.leaveRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page-1)*limit, take: limit,
        include: {
          user:     { select: { id: true, firstName: true, lastName: true, employeeId: true, team: { select: { name: true } } } },
          reviewer: { select: { firstName: true, lastName: true } },
        } }),
      prisma.leaveRequest.count({ where }),
    ]);
    res.json({ success: true, data: leaves, pagination: { page, limit, total, totalPages: Math.ceil(total/limit) } });
  } catch (err) { next(err); }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const body      = CreateLeaveSchema.parse(req.body);
    const userId    = req.user!.userId;
    const startDate = new Date(body.startDate);
    const endDate   = new Date(body.endDate);
    if (startDate > endDate) return res.status(400).json({ success: false, message: 'Start must be before end date' });

    const overlap = await prisma.leaveRequest.findFirst({ where: { userId, status: { in: ['PENDING','APPROVED'] }, OR: [{ startDate: { lte: endDate }, endDate: { gte: startDate } }] } });
    if (overlap) return res.status(400).json({ success: false, message: 'Overlapping leave request exists' });

    const days  = Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
    const leave = await prisma.leaveRequest.create({ data: { userId, ...body, startDate, endDate, totalDays: body.isHalfDay ? 0.5 : days } });

    const managers = await prisma.user.findMany({ where: { role: { name: { in: ['ADMIN','MANAGER','TEAM_LEADER'] } }, deletedAt: null }, select: { id: true } });
    await NotificationService.broadcast(managers.map(m => m.id), 'LEAVE_REQUEST', '📋 New Leave Request', `New ${body.type} leave request submitted`, { leaveId: leave.id });

    res.status(201).json({ success: true, data: leave });
  } catch (err) { next(err); }
});

router.patch('/:id/review', authorize(...MANAGEMENT_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const { status, reviewNote } = z.object({ status: z.enum(['APPROVED','REJECTED']), reviewNote: z.string().optional() }).parse(req.body);
    const leave = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data:  { status, reviewNote, reviewedById: req.user!.userId, reviewedAt: new Date() },
    });
    await NotificationService.send({ userId: leave.userId, type: 'LEAVE_REVIEW', title: status === 'APPROVED' ? '✅ Leave Approved' : '❌ Leave Rejected', body: `Your ${leave.type} leave has been ${status.toLowerCase()}.${reviewNote ? ` Note: ${reviewNote}` : ''}`, data: { leaveId: leave.id } });
    res.json({ success: true, data: leave });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const leave = await prisma.leaveRequest.findFirst({ where: { id: req.params.id, userId: req.user!.userId } });
    if (!leave)                    return res.status(404).json({ success: false, message: 'Not found' });
    if (leave.status !== 'PENDING') return res.status(400).json({ success: false, message: 'Only pending requests can be cancelled' });
    await prisma.leaveRequest.update({ where: { id: req.params.id }, data: { status: 'CANCELLED' } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
