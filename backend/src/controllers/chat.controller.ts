import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import type { AuthRequest } from '../types';

// ─── Get Chat Rooms ──────────────────────────────────────────────────────────
export async function getRooms(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const rooms = await prisma.chatRoom.findMany({
      where: {
        OR: [
          { isPublic: true },
          { members: { some: { userId: req.user!.userId } } },
        ],
      },
      include: {
        members: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, isOnline: true } } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take:    1,
          include: { sender: { select: { id: true, firstName: true, lastName: true } } },
        },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return res.json({ success: true, data: rooms });
  } catch (err) {
    next(err);
  }
}

// ─── Create Room ─────────────────────────────────────────────────────────────
export async function createRoom(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { name, memberIds, isPublic, type } = z.object({
      name:      z.string().min(1).max(100),
      memberIds: z.array(z.string().uuid()),
      isPublic:  z.boolean().default(false),
      type:      z.enum(['direct', 'group', 'channel']).default('group'),
    }).parse(req.body);

    // For direct messages, check if room already exists
    if (type === 'direct' && memberIds.length === 1) {
      const existing = await prisma.chatRoom.findFirst({
        where: {
          type: 'direct',
          AND: [
            { members: { some: { userId: req.user!.userId } } },
            { members: { some: { userId: memberIds[0] } } },
          ],
        },
      });
      if (existing) return res.json({ success: true, data: existing });
    }

    const allMembers = [...new Set([req.user!.userId, ...memberIds])];

    const room = await prisma.chatRoom.create({
      data: {
        name,
        isPublic,
        type,
        createdById: req.user!.userId,
        members: {
          create: allMembers.map((uid) => ({
            userId: uid,
            role:   uid === req.user!.userId ? 'admin' : 'member',
          })),
        },
      },
      include: {
        members: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } },
      },
    });

    return res.status(201).json({ success: true, data: room });
  } catch (err) {
    next(err);
  }
}

// ─── Get Messages ────────────────────────────────────────────────────────────
export async function getMessages(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { roomId } = req.params;
    const { cursor, limit } = z.object({
      cursor: z.string().uuid().optional(),
      limit:  z.coerce.number().min(1).max(100).default(50),
    }).parse(req.query);

    // Check membership
    const member = await prisma.chatRoomMember.findFirst({
      where: { roomId, userId: req.user!.userId },
    });
    if (!member) {
      const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
      if (!room?.isPublic) throw new AppError('Not a member of this room', 403);
    }

    const messages = await prisma.chatMessage.findMany({
      where: {
        roomId,
        deletedAt: null,
        ...(cursor ? { createdAt: { lt: (await prisma.chatMessage.findUnique({ where: { id: cursor } }))?.createdAt } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take:    limit,
      include: {
        sender:    { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        reactions: true,
        replyTo:   { include: { sender: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });

    // Mark messages as read
    await prisma.chatMessage.updateMany({
      where: { roomId, senderId: { not: req.user!.userId }, readBy: { none: { userId: req.user!.userId } } },
      data:  {},
    });

    return res.json({
      success: true,
      data:    messages.reverse(),
      hasMore: messages.length === limit,
    });
  } catch (err) {
    next(err);
  }
}

// ─── Send Message ────────────────────────────────────────────────────────────
export async function sendMessage(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { roomId } = req.params;
    const { content, replyToId, type } = z.object({
      content:   z.string().min(1).max(4000),
      replyToId: z.string().uuid().optional(),
      type:      z.enum(['text', 'image', 'file', 'system']).default('text'),
    }).parse(req.body);

    const message = await prisma.chatMessage.create({
      data:    { roomId, senderId: req.user!.userId, content, replyToId, type },
      include: {
        sender:  { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        replyTo: { include: { sender: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });

    // Update room updatedAt
    await prisma.chatRoom.update({ where: { id: roomId }, data: { updatedAt: new Date() } });

    return res.status(201).json({ success: true, data: message });
  } catch (err) {
    next(err);
  }
}

// ─── Delete Message ──────────────────────────────────────────────────────────
export async function deleteMessage(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { roomId, messageId } = req.params;

    const message = await prisma.chatMessage.findFirst({ where: { id: messageId, roomId } });
    if (!message) throw new AppError('Message not found', 404);
    if (message.senderId !== req.user!.userId && !['SUPER_ADMIN', 'ADMIN'].includes(req.user!.role)) {
      throw new AppError('Cannot delete others\' messages', 403);
    }

    await prisma.chatMessage.update({ where: { id: messageId }, data: { deletedAt: new Date(), content: '[Deleted]' } });

    return res.json({ success: true, message: 'Message deleted' });
  } catch (err) {
    next(err);
  }
}

// ─── Add Reaction ────────────────────────────────────────────────────────────
export async function addReaction(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { messageId } = req.params;
    const { emoji } = z.object({ emoji: z.string().min(1).max(10) }).parse(req.body);

    const existing = await prisma.messageReaction.findFirst({
      where: { messageId, userId: req.user!.userId, emoji },
    });

    if (existing) {
      await prisma.messageReaction.delete({ where: { id: existing.id } });
      return res.json({ success: true, action: 'removed' });
    }

    const reaction = await prisma.messageReaction.create({
      data: { messageId, userId: req.user!.userId, emoji },
    });

    return res.json({ success: true, data: reaction, action: 'added' });
  } catch (err) {
    next(err);
  }
}
