import { Router } from 'express';
import { prisma }  from '../config/database';
import { authenticate, authorize, MANAGEMENT_ROLES } from '../middleware/auth.middleware';
import type { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

// POST /attendance/checkin
router.post('/checkin', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const today  = new Date(); today.setHours(0, 0, 0, 0);

    const existing = await prisma.attendance.findFirst({ where: { userId, date: today } });
    if (existing?.checkInTime) return res.status(400).json({ success: false, message: 'Already checked in today' });

    const shiftStart = new Date(today); shiftStart.setHours(9, 0, 0, 0);
    const isLate = new Date() > shiftStart;

    const attendance = await prisma.attendance.upsert({
      where:  { userId_date: { userId, date: today } },
      create: { userId, date: today, checkInTime: new Date(), status: isLate ? 'LATE' : 'PRESENT', isLate },
      update: { checkInTime: new Date(), status: isLate ? 'LATE' : 'PRESENT', isLate },
    });
    res.json({ success: true, data: attendance });
  } catch (err) { next(err); }
});

// POST /attendance/checkout
router.post('/checkout', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const today  = new Date(); today.setHours(0, 0, 0, 0);

    const record = await prisma.attendance.findFirst({ where: { userId, date: today } });
    if (!record?.checkInTime)  return res.status(400).json({ success: false, message: 'Please check in first' });
    if (record.checkOutTime)   return res.status(400).json({ success: false, message: 'Already checked out today' });

    const hours = (new Date().getTime() - record.checkInTime.getTime()) / 3600000;
    const updated = await prisma.attendance.update({
      where: { id: record.id },
      data:  { checkOutTime: new Date(), totalWorkHours: Math.round(hours * 100) / 100, status: hours < 4 ? 'HALF_DAY' : record.status },
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// GET /attendance/my
router.get('/my', async (req: AuthRequest, res, next) => {
  try {
    const page      = Number(req.query.page)  || 1;
    const limit     = Number(req.query.limit) || 31;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(new Date().setDate(1));
    const endDate   = req.query.endDate   ? new Date(req.query.endDate   as string) : new Date();
    const [records, stats] = await prisma.$transaction([
      prisma.attendance.findMany({ where: { userId: req.user!.userId, date: { gte: startDate, lte: endDate } }, orderBy: { date: 'desc' }, skip: (page-1)*limit, take: limit }),
      prisma.attendance.groupBy({ by: ['status'], where: { userId: req.user!.userId, date: { gte: startDate, lte: endDate } }, _count: { _all: true }, orderBy: { status: 'asc' } }),
    ]);
    res.json({ success: true, data: records, stats });
  } catch (err) { next(err); }
});

// GET /attendance/summary
router.get('/summary', authorize(...MANAGEMENT_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const date = req.query.date ? new Date(req.query.date as string) : new Date();
    date.setHours(0, 0, 0, 0);
    const stats = await prisma.attendance.groupBy({ by: ['status'], where: { date }, _count: { _all: true } });
    const totalActive = await prisma.user.count({ where: { deletedAt: null, status: 'ACTIVE' } });
    res.json({ success: true, data: { date, stats, totalActive } });
  } catch (err) { next(err); }
});

// GET /attendance
router.get('/', authorize(...MANAGEMENT_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const page   = Number(req.query.page)  || 1;
    const limit  = Number(req.query.limit) || 50;
    const date   = req.query.date ? new Date(req.query.date as string) : new Date();
    date.setHours(0, 0, 0, 0);
    const where: any = { date };
    if (req.query.teamId)  where.user = { teamId: req.query.teamId };
    if (req.query.status)  where.status = req.query.status;
    const [records, total] = await prisma.$transaction([
      prisma.attendance.findMany({ where, include: { user: { select: { id: true, firstName: true, lastName: true, employeeId: true, avatarUrl: true, team: { select: { name: true } } } } }, orderBy: { checkInTime: 'asc' }, skip: (page-1)*limit, take: limit }),
      prisma.attendance.count({ where }),
    ]);
    res.json({ success: true, data: records, pagination: { page, limit, total, totalPages: Math.ceil(total/limit) } });
  } catch (err) { next(err); }
});

// PATCH /attendance/:id — admin correction
router.patch('/:id', authorize(...MANAGEMENT_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const { status, checkInTime, checkOutTime, adminNote } = req.body;
    const record = await prisma.attendance.update({
      where: { id: req.params.id },
      data: { status, adminNote, isCorrected: true, correctedById: req.user!.userId,
        checkInTime:  checkInTime  ? new Date(checkInTime)  : undefined,
        checkOutTime: checkOutTime ? new Date(checkOutTime) : undefined,
      },
    });
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
});

export default router;
