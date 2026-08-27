import { Router }  from 'express';
import { prisma }   from '../config/database';
import { authenticate, authorize, MANAGEMENT_ROLES } from '../middleware/auth.middleware';
import { withCache, invalidateKeys, TTL } from '../utils/cache';
import type { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', async (_req, res, next) => {
  try {
    const teams = await withCache('teams:all', TTL.XLONG, () =>
      prisma.team.findMany({
        where:   { isActive: true },
        include: {
          leader:     { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          department: { select: { id: true, name: true } },
          _count:     { select: { members: true, tasks: true } },
        },
        orderBy: { name: 'asc' },
      })
    );
    res.json({ success: true, data: teams });
  } catch (err) { next(err); }
});

router.post('/', authorize(...MANAGEMENT_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const team = await prisma.team.create({ data: req.body, include: { leader: true, department: true } });
    // Auto-create chat room for team
    await prisma.chatRoom.create({ data: { name: `${team.name} Chat`, isGroupChat: true, teamId: team.id } });
    await invalidateKeys('teams:all');
    res.status(201).json({ success: true, data: team });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const team = await prisma.team.findUnique({
      where:   { id: req.params.id },
      include: {
        leader:     { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        department: true,
        members: {
          where:  { deletedAt: null },
          select: { id: true, firstName: true, lastName: true, avatarUrl: true, status: true, isOnline: true, totalPoints: true, role: { select: { name: true } } },
        },
        _count: { select: { members: true, tasks: true } },
      },
    });
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
    res.json({ success: true, data: team });
  } catch (err) { next(err); }
});

router.put('/:id', authorize(...MANAGEMENT_ROLES), async (req, res, next) => {
  try {
    const team = await prisma.team.update({ where: { id: req.params.id }, data: req.body });
    await invalidateKeys('teams:all');
    res.json({ success: true, data: team });
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    await prisma.team.update({ where: { id: req.params.id }, data: { isActive: false } });
    await invalidateKeys('teams:all');
    res.json({ success: true, message: 'Team deactivated' });
  } catch (err) { next(err); }
});

// GET /teams/:id/stats
router.get('/:id/stats', async (req, res, next) => {
  try {
    const teamId = req.params.id;
    const [taskStats, attendance, workHours] = await prisma.$transaction([
      prisma.task.groupBy({ by: ['status'], where: { teamId, deletedAt: null }, _count: { _all: true }, orderBy: { status: 'asc' } }),
      prisma.attendance.groupBy({ by: ['status'],
        where: { user: { teamId }, date: { gte: new Date(Date.now() - 7 * 86400000) } },
        _count: { _all: true }, orderBy: { status: 'asc' } }),
      prisma.workTimeLog.aggregate({
        where: { user: { teamId }, startTime: { gte: new Date(Date.now() - 7 * 86400000) } },
        _sum: { durationMs: true },
      }),
    ]);
    res.json({ success: true, data: { taskStats, attendance, weeklyWorkHours: Math.round((workHours._sum.durationMs || 0) / 3600000 * 10) / 10 } });
  } catch (err) { next(err); }
});

export default router;
