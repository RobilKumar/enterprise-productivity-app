import { Router } from 'express';
import { z }       from 'zod';
import { prisma }  from '../config/database';
import { authenticate } from '../middleware/auth.middleware';
import type { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

// GET /chat/rooms
router.get('/rooms', async (req: AuthRequest, res, next) => {
  try {
    const rooms = await prisma.chatRoom.findMany({
      where: { members: { some: { userId: req.user!.userId } } },
      include: {
        members: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, isOnline: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1,
          include: { sender: { select: { firstName: true, lastName: true } } } },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ success: true, data: rooms });
  } catch (err) { next(err); }
});

// POST /chat/rooms
router.post('/rooms', async (req: AuthRequest, res, next) => {
  try {
    const { name, memberIds, isGroupChat } = z.object({
      name:        z.string().min(1).max(100),
      memberIds:   z.array(z.string().uuid()).min(1),
      isGroupChat: z.boolean().default(false),
    }).parse(req.body);

    const allMembers = [...new Set([req.user!.userId, ...memberIds])];

    // For 1:1 chat, check if room already exists
    if (!isGroupChat && allMembers.length === 2) {
      const existing = await prisma.chatRoom.findFirst({
        where: {
          isGroupChat: false,
          AND: allMembers.map((id) => ({ members: { some: { userId: id } } })),
        },
      });
      if (existing) return res.json({ success: true, data: existing });
    }

    const room = await prisma.chatRoom.create({
      data: {
        name, isGroupChat,
        members: { create: allMembers.map((id) => ({ userId: id })) },
      },
      include: {
        members: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } },
      },
    });

    res.status(201).json({ success: true, data: room });
  } catch (err) { next(err); }
});

// GET /chat/rooms/:roomId/messages
router.get('/rooms/:roomId/messages', async (req: AuthRequest, res, next) => {
  try {
    const member = await prisma.chatRoomMember.findFirst({ where: { roomId: req.params.roomId, userId: req.user!.userId } });
    if (!member) return res.status(403).json({ success: false, message: 'Not a member of this room' });

    const page  = Number(req.query.page)  || 1;
    const limit = Number(req.query.limit) || 50;

    const [messages, total] = await prisma.$transaction([
      prisma.chatMessage.findMany({
        where:   { roomId: req.params.roomId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
        include: { sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
      }),
      prisma.chatMessage.count({ where: { roomId: req.params.roomId, deletedAt: null } }),
    ]);

    // Mark as read
    await prisma.chatRoomMember.updateMany({
      where: { roomId: req.params.roomId, userId: req.user!.userId },
      data:  { lastReadAt: new Date() },
    });

    res.json({ success: true, data: messages.reverse(), pagination: { page, limit, total, totalPages: Math.ceil(total/limit) } });
  } catch (err) { next(err); }
});

// DELETE /chat/messages/:id  (soft delete own messages)
router.delete('/messages/:id', async (req: AuthRequest, res, next) => {
  try {
    await prisma.chatMessage.updateMany({
      where: { id: req.params.id, senderId: req.user!.userId },
      data:  { deletedAt: new Date(), content: 'This message was deleted' },
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
