import { Router } from 'express';
import { prisma }  from '../config/database';
import { authenticate, authorize } from '../middleware/auth.middleware';
import type { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

router.get('/', authorize('SUPER_ADMIN', 'ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const page = Number(req.query.page) || 1; const limit = Number(req.query.limit) || 50;
    const where: any = {};
    if (req.query.userId) where.userId = req.query.userId;
    if (req.query.entity) where.entity = req.query.entity;
    if (req.query.action) where.action = req.query.action;
    const [logs, total] = await prisma.$transaction([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page-1)*limit, take: limit,
        include: { user: { select: { firstName: true, lastName: true, employeeId: true } } } }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ success: true, data: logs, pagination: { page, limit, total, totalPages: Math.ceil(total/limit) } });
  } catch (err) { next(err); }
});

export default router;
