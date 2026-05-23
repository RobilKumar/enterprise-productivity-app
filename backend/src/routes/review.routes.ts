import { Router } from 'express';
import { z }      from 'zod';
import { prisma } from '../config/database';
import { authenticate, authorize, MANAGEMENT_ROLES } from '../middleware/auth.middleware';
import type { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', authorize(...MANAGEMENT_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const page   = Number(req.query.page)  || 1;
    const limit  = Number(req.query.limit) || 20;
    const userId = req.query.userId as string | undefined;
    const where: any = {};
    if (userId) where.userId = userId;
    const [items, total] = await prisma.$transaction([
      prisma.performanceReview.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page-1)*limit, take: limit,
        include: {
          user:     { select: { firstName: true, lastName: true, employeeId: true } },
          reviewer: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.performanceReview.count({ where }),
    ]);
    res.json({ success: true, data: items, pagination: { page, limit, total, totalPages: Math.ceil(total/limit) } });
  } catch (err) { next(err); }
});

router.get('/my', async (req: AuthRequest, res, next) => {
  try {
    const items = await prisma.performanceReview.findMany({
      where:   { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      include: { reviewer: { select: { firstName: true, lastName: true } } },
    });
    res.json({ success: true, data: items });
  } catch (err) { next(err); }
});

router.post('/', authorize(...MANAGEMENT_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({
      userId:           z.string().uuid(),
      period:           z.string(),
      overallScore:     z.number().min(1).max(5),
      productivityScore:z.number().min(1).max(5).optional(),
      qualityScore:     z.number().min(1).max(5).optional(),
      attendanceScore:  z.number().min(1).max(5).optional(),
      teamworkScore:    z.number().min(1).max(5).optional(),
      comments:         z.string().optional(),
      goals:            z.string().optional(),
      status:           z.enum(['DRAFT','SUBMITTED','ACKNOWLEDGED']).default('SUBMITTED'),
    }).parse(req.body);

    const review = await prisma.performanceReview.create({
      data: { ...body, reviewerId: req.user!.userId },
    });
    res.status(201).json({ success: true, data: review });
  } catch (err) { next(err); }
});

router.patch('/:id/acknowledge', async (req: AuthRequest, res, next) => {
  try {
    await prisma.performanceReview.updateMany({
      where: { id: req.params.id, userId: req.user!.userId },
      data:  { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
