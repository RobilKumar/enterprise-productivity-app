import { Router } from 'express';
import { prisma }  from '../config/database';
import { redis }   from '../config/redis';
import { authenticate } from '../middleware/auth.middleware';
import type { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const page   = Number(req.query.page)  || 1;
    const limit  = Number(req.query.limit) || 20;
    const unread = req.query.unread === 'true';

    const where: any = { userId: req.user!.userId };
    if (unread) where.isRead = false;

    const [items, total] = await prisma.$transaction([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page-1)*limit, take: limit }),
      prisma.notification.count({ where }),
    ]);
    res.json({ success: true, data: items, pagination: { page, limit, total, totalPages: Math.ceil(total/limit) } });
  } catch (err) { next(err); }
});

router.get('/unread-count', async (req: AuthRequest, res, next) => {
  try {
    const cached = await redis.get(`unread:${req.user!.userId}`).catch(() => null);
    if (cached) return res.json({ success: true, data: { count: parseInt(cached) } });
    const count  = await prisma.notification.count({ where: { userId: req.user!.userId, isRead: false } });
    await redis.setex(`unread:${req.user!.userId}`, 60, String(count));
    res.json({ success: true, data: { count } });
  } catch (err) { next(err); }
});

router.patch('/:id/read', async (req: AuthRequest, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user!.userId }, data: { isRead: true, readAt: new Date() } });
    await redis.del(`unread:${req.user!.userId}`);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.patch('/read-all', async (req: AuthRequest, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { userId: req.user!.userId, isRead: false }, data: { isRead: true, readAt: new Date() } });
    await redis.set(`unread:${req.user!.userId}`, '0');
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    await prisma.notification.deleteMany({ where: { id: req.params.id, userId: req.user!.userId } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
