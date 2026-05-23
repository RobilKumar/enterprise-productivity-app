import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import type { JWTPayload } from '../types';

export function initSocketHandlers(io: Server): void {
  // ─── Auth Middleware ──────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('Authentication required'));

      const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
      (socket as any).user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const user = (socket as any).user as JWTPayload;
    logger.info(`Socket connected: ${user.userId} [${socket.id}]`);

    // Join personal room
    socket.join(`user:${user.userId}`);

    // Join team room if applicable
    const dbUser = await prisma.user.findUnique({
      where:  { id: user.userId },
      select: { teamId: true, departmentId: true },
    });
    if (dbUser?.teamId)       socket.join(`team:${dbUser.teamId}`);
    if (dbUser?.departmentId) socket.join(`dept:${dbUser.departmentId}`);
    socket.join('company');

    // Management room — for targeted events that only managers/admins should receive
    if (['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEADER'].includes(user.role)) {
      socket.join('mgmt');
    }

    // Mark online
    await prisma.user.update({ where: { id: user.userId }, data: { isOnline: true, lastActiveAt: new Date() } });
    await redis.setex(`online:${user.userId}`, 120, '1');
    io.emit('user:online', { userId: user.userId });

    // ─── Chat Events ────────────────────────────────────────────
    socket.on('chat:join', async ({ roomId }: { roomId: string }) => {
      const member = await prisma.chatRoomMember.findFirst({ where: { roomId, userId: user.userId } });
      if (member) {
        socket.join(`chat:${roomId}`);
        socket.emit('chat:joined', { roomId });
      }
    });

    socket.on('chat:message', async ({ roomId, content, mediaUrl, mediaType }: any) => {
      const member = await prisma.chatRoomMember.findFirst({ where: { roomId, userId: user.userId } });
      if (!member) return socket.emit('error', { message: 'Not a member of this room' });

      const message = await prisma.chatMessage.create({
        data:    { roomId, senderId: user.userId, content, mediaUrl, mediaType },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
      });

      io.to(`chat:${roomId}`).emit('chat:message', message);
    });

    socket.on('chat:typing', ({ roomId }: { roomId: string }) => {
      socket.to(`chat:${roomId}`).emit('chat:typing', { userId: user.userId, roomId });
    });

    socket.on('chat:stop_typing', ({ roomId }: { roomId: string }) => {
      socket.to(`chat:${roomId}`).emit('chat:stop_typing', { userId: user.userId, roomId });
    });

    socket.on('chat:read', async ({ roomId }: { roomId: string }) => {
      await prisma.chatRoomMember.updateMany({
        where: { roomId, userId: user.userId },
        data:  { lastReadAt: new Date() },
      });
      socket.to(`chat:${roomId}`).emit('chat:read', { userId: user.userId, roomId });
    });

    // ─── Task Events ─────────────────────────────────────────────
    socket.on('task:subscribe', ({ taskId }: { taskId: string }) => {
      socket.join(`task:${taskId}`);
    });

    socket.on('task:unsubscribe', ({ taskId }: { taskId: string }) => {
      socket.leave(`task:${taskId}`);
    });

    // ─── Timer Events ────────────────────────────────────────────
    socket.on('timer:start', async ({ taskId }: { taskId: string }) => {
      await redis.setex(`timer:${user.userId}:${taskId}`, 86400, Date.now().toString());
      socket.emit('timer:started', { taskId, startTime: Date.now() });
    });

    socket.on('timer:stop', async ({ taskId }: { taskId: string }) => {
      const startStr = await redis.get(`timer:${user.userId}:${taskId}`);
      if (!startStr) return;

      const durationMs = Date.now() - parseInt(startStr, 10);
      await redis.del(`timer:${user.userId}:${taskId}`);

      await prisma.workTimeLog.create({
        data: {
          userId:     user.userId,
          taskId,
          startTime:  new Date(parseInt(startStr, 10)),
          endTime:    new Date(),
          durationMs: Math.round(durationMs),
        },
      });

      socket.emit('timer:stopped', { taskId, durationMs });
    });

    // ─── Presence ─────────────────────────────────────────────────
    socket.on('heartbeat', async () => {
      await redis.setex(`online:${user.userId}`, 120, '1');
      await prisma.user.update({ where: { id: user.userId }, data: { lastActiveAt: new Date() } });
    });

    // ─── Disconnect ──────────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      logger.info(`Socket disconnected: ${user.userId} [${reason}]`);
      await redis.del(`online:${user.userId}`);
      await prisma.user.update({ where: { id: user.userId }, data: { isOnline: false } });
      io.emit('user:offline', { userId: user.userId });
    });
  });
}

// ─── Emit to task subscribers ─────────────────────────────────
export function emitTaskUpdate(io: Server, taskId: string, event: string, data: unknown): void {
  io.to(`task:${taskId}`).emit(event, data);
}
