import { prisma }             from '../config/database';
import { logger }             from '../utils/logger';
import { NotificationService } from './notification.service';

export class GamificationService {
  static readonly POINTS = {
    TASK_COMPLETE: 10,
    ON_TIME_BONUS:  5,
    EARLY_BONUS:   10,
    STREAK_BONUS:  20,
  };

  static async onTaskCompleted(userId: string, task: any): Promise<void> {
    try {
      let points = GamificationService.POINTS.TASK_COMPLETE;
      if (task.dueDate) {
        const completedAt = task.completedAt || new Date();
        const hoursBefore = (task.dueDate.getTime() - completedAt.getTime()) / 3600000;
        if (hoursBefore >= 24) points += GamificationService.POINTS.EARLY_BONUS;
        else if (hoursBefore >= 0) points += GamificationService.POINTS.ON_TIME_BONUS;
      }

      await prisma.user.update({ where: { id: userId }, data: { totalPoints: { increment: points } } });

      const week  = GamificationService.getWeekKey();
      const month = GamificationService.getMonthKey();
      await Promise.allSettled([
        GamificationService.upsertLeaderboard(userId, week,  'weekly',  points),
        GamificationService.upsertLeaderboard(userId, month, 'monthly', points),
      ]);

      await GamificationService.checkBadges(userId);
    } catch (err) {
      logger.error('GamificationService.onTaskCompleted:', err);
    }
  }

  private static async upsertLeaderboard(userId: string, periodKey: string, period: string, points: number): Promise<void> {
    await prisma.leaderboard.upsert({
      where:  { userId_periodKey: { userId, periodKey } },
      create: { userId, period, periodKey, points },
      update: { points: { increment: points }, updatedAt: new Date() },
    });
  }

  static async checkBadges(userId: string): Promise<void> {
    const completed = await prisma.task.count({ where: { assigneeId: userId, status: 'COMPLETED' } });
    const owned     = await prisma.userBadge.findMany({ where: { userId }, select: { badgeId: true } });
    const ownedSet  = new Set(owned.map(b => b.badgeId));
    const badges    = await prisma.badge.findMany();

    for (const badge of badges) {
      if (ownedSet.has(badge.id)) continue;
      const cond = badge.condition as any;
      if (cond.type === 'tasks_completed' && completed >= cond.count) {
        await prisma.userBadge.create({ data: { userId, badgeId: badge.id } });
        await NotificationService.send({ userId, type: 'ANNOUNCEMENT', title: `🏅 Badge Earned: ${badge.name}!`, body: badge.description, data: { badgeId: badge.id } });
      }
    }
  }

  private static getWeekKey(): string {
    const d = new Date();
    const w = Math.ceil((d.getDate() - d.getDay() + 7) / 7);
    return `${d.getFullYear()}-W${String(w).padStart(2,'0')}`;
  }
  private static getMonthKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
}

export class AIProductivityService {
  static async analyzeLowProductivity(userId: string): Promise<string[]> {
    const last7     = await prisma.productivityMetric.findMany({ where: { userId, date: { gte: new Date(Date.now() - 7*86400000) } }, orderBy: { date: 'asc' } });
    if (!last7.length) return [];
    const suggestions: string[] = [];
    const avgScore = last7.reduce((s, m) => s + m.productivityScore, 0) / last7.length;
    const avgDelay = last7.reduce((s, m) => s + m.delayPercentage,   0) / last7.length;
    const overdue  = last7.reduce((s, m) => s + m.tasksOverdue,       0);
    if (avgScore < 40) suggestions.push('Productivity score below 40%. Review task prioritisation.');
    if (avgDelay > 30) suggestions.push('Over 30% tasks delayed. Break large tasks into milestones.');
    if (overdue > 5)   suggestions.push(`${overdue} overdue tasks this week. Focus on high-priority items first.`);
    const pending = await prisma.task.count({ where: { assigneeId: userId, status: { in: ['PENDING','IN_PROGRESS','ON_HOLD'] }, deletedAt: null } });
    if (pending > 10)  suggestions.push(`${pending} active tasks. Consider workload rebalancing.`);
    return suggestions;
  }
}
