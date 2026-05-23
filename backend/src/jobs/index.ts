import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { NotificationService } from '../services/notification.service';

// Install: npm install node-cron @types/node-cron

export function startCronJobs(): void {
  logger.info('Starting cron jobs...');

  // ─── Every 30 min: Auto-escalate overdue tasks ────────────────
  cron.schedule('*/30 * * * *', async () => {
    try {
      const gracePeriodHours = Number(process.env.ESCALATION_GRACE_HOURS || 2);
      const cutoff           = new Date(Date.now() - gracePeriodHours * 3600000);

      const overdue = await prisma.task.findMany({
        where: {
          dueDate:   { lt: cutoff },
          status:    { notIn: ['COMPLETED', 'REJECTED', 'ON_HOLD'] },
          isEscalated: false,
          deletedAt:   null,
        },
        include: {
          assignee:  { select: { id: true, teamId: true, fcmToken: true } },
          createdBy: { select: { id: true, fcmToken: true } },
          team:      { select: { leaderId: true } },
        },
      });

      for (const task of overdue) {
        await prisma.task.update({
          where: { id: task.id },
          data:  { isEscalated: true, escalatedAt: new Date(), escalatedTo: task.team?.leaderId || task.createdById },
        });

        // Notify assignee, creator, and team leader
        const notifyIds = new Set([task.assigneeId, task.createdById]);
        if (task.team?.leaderId) notifyIds.add(task.team.leaderId);

        for (const uid of notifyIds) {
          await NotificationService.send({
            userId: uid,
            type:   'ESCALATION',
            title:  '🚨 Task Escalated',
            body:   `Task "${task.title}" has been escalated due to missed deadline.`,
            data:   { taskId: task.id },
          });
        }
      }

      if (overdue.length) logger.info(`Escalated ${overdue.length} overdue tasks`);
    } catch (err) {
      logger.error('Escalation cron error:', err);
    }
  });

  // ─── Daily at 8AM: Send deadline reminders ────────────────────
  cron.schedule('0 8 * * *', async () => {
    try {
      await NotificationService.sendDeadlineReminders();
    } catch (err) {
      logger.error('Deadline reminder cron error:', err);
    }
  });

  // ─── Daily at 11PM: Calculate productivity metrics ────────────
  cron.schedule('0 23 * * *', async () => {
    try {
      const today   = new Date();
      today.setHours(0, 0, 0, 0);
      const dateStr = today.toISOString().split('T')[0];

      const users = await prisma.user.findMany({
        where:  { deletedAt: null, status: 'ACTIVE' },
        select: { id: true },
      });

      let processed = 0;
      for (const user of users) {
        try {
          await prisma.$executeRaw`EXEC sp_CalculateDailyProductivity ${user.id}, ${dateStr}`;
          processed++;
        } catch (err) {
          logger.error(`Metric calc failed for user ${user.id}:`, err);
        }
      }
      logger.info(`Calculated productivity metrics for ${processed}/${users.length} users`);
    } catch (err) {
      logger.error('Productivity metrics cron error:', err);
    }
  });

  // ─── Daily at midnight: Process recurring tasks ───────────────
  cron.schedule('0 0 * * *', async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dow   = today.getDay(); // 0=Sun
      const dom   = today.getDate();

      const recurringTasks = await prisma.task.findMany({
        where: {
          isRecurring:     true,
          deletedAt:       null,
          status:          { in: ['COMPLETED', 'REJECTED'] },
          OR: [
            { recurringEndDate: null },
            { recurringEndDate: { gte: today } },
          ],
        },
      });

      let created = 0;
      for (const task of recurringTasks) {
        const pattern = task.recurringPattern;
        let shouldCreate = false;

        if (pattern === 'daily')   shouldCreate = true;
        if (pattern === 'weekly')  shouldCreate = dow === 1; // Every Monday
        if (pattern === 'monthly') shouldCreate = dom === 1; // 1st of month

        if (shouldCreate) {
          const newDue = task.dueDate ? new Date(task.dueDate) : new Date(today);
          if (task.dueDate) {
            const diff = today.getTime() - (task.completedAt || today).getTime();
            newDue.setTime(newDue.getTime() + diff);
          }

          await prisma.task.create({
            data: {
              title:           `[Recurring] ${task.title}`,
              description:     task.description || undefined,
              assigneeId:      task.assigneeId,
              createdById:     task.createdById,
              teamId:          task.teamId || undefined,
              priority:        task.priority,
              category:        task.category || undefined,
              dueDate:         newDue,
              estimatedHours:  task.estimatedHours || undefined,
              slaHours:        task.slaHours || undefined,
              proofRequired:   task.proofRequired,
              parentTaskId:    task.id,
            },
          });
          created++;
        }
      }
      if (created) logger.info(`Created ${created} recurring task instances`);
    } catch (err) {
      logger.error('Recurring tasks cron error:', err);
    }
  });

  // ─── Weekly Sunday midnight: Update leaderboard ranks ────────
  cron.schedule('0 0 * * 0', async () => {
    try {
      const week = getPrevWeekKey();
      const entries = await prisma.leaderboard.findMany({
        where:   { periodKey: week, period: 'weekly' },
        orderBy: { points: 'desc' },
      });
      for (let i = 0; i < entries.length; i++) {
        await prisma.leaderboard.update({ where: { id: entries[i].id }, data: { rank: i + 1 } });
      }
      logger.info(`Updated weekly leaderboard ranks for ${week}`);
    } catch (err) {
      logger.error('Leaderboard rank cron error:', err);
    }
  });

  // ─── Daily attendance auto-mark absent ───────────────────────
  cron.schedule('55 23 * * *', async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const allActive = await prisma.user.findMany({
        where:  { deletedAt: null, status: 'ACTIVE' },
        select: { id: true },
      });

      for (const user of allActive) {
        const exists = await prisma.attendance.findFirst({ where: { userId: user.id, date: today } });
        if (!exists) {
          // Check for approved leave
          const onLeave = await prisma.leaveRequest.findFirst({
            where: {
              userId:    user.id,
              status:    'APPROVED',
              startDate: { lte: today },
              endDate:   { gte: today },
            },
          });
          await prisma.attendance.create({
            data: { userId: user.id, date: today, status: onLeave ? 'ON_LEAVE' : 'ABSENT' },
          });
        }
      }
      logger.info('Auto-marked attendance for end of day');
    } catch (err) {
      logger.error('Auto-attendance cron error:', err);
    }
  });

  logger.info('All cron jobs started');
}

function getPrevWeekKey(): string {
  const d    = new Date(Date.now() - 7 * 86400000);
  const week = Math.ceil((d.getDate() - d.getDay() + 7) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}
