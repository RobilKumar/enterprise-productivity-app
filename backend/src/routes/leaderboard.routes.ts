import { Router } from 'express';
import { prisma }  from '../config/database';
import { redis }   from '../config/redis';
import { authenticate } from '../middleware/auth.middleware';
import type { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const period = (req.query.period as string) || 'weekly';
    const teamId = req.query.teamId as string | undefined;
    const cacheKey = `leaderboard:${period}:${teamId || 'all'}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return res.json({ success: true, data: JSON.parse(cached), cached: true });

    const now = new Date();
    const week = Math.ceil((now.getDate() - now.getDay() + 7) / 7);
    const periodKey = period === 'weekly'
      ? `${now.getFullYear()}-W${String(week).padStart(2,'0')}`
      : `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    const entries = await prisma.leaderboard.findMany({
      where: { period, periodKey },
      include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, employeeId: true, team: { select: { name: true } }, totalPoints: true } } },
      orderBy: { points: 'desc' }, take: 50,
    });

    const filtered = teamId ? entries.filter((e: any) => e.user?.teamId === teamId) : entries;
    const ranked   = filtered.map((e: any, i: number) => ({ ...e, rank: i + 1 }));
    await redis.setex(cacheKey, 300, JSON.stringify(ranked));
    res.json({ success: true, data: ranked });
  } catch (err) { next(err); }
});

export default router;
