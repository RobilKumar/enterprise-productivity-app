import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate, authorize, MANAGEMENT_ROLES } from '../middleware/auth.middleware';
import type { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/my', async (req: AuthRequest, res, next) => {
  try {
    const page = Number(req.query.page) || 1; const limit = Number(req.query.limit) || 30;
    const items = await prisma.dailySummary.findMany({ where: { userId: req.user!.userId }, orderBy: { date: 'desc' }, skip: (page-1)*limit, take: limit });
    res.json({ success: true, data: items });
  } catch (err) { next(err); }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const existing = await prisma.dailySummary.findFirst({ where: { userId: req.user!.userId, date: today } });
    const data = { userId: req.user!.userId, date: today, ...req.body };
    const summary = existing
      ? await prisma.dailySummary.update({ where: { id: existing.id }, data })
      : await prisma.dailySummary.create({ data });
    res.status(201).json({ success: true, data: summary });
  } catch (err) { next(err); }
});

router.get('/', authorize(...MANAGEMENT_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const page = Number(req.query.page) || 1; const limit = Number(req.query.limit) || 50;
    const date = req.query.date ? new Date(req.query.date as string) : new Date();
    date.setHours(0,0,0,0);
    const items = await prisma.dailySummary.findMany({ where: { date }, orderBy: { createdAt: 'desc' }, skip: (page-1)*limit, take: limit,
      include: { user: { select: { id: true, firstName: true, lastName: true, team: { select: { name: true } } } } } });
    res.json({ success: true, data: items });
  } catch (err) { next(err); }
});

export default router;
