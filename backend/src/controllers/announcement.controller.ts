import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { NotificationService } from '../services/notification.service';
import type { AuthRequest } from '../types';

const CreateAnnouncementSchema = z.object({
  title:       z.string().min(1).max(200),
  content:     z.string().min(1),
  priority:    z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  targetAudience: z.enum(['ALL', 'DEPARTMENT', 'TEAM']).default('ALL'),
  departmentId: z.string().uuid().optional(),
  teamId:       z.string().uuid().optional(),
  expiresAt:    z.string().datetime().optional(),
  isPinned:     z.boolean().default(false),
});

export async function getAnnouncements(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { page, limit } = z.object({
      page:  z.coerce.number().default(1),
      limit: z.coerce.number().default(20),
    }).parse(req.query);

    const user = await prisma.user.findUnique({
      where:  { id: req.user!.userId },
      select: { departmentId: true, teamId: true },
    });

    const where: any = {
      isActive: true,
      OR: [
        { targetAudience: 'ALL' },
        { targetAudience: 'DEPARTMENT', departmentId: user?.departmentId },
        { targetAudience: 'TEAM', teamId: user?.teamId },
      ],
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      ],
    };

    const [announcements, total] = await prisma.$transaction([
      prisma.announcement.findMany({
        where,
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: [{ isPinned: 'desc' }, { priority: 'desc' }, { createdAt: 'desc' }],
        include: { author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
      }),
      prisma.announcement.count({ where }),
    ]);

    return res.json({ success: true, data: announcements, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
}

export async function createAnnouncement(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(req.user!.role)) {
      throw new AppError('Insufficient permissions', 403);
    }

    const body = CreateAnnouncementSchema.parse(req.body);

    const announcement = await prisma.announcement.create({
      data: { ...body, authorId: req.user!.userId, expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });

    // Broadcast push notification for urgent announcements
    if (body.priority === 'URGENT') {
      await NotificationService.broadcast({
        type:  'ANNOUNCEMENT',
        title: `🚨 ${body.title}`,
        body:  body.content.substring(0, 100),
        data:  { announcementId: announcement.id },
      });
    }

    return res.status(201).json({ success: true, data: announcement });
  } catch (err) {
    next(err);
  }
}

export async function updateAnnouncement(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(req.user!.role)) {
      throw new AppError('Insufficient permissions', 403);
    }

    const { id } = req.params;
    const body = CreateAnnouncementSchema.partial().parse(req.body);

    const announcement = await prisma.announcement.update({
      where: { id },
      data:  body,
    });

    return res.json({ success: true, data: announcement });
  } catch (err) {
    next(err);
  }
}

export async function deleteAnnouncement(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user!.role)) {
      throw new AppError('Insufficient permissions', 403);
    }

    await prisma.announcement.update({ where: { id: req.params.id }, data: { isActive: false } });
    return res.json({ success: true, message: 'Announcement deleted' });
  } catch (err) {
    next(err);
  }
}
