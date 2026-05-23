import { prisma }    from '../config/database';
import { redis }     from '../config/redis';
import { logger }    from '../utils/logger';
import admin         from 'firebase-admin';

// io is set after server boots — lazy import to avoid circular dep
let _io: any;
export function setIO(io: any) { _io = io; }

export class NotificationService {
  static async send({ userId, type, title, body, data, fcmToken }: {
    userId: string; type: string; title: string; body: string; data?: any; fcmToken?: string;
  }): Promise<void> {
    try {
      const notif = await prisma.notification.create({ data: { userId, type, title, body, data: data ?? undefined } });

      // Socket.IO real-time push
      _io?.to(`user:${userId}`).emit('notification', { id: notif.id, type, title, body, data, createdAt: notif.createdAt });

      // FCM push
      let token = fcmToken;
      if (!token) {
        const u = await prisma.user.findUnique({ where: { id: userId }, select: { fcmToken: true } });
        token = u?.fcmToken ?? undefined;
      }
      if (token) {
        await NotificationService.sendPush(token, title, body, data).catch(() => {});
        await prisma.notification.update({ where: { id: notif.id }, data: { sentViaPush: true } });
      }

      await redis.incr(`unread:${userId}`);
    } catch (err) {
      logger.error('NotificationService.send error:', err);
    }
  }

  static async sendPush(token: string, title: string, body: string, data?: any): Promise<void> {
    await admin.messaging().send({
      token,
      notification: { title, body },
      data: data ? Object.fromEntries(Object.entries(data).map(([k,v]) => [k, String(v)])) : {},
      android: { priority: 'high', notification: { sound: 'default' } },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });
  }

  static async broadcast(userIds: string[], type: string, title: string, body: string, data?: any): Promise<void> {
    await Promise.allSettled(userIds.map(id => NotificationService.send({ userId: id, type, title, body, data })));
  }

  static async sendToTeam(teamId: string, type: string, title: string, body: string, data?: any): Promise<void> {
    const members = await prisma.user.findMany({ where: { teamId, deletedAt: null, status: 'ACTIVE' }, select: { id: true } });
    await NotificationService.broadcast(members.map(m => m.id), type, title, body, data);
  }

  static async sendDeadlineReminders(): Promise<void> {
    const now      = new Date();
    const in24h    = new Date(Date.now() + 24*3600000);
    const tasks    = await prisma.task.findMany({
      where: { dueDate: { gte: now, lte: in24h }, status: { notIn: ['COMPLETED','REJECTED'] }, deletedAt: null },
      include: { assignee: { select: { id: true, fcmToken: true } } },
    });
    for (const task of tasks) {
      const hrs = Math.round((task.dueDate!.getTime() - now.getTime()) / 3600000);
      await NotificationService.send({ userId: task.assigneeId, type: 'DEADLINE_NEAR', title: '⏰ Deadline Approaching', body: `"${task.title}" due in ${hrs}h`, data: { taskId: task.id }, fcmToken: task.assignee.fcmToken ?? undefined });
    }
    logger.info(`Sent ${tasks.length} deadline reminders`);
  }
}
