import { Router } from 'express';
import { z }       from 'zod';
import { prisma }  from '../config/database';
import { authenticate, authorize, MANAGEMENT_ROLES } from '../middleware/auth.middleware';
import { NotificationService } from '../services/notification.service';
import type { AuthRequest }    from '../types';

const router = Router();
router.use(authenticate);

const Schema = z.object({
  title:        z.string().min(1).max(200),
  content:      z.string().min(1),
  type:         z.enum(['GENERAL', 'URGENT', 'POLICY', 'EVENT']).default('GENERAL'),
  targetType:   z.enum(['COMPANY', 'DEPARTMENT', 'TEAM']).default('COMPANY'),
  targetId:     z.string().uuid().optional(),
  expiresAt:    z.string().datetime().optional(),
  isPinned:     z.boolean().default(false),
});

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const page  = Number(req.query.page)  || 1;
    const limit = Number(req.query.limit) || 20;

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { teamId: true, departmentId: true },
    });

    const [items, total] = await prisma.$transaction([
      prisma.announcement.findMany({
        where: {
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
          AND: [{
            OR: [
              { targetType: 'COMPANY' },
              { targetType: 'DEPARTMENT', targetId: user?.departmentId || '' },
              { targetType: 'TEAM',       targetId: user?.teamId       || '' },
            ],
          }],
        },
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        skip:    (page - 1) * limit,
        take:    limit,
        include: { author: { select: { firstName: true, lastName: true, avatarUrl: true } } },
      }),
      prisma.announcement.count({ where: { isActive: true } }),
    ]);

    res.json({ success: true, data: items, pagination: { page, limit, total, totalPages: Math.ceil(total/limit) } });
  } catch (err) { next(err); }
});

router.post('/', authorize(...MANAGEMENT_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const body = Schema.parse(req.body);
    const ann  = await prisma.announcement.create({
      data: { ...body, authorId: req.user!.userId, expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined },
    });

    // Broadcast notification
    if (body.targetType === 'COMPANY') {
      const users = await prisma.user.findMany({ where: { deletedAt: null, status: 'ACTIVE' }, select: { id: true } });
      await NotificationService.broadcast(users.map((u) => u.id), 'ANNOUNCEMENT', `📢 ${body.title}`, body.content.substring(0, 100), { announcementId: ann.id });
    }

    res.status(201).json({ success: true, data: ann });
  } catch (err) { next(err); }
});

router.put('/:id', authorize(...MANAGEMENT_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const ann = await prisma.announcement.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: ann });
  } catch (err) { next(err); }
});

router.delete('/:id', authorize(...MANAGEMENT_ROLES), async (req, res, next) => {
  try {
    await prisma.announcement.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
