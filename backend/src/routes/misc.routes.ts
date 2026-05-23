// ════════════════════════════════════════════════════════════
// routes/review.routes.ts  — Performance reviews
// ════════════════════════════════════════════════════════════
import { Router as ReviewRouter } from 'express';
import { z as rz }  from 'zod';
import { prisma as rp } from '../config/database';
import { authenticate as ra, authorize as rz2, MANAGEMENT_ROLES as RM } from '../middleware/auth.middleware';
import type { AuthRequest as RAR } from '../types';

const reviewRouter = ReviewRouter();
reviewRouter.use(ra);

reviewRouter.get('/', rz2(...RM), async (req: RAR, res, next) => {
  try {
    const page = Number(req.query.page) || 1; const limit = Number(req.query.limit) || 20;
    const userId = req.query.userId as string | undefined;
    const where: any = {}; if (userId) where.userId = userId;
    const [items, total] = await rp.$transaction([
      rp.performanceReview.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page-1)*limit, take: limit,
        include: { user: { select: { firstName: true, lastName: true, employeeId: true } }, reviewer: { select: { firstName: true, lastName: true } } } }),
      rp.performanceReview.count({ where }),
    ]);
    res.json({ success: true, data: items, pagination: { page, limit, total, totalPages: Math.ceil(total/limit) } });
  } catch (err) { next(err); }
});

reviewRouter.get('/my', async (req: RAR, res, next) => {
  try {
    const items = await rp.performanceReview.findMany({ where: { userId: req.user!.userId }, orderBy: { createdAt: 'desc' },
      include: { reviewer: { select: { firstName: true, lastName: true } } } });
    res.json({ success: true, data: items });
  } catch (err) { next(err); }
});

reviewRouter.post('/', rz2(...RM), async (req: RAR, res, next) => {
  try {
    const body = rz.object({
      userId:          rz.string().uuid(),
      period:          rz.string(),
      overallScore:    rz.number().min(1).max(5),
      productivityScore: rz.number().min(1).max(5).optional(),
      qualityScore:    rz.number().min(1).max(5).optional(),
      attendanceScore: rz.number().min(1).max(5).optional(),
      teamworkScore:   rz.number().min(1).max(5).optional(),
      comments:        rz.string().optional(),
      goals:           rz.string().optional(),
      status:          rz.enum(['DRAFT','SUBMITTED','ACKNOWLEDGED']).default('SUBMITTED'),
    }).parse(req.body);
    const review = await rp.performanceReview.create({ data: { ...body, reviewerId: req.user!.userId } });
    res.status(201).json({ success: true, data: review });
  } catch (err) { next(err); }
});

reviewRouter.patch('/:id/acknowledge', async (req: RAR, res, next) => {
  try {
    const r = await rp.performanceReview.updateMany({ where: { id: req.params.id, userId: req.user!.userId }, data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() } });
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
});

export { reviewRouter as default };

// ════════════════════════════════════════════════════════════
// routes/shift.routes.ts
// ════════════════════════════════════════════════════════════
import { Router as ShiftRouter } from 'express';
import { prisma as sp } from '../config/database';
import { authenticate as sa, authorize as sz, MANAGEMENT_ROLES as SM } from '../middleware/auth.middleware';
import type { AuthRequest as SAR } from '../types';

const shiftRouter = ShiftRouter();
shiftRouter.use(sa);

shiftRouter.get('/', async (_req, res, next) => {
  try {
    const shifts = await sp.shift.findMany({ orderBy: { name: 'asc' } });
    res.json({ success: true, data: shifts });
  } catch (err) { next(err); }
});

shiftRouter.post('/', sz(...SM), async (req: SAR, res, next) => {
  try {
    const shift = await sp.shift.create({ data: req.body });
    res.status(201).json({ success: true, data: shift });
  } catch (err) { next(err); }
});

shiftRouter.put('/:id', sz(...SM), async (req: SAR, res, next) => {
  try {
    const shift = await sp.shift.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: shift });
  } catch (err) { next(err); }
});

shiftRouter.delete('/:id', sz(...SM), async (req: SAR, res, next) => {
  try {
    await sp.shift.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export { shiftRouter as default };

// ════════════════════════════════════════════════════════════
// routes/summary.routes.ts  — Daily work summaries
// ════════════════════════════════════════════════════════════
import { Router as SummaryRouter } from 'express';
import { prisma as sump } from '../config/database';
import { authenticate as suma, authorize as sumz, MANAGEMENT_ROLES as SUMM } from '../middleware/auth.middleware';
import type { AuthRequest as SUMAR } from '../types';

const summaryRouter = SummaryRouter();
summaryRouter.use(suma);

summaryRouter.get('/my', async (req: SUMAR, res, next) => {
  try {
    const page  = Number(req.query.page)  || 1;
    const limit = Number(req.query.limit) || 30;
    const items = await sump.dailySummary.findMany({
      where:   { userId: req.user!.userId },
      orderBy: { date: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
    });
    res.json({ success: true, data: items });
  } catch (err) { next(err); }
});

summaryRouter.post('/', async (req: SUMAR, res, next) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const existing = await sump.dailySummary.findFirst({ where: { userId: req.user!.userId, date: today } });
    const data = { userId: req.user!.userId, date: today, ...req.body };
    const summary = existing
      ? await sump.dailySummary.update({ where: { id: existing.id }, data })
      : await sump.dailySummary.create({ data });
    res.status(201).json({ success: true, data: summary });
  } catch (err) { next(err); }
});

summaryRouter.get('/', sumz(...SUMM), async (req: SUMAR, res, next) => {
  try {
    const page   = Number(req.query.page)  || 1;
    const limit  = Number(req.query.limit) || 50;
    const date   = req.query.date ? new Date(req.query.date as string) : new Date();
    date.setHours(0,0,0,0);
    const items = await sump.dailySummary.findMany({
      where: { date },
      orderBy: { createdAt: 'desc' },
      skip:    (page-1)*limit, take: limit,
      include: { user: { select: { id: true, firstName: true, lastName: true, team: { select: { name: true } } } } },
    });
    res.json({ success: true, data: items });
  } catch (err) { next(err); }
});

export { summaryRouter as default };

// ════════════════════════════════════════════════════════════
// routes/dashboard.routes.ts
// ════════════════════════════════════════════════════════════
import { Router as DR } from 'express';
import { authenticate as da } from '../middleware/auth.middleware';
import { getDashboard } from '../controllers/kpi.controller';

const dashboardRouter = DR();
dashboardRouter.use(da);
dashboardRouter.get('/', getDashboard);
export { dashboardRouter as default };

// ════════════════════════════════════════════════════════════
// routes/timer.routes.ts  — Work time tracking
// ════════════════════════════════════════════════════════════
import { Router as TR } from 'express';
import { prisma as tp } from '../config/database';
import { redis as tr }  from '../config/redis';
import { authenticate as ta } from '../middleware/auth.middleware';
import type { AuthRequest as TAR } from '../types';

const timerRouter = TR();
timerRouter.use(ta);

timerRouter.post('/start', async (req: TAR, res, next) => {
  try {
    const { taskId } = req.body;
    const key        = `timer:${req.user!.userId}:${taskId}`;
    const existing   = await tr.get(key);
    if (existing) return res.status(400).json({ success: false, message: 'Timer already running for this task' });
    await tr.setex(key, 86400, Date.now().toString());
    res.json({ success: true, data: { taskId, startTime: Date.now() } });
  } catch (err) { next(err); }
});

timerRouter.post('/stop', async (req: TAR, res, next) => {
  try {
    const { taskId } = req.body;
    const key        = `timer:${req.user!.userId}:${taskId}`;
    const startStr   = await tr.get(key);
    if (!startStr) return res.status(400).json({ success: false, message: 'No timer running for this task' });

    const durationMs = Date.now() - parseInt(startStr, 10);
    await tr.del(key);

    const log = await tp.workTimeLog.create({
      data: {
        userId:     req.user!.userId,
        taskId,
        startTime:  new Date(parseInt(startStr, 10)),
        endTime:    new Date(),
        durationMs: Math.round(durationMs),
      },
    });

    // Update task actual hours
    const totalMs = await tp.workTimeLog.aggregate({ where: { taskId }, _sum: { durationMs: true } });
    await tp.task.update({ where: { id: taskId }, data: { actualHours: (totalMs._sum.durationMs || 0) / 3600000 } });

    res.json({ success: true, data: { ...log, durationMs } });
  } catch (err) { next(err); }
});

timerRouter.get('/active', async (req: TAR, res, next) => {
  try {
    const pattern = `timer:${req.user!.userId}:*`;
    const keys    = await tr.keys(pattern);
    const active  = [];
    for (const key of keys) {
      const start  = await tr.get(key);
      const taskId = key.split(':')[2];
      if (start) active.push({ taskId, startTime: parseInt(start), elapsed: Date.now() - parseInt(start) });
    }
    res.json({ success: true, data: active });
  } catch (err) { next(err); }
});

timerRouter.get('/logs', async (req: TAR, res, next) => {
  try {
    const page   = Number(req.query.page)  || 1;
    const limit  = Number(req.query.limit) || 20;
    const taskId = req.query.taskId as string | undefined;
    const where: any = { userId: req.user!.userId };
    if (taskId) where.taskId = taskId;
    const [logs, total] = await tp.$transaction([
      tp.workTimeLog.findMany({ where, orderBy: { startTime: 'desc' }, skip: (page-1)*limit, take: limit,
        include: { task: { select: { title: true } } } }),
      tp.workTimeLog.count({ where }),
    ]);
    res.json({ success: true, data: logs, pagination: { page, limit, total, totalPages: Math.ceil(total/limit) } });
  } catch (err) { next(err); }
});

export { timerRouter as default };

// ════════════════════════════════════════════════════════════
// routes/audit.routes.ts
// ════════════════════════════════════════════════════════════
import { Router as AR } from 'express';
import { prisma as ap } from '../config/database';
import { authenticate as aa, authorize as az } from '../middleware/auth.middleware';
import type { AuthRequest as AAR } from '../types';

const auditRouter = AR();
auditRouter.use(aa);

auditRouter.get('/', az('SUPER_ADMIN', 'ADMIN'), async (req: AAR, res, next) => {
  try {
    const page   = Number(req.query.page)  || 1;
    const limit  = Number(req.query.limit) || 50;
    const userId = req.query.userId as string | undefined;
    const entity = req.query.entity as string | undefined;
    const action = req.query.action as string | undefined;

    const where: any = {};
    if (userId) where.userId = userId;
    if (entity) where.entity = entity;
    if (action) where.action = action;

    const [logs, total] = await ap.$transaction([
      ap.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page-1)*limit, take: limit,
        include: { user: { select: { firstName: true, lastName: true, employeeId: true } } } }),
      ap.auditLog.count({ where }),
    ]);
    res.json({ success: true, data: logs, pagination: { page, limit, total, totalPages: Math.ceil(total/limit) } });
  } catch (err) { next(err); }
});

export { auditRouter as default };

// ════════════════════════════════════════════════════════════
// routes/leaderboard.routes.ts
// ════════════════════════════════════════════════════════════
import { Router as LR } from 'express';
import { prisma as lp } from '../config/database';
import { redis as lr }  from '../config/redis';
import { authenticate as la } from '../middleware/auth.middleware';
import type { AuthRequest as LAR } from '../types';

const leaderboardRouter = LR();
leaderboardRouter.use(la);

leaderboardRouter.get('/', async (req: LAR, res, next) => {
  try {
    const period    = (req.query.period as string) || 'weekly';
    const teamId    = req.query.teamId as string | undefined;
    const cacheKey  = `leaderboard:${period}:${teamId || 'all'}`;

    const cached = await lr.get(cacheKey).catch(() => null);
    if (cached) return res.json({ success: true, data: JSON.parse(cached), cached: true });

    const now       = new Date();
    const week      = Math.ceil((now.getDate() - now.getDay() + 7) / 7);
    const periodKey = period === 'weekly'
      ? `${now.getFullYear()}-W${String(week).padStart(2,'0')}`
      : `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    const where: any = { period, periodKey };

    const entries = await lp.leaderboard.findMany({
      where,
      include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, employeeId: true, team: { select: { name: true } }, totalPoints: true } } },
      orderBy: { points: 'desc' },
      take:    50,
    });

    const filtered = teamId ? entries.filter((e) => e.user.team?.name === teamId) : entries;
    const ranked   = filtered.map((e, i) => ({ ...e, rank: i + 1 }));

    await lr.setex(cacheKey, 300, JSON.stringify(ranked));
    res.json({ success: true, data: ranked });
  } catch (err) { next(err); }
});

export { leaderboardRouter as default };

// ════════════════════════════════════════════════════════════
// routes/report.routes.ts  — Standalone report endpoints
// ════════════════════════════════════════════════════════════
import { Router as RR } from 'express';
import { authenticate as rea, authorize as rez, MANAGEMENT_ROLES as REM } from '../middleware/auth.middleware';
import { downloadReport } from '../controllers/kpi.controller';

const reportRouter = RR();
reportRouter.use(rea);
reportRouter.get('/download', rez(...REM), downloadReport);

export { reportRouter as default };
