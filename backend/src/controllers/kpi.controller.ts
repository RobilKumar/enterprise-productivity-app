import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { AppError } from '../middleware/errorHandler';
import { generatePDF } from '../services/pdf.service';
import { generateExcel } from '../services/excel.service';
import type { AuthRequest } from '../types';

const DateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate:   z.string().optional(),
  userId:    z.string().uuid().optional(),
  teamId:    z.string().uuid().optional(),
  deptId:    z.string().uuid().optional(),
  period:    z.enum(['daily', 'weekly', 'monthly']).default('weekly'),
});

// Helper to get default date range (last 30 days)
function getDateRange(startDate?: string, endDate?: string) {
  const end   = endDate   ? new Date(endDate)   : new Date();
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return { start, end };
}

// ─── Dashboard Overview ───────────────────────────────────────
export async function getDashboard(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { userId, role } = req.user!;
    const cacheKey = `dashboard:${userId}:${role}`;

    const cached = await redis.get(cacheKey);
    if (cached) return res.json({ success: true, data: JSON.parse(cached), cached: true });

    let taskWhere: any = { deletedAt: null };
    if (role === 'EMPLOYEE') taskWhere.assigneeId = userId;
    else if (role === 'TEAM_LEADER') {
      const me = await prisma.user.findUnique({ where: { id: userId }, select: { teamId: true } });
      if (me?.teamId) taskWhere.teamId = me.teamId;
    }

    const [
      totalTasks, pendingTasks, inProgressTasks, completedTasks, overdueTask,
      escalatedTasks, totalUsers, activeUsers,
      recentTasks, todayAttendance, unreadNotifications,
    ] = await prisma.$transaction([
      prisma.task.count({ where: taskWhere }),
      prisma.task.count({ where: { ...taskWhere, status: 'PENDING' } }),
      prisma.task.count({ where: { ...taskWhere, status: 'IN_PROGRESS' } }),
      prisma.task.count({ where: { ...taskWhere, status: 'COMPLETED' } }),
      prisma.task.count({
        where: { ...taskWhere, dueDate: { lt: new Date() }, status: { notIn: ['COMPLETED', 'REJECTED'] } },
      }),
      prisma.task.count({ where: { ...taskWhere, isEscalated: true } }),
      role !== 'EMPLOYEE' ? prisma.user.count({ where: { deletedAt: null } }) : Promise.resolve(0),
      role !== 'EMPLOYEE' ? prisma.user.count({ where: { deletedAt: null, status: 'ACTIVE', isOnline: true } }) : Promise.resolve(0),
      prisma.task.findMany({
        where:   taskWhere,
        orderBy: { updatedAt: 'desc' },
        take:    5,
        include: { assignee: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
      }),
      prisma.attendance.count({
        where: { date: new Date(new Date().setHours(0, 0, 0, 0)), status: 'PRESENT' },
      }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    const productivityScore = totalTasks > 0
      ? Math.round((completedTasks / totalTasks) * 100)
      : 0;

    const data = {
      summary: {
        totalTasks, pendingTasks, inProgressTasks, completedTasks,
        overdueTask, escalatedTasks, productivityScore,
        totalUsers, activeUsers, todayAttendance, unreadNotifications,
      },
      recentTasks,
    };

    await redis.setex(cacheKey, 120, JSON.stringify(data)); // Cache 2 minutes
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── User KPI ────────────────────────────────────────────────
export async function getUserKPI(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const targetId = req.params.userId || req.user!.userId;
    const { startDate, endDate } = DateRangeSchema.parse(req.query);
    const { start, end } = getDateRange(startDate, endDate);

    // RBAC check
    if (req.user!.role === 'EMPLOYEE' && targetId !== req.user!.userId) {
      throw new AppError('Access denied', 403);
    }

    const [metrics, taskStats, attendanceStats, workHours, recentMetrics] = await prisma.$transaction([
      prisma.productivityMetric.findMany({
        where:   { userId: targetId, date: { gte: start, lte: end } },
        orderBy: { date: 'asc' },
      }),
      prisma.task.groupBy({
        by:     ['status'],
        where:  { assigneeId: targetId, deletedAt: null, createdAt: { gte: start, lte: end } },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      prisma.attendance.groupBy({
        by:     ['status'],
        where:  { userId: targetId, date: { gte: start, lte: end } },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      prisma.workTimeLog.aggregate({
        where:  { userId: targetId, startTime: { gte: start, lte: end }, isIdle: false },
        _sum:   { durationMs: true },
      }),
      prisma.productivityMetric.findMany({
        where:   { userId: targetId },
        orderBy: { date: 'desc' },
        take:    30,
      }),
    ]);

    const avgProductivity = metrics.length > 0
      ? metrics.reduce((s, m) => s + m.productivityScore, 0) / metrics.length
      : 0;

    const totalWorkHours = (workHours._sum.durationMs || 0) / 3600000;

    return res.json({
      success: true,
      data: {
        avgProductivity:    Math.round(avgProductivity * 10) / 10,
        totalWorkHours:     Math.round(totalWorkHours * 10) / 10,
        taskStats,
        attendanceStats,
        dailyMetrics:       recentMetrics,
        trendData:          metrics,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Team KPI ────────────────────────────────────────────────
export async function getTeamKPI(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { teamId } = req.params;
    const { startDate, endDate } = DateRangeSchema.parse(req.query);
    const { start, end } = getDateRange(startDate, endDate);

    const cacheKey = `team-kpi:${teamId}:${start.toISOString()}:${end.toISOString()}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json({ success: true, data: JSON.parse(cached), cached: true });

    const team = await prisma.team.findUnique({
      where:   { id: teamId },
      include: { members: { where: { deletedAt: null }, select: { id: true, firstName: true, lastName: true, avatarUrl: true, totalPoints: true } } },
    });
    if (!team) throw new AppError('Team not found', 404);

    const memberIds = team.members.map((m) => m.id);

    const [taskStats, memberMetrics] = await prisma.$transaction([
      prisma.task.groupBy({
        by:     ['status', 'priority'],
        where:  { teamId, deletedAt: null, createdAt: { gte: start, lte: end } },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      prisma.productivityMetric.groupBy({
        by:     ['userId'],
        where:  { userId: { in: memberIds }, date: { gte: start, lte: end } },
        _avg:   { productivityScore: true, totalWorkHours: true, onTimeDeliveryRate: true },
        _sum:   { tasksCompleted: true },
        orderBy: { userId: 'asc' },
      }),
    ]);

    const memberKPIs = team.members.map((member) => {
      const metrics = memberMetrics.find((m) => m.userId === member.id);
      return {
        ...member,
        avgProductivity:   Math.round((metrics?._avg.productivityScore || 0) * 10) / 10,
        avgWorkHours:      Math.round((metrics?._avg.totalWorkHours || 0) * 10) / 10,
        tasksCompleted:    metrics?._sum.tasksCompleted || 0,
        onTimeDeliveryRate: Math.round((metrics?._avg.onTimeDeliveryRate || 0) * 10) / 10,
      };
    }).sort((a, b) => b.avgProductivity - a.avgProductivity);

    const data = { team, taskStats, memberKPIs };
    await redis.setex(cacheKey, 300, JSON.stringify(data)); // Cache 5 minutes

    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── Company-wide KPI ────────────────────────────────────────
// Optimised for 5 000+ users: heavy deptStats replaced with a single
// raw-SQL aggregation so the DB does the work, not Node.
export async function getCompanyKPI(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user!.role)) throw new AppError('Access denied', 403);

    const { startDate, endDate } = DateRangeSchema.parse(req.query);
    const { start, end } = getDateRange(startDate, endDate);

    // 5-minute cache keyed by date range
    const cacheKey = `kpi:company:${start.toISOString()}:${end.toISOString()}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json({ success: true, data: JSON.parse(cached) });

    // Run all queries in parallel (independent — no transaction needed)
    const [
      overallTasks,
      deptStats,
      topPerformers,
      slaBreaches,
      productivityTrend,
      workloadByPriority,
    ] = await Promise.all([
      // 1. Overall task breakdown by status
      prisma.task.groupBy({
        by:     ['status'],
        where:  { deletedAt: null, createdAt: { gte: start, lte: end } },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),

      // 2. Per-department stats — raw SQL aggregation (single query, no N+1)
      prisma.$queryRaw<Array<{
        departmentId: string;
        departmentName: string;
        headCount: bigint;
        totalTasks: bigint;
        completed: bigint;
        inProgress: bigint;
        pending: bigint;
        rejected: bigint;
        completionRate: number | null;
        onTimeRate: number | null;
      }>>`
        SELECT
          d.id                                                      AS "departmentId",
          d.name                                                    AS "departmentName",
          COUNT(DISTINCT u.id)                                      AS "headCount",
          COUNT(DISTINCT t.id)                                      AS "totalTasks",
          COUNT(DISTINCT CASE WHEN t.status = 'COMPLETED'  THEN t.id END) AS "completed",
          COUNT(DISTINCT CASE WHEN t.status = 'IN_PROGRESS' THEN t.id END) AS "inProgress",
          COUNT(DISTINCT CASE WHEN t.status = 'PENDING'    THEN t.id END) AS "pending",
          COUNT(DISTINCT CASE WHEN t.status = 'REJECTED'   THEN t.id END) AS "rejected",
          ROUND(
            CASE WHEN COUNT(DISTINCT t.id) = 0 THEN 0
                 ELSE COUNT(DISTINCT CASE WHEN t.status = 'COMPLETED' THEN t.id END)::float
                      / COUNT(DISTINCT t.id)::float * 100
            END
          )                                                         AS "completionRate",
          ROUND(AVG(
            CASE
              WHEN t."completedAt" IS NOT NULL AND t."dueDate" IS NOT NULL
                   AND t."completedAt" <= t."dueDate" THEN 100.0
              WHEN t."completedAt" IS NOT NULL AND t."dueDate" IS NOT NULL
                   AND t."completedAt" > t."dueDate"  THEN 0.0
              ELSE NULL
            END
          ))                                                        AS "onTimeRate"
        FROM "Departments" d
        LEFT JOIN "Users" u
          ON u."departmentId" = d.id AND u."deletedAt" IS NULL
        LEFT JOIN "Tasks" t
          ON t."assigneeId" = u.id
         AND t."deletedAt"  IS NULL
         AND t."createdAt" >= ${start}
         AND t."createdAt" <= ${end}
        WHERE d."isActive" = true
        GROUP BY d.id, d.name
        ORDER BY d.name
      `,

      // 3. Top performers (simple lookup — already indexed on totalPoints)
      prisma.user.findMany({
        where:   { deletedAt: null, status: 'ACTIVE' },
        orderBy: { totalPoints: 'desc' },
        take:    10,
        select:  { id: true, firstName: true, lastName: true, avatarUrl: true, totalPoints: true, employeeId: true },
      }),

      // 4. SLA aggregates
      prisma.productivityMetric.aggregate({
        where: { date: { gte: start, lte: end } },
        _sum:  { slaBreaches: true },
        _avg:  { productivityScore: true },
      }),

      // 5. Productivity trend (daily avg)
      prisma.productivityMetric.groupBy({
        by:    ['date'],
        where: { date: { gte: start, lte: end } },
        _avg:  { productivityScore: true, totalWorkHours: true },
        orderBy: { date: 'asc' },
      }),

      // 6. Active workload by priority
      prisma.task.groupBy({
        by:     ['priority'],
        where:  { deletedAt: null, status: { in: ['PENDING', 'IN_PROGRESS', 'ON_HOLD'] } },
        _count: { _all: true },
        orderBy: { priority: 'asc' },
      }),
    ]);

    // Convert BigInt to Number for JSON serialisation
    const deptStatsSafe = (deptStats as any[]).map((d) => ({
      ...d,
      headCount:      Number(d.headCount),
      totalTasks:     Number(d.totalTasks),
      completed:      Number(d.completed),
      inProgress:     Number(d.inProgress),
      pending:        Number(d.pending),
      rejected:       Number(d.rejected),
      completionRate: d.completionRate !== null ? Number(d.completionRate) : 0,
      onTimeRate:     d.onTimeRate     !== null ? Number(d.onTimeRate)     : 0,
    }));

    const data = {
      overallTasks,
      deptStats:       deptStatsSafe,
      topPerformers,
      slaBreaches:     slaBreaches._sum.slaBreaches || 0,
      avgProductivity: Math.round((slaBreaches._avg.productivityScore || 0) * 10) / 10,
      productivityTrend,
      workloadByPriority,
    };

    await redis.setex(cacheKey, 300, JSON.stringify(data));

    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── Generate & Download Report ────────────────────────────────
export async function downloadReport(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { format } = z.object({ format: z.enum(['pdf', 'excel', 'csv']) }).parse(req.query);
    const { startDate, endDate, userId, teamId, deptId } = DateRangeSchema.parse(req.query);
    const { start, end } = getDateRange(startDate, endDate);

    let taskWhere: any = { deletedAt: null, createdAt: { gte: start, lte: end } };
    if (userId)  taskWhere.assigneeId    = userId;
    if (teamId)  taskWhere.teamId        = teamId;
    if (deptId)  taskWhere.assignee      = { is: { departmentId: deptId } };

    const tasks = await prisma.task.findMany({
      where:   taskWhere,
      include: {
        assignee:  { select: { firstName: true, lastName: true, employeeId: true, department: { select: { name: true } } } },
        createdBy: { select: { firstName: true, lastName: true } },
        team:      { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (format === 'pdf') {
      const pdfBuffer = await generatePDF('task-report', {
        title:    'Task Report',
        period:   `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`,
        tasks,
        generatedAt: new Date().toISOString(),
        generatedBy: req.user!.userId,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="task-report-${Date.now()}.pdf"`);
      return res.send(pdfBuffer);
    }

    if (format === 'excel' || format === 'csv') {
      const buffer = await generateExcel(tasks, format === 'csv');
      const mime   = format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const ext    = format === 'csv' ? 'csv' : 'xlsx';
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `attachment; filename="task-report-${Date.now()}.${ext}"`);
      return res.send(buffer);
    }
  } catch (err) {
    next(err);
  }
}

// ─── Employee Ranking ────────────────────────────────────────
export async function getEmployeeRanking(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { startDate, endDate } = DateRangeSchema.parse(req.query);
    const { start, end } = getDateRange(startDate, endDate);

    const rankings = await prisma.productivityMetric.groupBy({
      by:    ['userId'],
      where: { date: { gte: start, lte: end } },
      _avg:  { productivityScore: true, onTimeDeliveryRate: true },
      _sum:  { tasksCompleted: true, totalWorkHours: true },
      orderBy: { _avg: { productivityScore: 'desc' } },
      take:  50,
    });

    const userIds = rankings.map((r) => r.userId);
    const users   = await prisma.user.findMany({
      where:  { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, avatarUrl: true, employeeId: true, totalPoints: true, team: { select: { name: true } } },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    const data = rankings.map((r, idx) => ({
      rank:              idx + 1,
      user:              userMap.get(r.userId),
      avgProductivity:   Math.round((r._avg.productivityScore || 0) * 10) / 10,
      tasksCompleted:    r._sum.tasksCompleted || 0,
      totalWorkHours:    Math.round((r._sum.totalWorkHours || 0) * 10) / 10,
      onTimeDeliveryRate: Math.round((r._avg.onTimeDeliveryRate || 0) * 10) / 10,
    }));

    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
