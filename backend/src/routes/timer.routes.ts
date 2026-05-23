import { Router } from 'express';
import { prisma }  from '../config/database';
import { redis }   from '../config/redis';
import { authenticate } from '../middleware/auth.middleware';
import type { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.post('/start', async (req: AuthRequest, res, next) => {
  try {
    const { taskId } = req.body;
    const key = `timer:${req.user!.userId}:${taskId}`;
    const existing = await redis.get(key);
    if (existing) return res.status(400).json({ success: false, message: 'Timer already running for this task' });
    await redis.setex(key, 86400, Date.now().toString());
    res.json({ success: true, data: { taskId, startTime: Date.now() } });
  } catch (err) { next(err); }
});

router.post('/pause', async (req: AuthRequest, res, next) => {
  try {
    const { taskId } = req.body;
    const key = `timer:${req.user!.userId}:${taskId}`;
    const startStr = await redis.get(key);
    if (!startStr) return res.status(400).json({ success: false, message: 'No timer running' });
    const elapsed = Date.now() - parseInt(startStr, 10);
    await redis.del(key);
    await redis.setex(`timer_paused:${req.user!.userId}:${taskId}`, 86400, String(elapsed));
    res.json({ success: true, data: { taskId, elapsed } });
  } catch (err) { next(err); }
});

router.post('/stop', async (req: AuthRequest, res, next) => {
  try {
    const { taskId } = req.body;
    const key = `timer:${req.user!.userId}:${taskId}`;
    const startStr = await redis.get(key);
    if (!startStr) return res.status(400).json({ success: false, message: 'No timer running for this task' });
    const durationMs = Date.now() - parseInt(startStr, 10);
    await redis.del(key);
    const log = await prisma.workTimeLog.create({ data: { userId: req.user!.userId, taskId, startTime: new Date(parseInt(startStr,10)), endTime: new Date(), durationMs: Math.round(durationMs) } });
    const totalMs = await prisma.workTimeLog.aggregate({ where: { taskId }, _sum: { durationMs: true } });
    await prisma.task.update({ where: { id: taskId }, data: { actualHours: (totalMs._sum.durationMs || 0) / 3600000 } });
    res.json({ success: true, data: { ...log, durationMs } });
  } catch (err) { next(err); }
});

router.get('/active', async (req: AuthRequest, res, next) => {
  try {
    const keys = await redis.keys(`timer:${req.user!.userId}:*`);
    const active = [];
    for (const key of keys) {
      const start = await redis.get(key);
      const taskId = key.split(':')[2];
      if (start) active.push({ taskId, startTime: parseInt(start), elapsed: Date.now() - parseInt(start) });
    }
    res.json({ success: true, data: active });
  } catch (err) { next(err); }
});

router.get('/logs', async (req: AuthRequest, res, next) => {
  try {
    const page = Number(req.query.page) || 1; const limit = Number(req.query.limit) || 20;
    const taskId = req.query.taskId as string | undefined;
    const where: any = { userId: req.user!.userId };
    if (taskId) where.taskId = taskId;
    const [logs, total] = await prisma.$transaction([
      prisma.workTimeLog.findMany({ where, orderBy: { startTime: 'desc' }, skip: (page-1)*limit, take: limit, include: { task: { select: { title: true } } } }),
      prisma.workTimeLog.count({ where }),
    ]);
    res.json({ success: true, data: logs, pagination: { page, limit, total, totalPages: Math.ceil(total/limit) } });
  } catch (err) { next(err); }
});

export default router;
