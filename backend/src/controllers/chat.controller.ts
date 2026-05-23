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
        members: { some: { userId: req.user!.userId } },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, isOnline: true } },
          },
        },
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
    const { name, memberIds, isGroupChat } = z.object({
      name:        z.string().min(1).max(100),
      memberIds:   z.array(z.string().uuid()),
      isGroupChat: z.boolean().default(false),
      // Accept but ignore legacy fields
      isPublic:    z.boolean().optional(),
      type:        z.string().optional(),
    }).parse(req.body);

    const allMembers = [...new Set([req.user!.userId, ...memberIds])];

    // For direct messages (2 people), check if room already exists
    if (!isGroupChat && allMembers.length === 2) {
      const existing = await prisma.chatRoom.findFirst({
        where: {
          isGroupChat: false,
          AND: [
            { members: { some: { userId: req.user!.userId } } },
            { members: { some: { userId: memberIds[0] } } },
          ],
        },
      });
      if (existing) return res.json({ success: true, data: existing });
    }

    const room = await prisma.chatRoom.create({
      data: {
        name,
        isGroupChat: isGroupChat || allMembers.length > 2,
        members: {
          create: allMembers.map((uid) => ({ userId: uid })),
        },
      },
      include: {
        members: {
          include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
        },
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
    if (!member) throw new AppError('Not a member of this room', 403);

    const messages = await prisma.chatMessage.findMany({
      where: {
        roomId,
        deletedAt: null,
        ...(cursor
          ? {
              createdAt: {
                lt: (await prisma.chatMessage.findUnique({ where: { id: cursor } }))?.createdAt,
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take:    limit,
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    // Mark room as read by updating lastReadAt for this member
    await prisma.chatRoomMember.updateMany({
      where: { roomId, userId: req.user!.userId },
      data:  { lastReadAt: new Date() },
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
    const { content } = z.object({
      content:   z.string().min(1).max(4000),
      // Accept but ignore schema-missing fields
      replyToId: z.string().uuid().optional(),
      type:      z.string().optional(),
    }).parse(req.body);

    // Verify membership
    const member = await prisma.chatRoomMember.findFirst({
      where: { roomId, userId: req.user!.userId },
    });
    if (!member) throw new AppError('Not a member of this room', 403);

    const message = await prisma.chatMessage.create({
      data:    { roomId, senderId: req.user!.userId, content },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
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

    await prisma.chatMessage.update({
      where: { id: messageId },
      data:  { deletedAt: new Date(), content: '[Deleted]' },
    });

    return res.json({ success: true, message: 'Message deleted' });
  } catch (err) {
    next(err);
  }
}

// ─── Add Reaction (stub — MessageReaction not in schema) ────────────────────
export async function addReaction(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // Reactions are not supported in the current schema
    return res.status(501).json({
      success: false,
      message: 'Reactions are not yet supported',
    });
  } catch (err) {
    next(err);
  }
}
