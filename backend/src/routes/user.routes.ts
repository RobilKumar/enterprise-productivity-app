import { Router }  from 'express';
import multer       from 'multer';
import { prisma }   from '../config/database';
import { authenticate, authorize, MANAGEMENT_ROLES, selfOrAdmin } from '../middleware/auth.middleware';
import { uploadRateLimiter } from '../middleware/rateLimiter';
import { AppError }          from '../middleware/errorHandler';
import { uploadAvatar }      from '../controllers/upload.controller';
import { withCache, invalidateByPattern, TTL } from '../utils/cache';
import bcrypt                from 'bcryptjs';
import type { AuthRequest }  from '../types';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(authenticate);

// GET /users
router.get('/', authorize(...MANAGEMENT_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const page   = Number(req.query.page)  || 1;
    const limit  = Number(req.query.limit) || 20;
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const deptId = req.query.departmentId as string | undefined;
    const teamId = req.query.teamId as string | undefined;
    const role   = req.query.role   as string | undefined;

    const where: any = { deletedAt: null };
    if (status) where.status       = status;
    if (deptId) where.departmentId = deptId;
    if (teamId) where.teamId       = teamId;
    if (role)   where.role         = { name: role };
    if (search) where.OR = [
      { firstName:  { contains: search, mode: 'insensitive' } },
      { lastName:   { contains: search, mode: 'insensitive' } },
      { email:      { contains: search, mode: 'insensitive' } },
      { employeeId: { contains: search, mode: 'insensitive' } },
    ];

    // Cache large dropdown fetches (limit >= 100, no search/filters) for 5 min
    const isDropdownFetch = !search && !status && !deptId && !teamId && !role && limit >= 100;
    const cacheKey = `users:list:p${page}:l${limit}:s${status || ''}:d${deptId || ''}:t${teamId || ''}:r${role || ''}`;

    const runQuery = async () => {
      const [users, total] = await prisma.$transaction([
        prisma.user.findMany({
          where,
          skip:    (page - 1) * limit,
          take:    limit,
          select: {
            id: true, employeeId: true, firstName: true, lastName: true,
            email: true, phone: true, status: true, avatarUrl: true,
            joiningDate: true, isOnline: true, totalPoints: true, lastActiveAt: true,
            role:       { select: { name: true, displayName: true } },
            department: { select: { id: true, name: true } },
            team:       { select: { id: true, name: true } },
            _count:     { select: { assignedTasks: true } },
          },
          orderBy: { firstName: 'asc' },
        }),
        prisma.user.count({ where }),
      ]);
      return { users, total };
    };

    const { users, total } = isDropdownFetch
      ? await withCache(cacheKey, TTL.LONG, runQuery)
      : await runQuery();

    res.json({ success: true, data: users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});

// GET /users/:id
router.get('/:id', selfOrAdmin('id'), async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({
      where:   { id: req.params.id, deletedAt: null },
      include: {
        role:       true,
        department: true,
        team:       { include: { leader: { select: { id: true, firstName: true, lastName: true } } } },
        badges:     { include: { badge: true } },
        shift:      true,
        _count:     { select: { assignedTasks: true, createdTasks: true } },
      },
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const { passwordHash, twoFactorSecret, ...safe } = user as any;
    res.json({ success: true, data: safe });
  } catch (err) { next(err); }
});

// PUT /users/:id
router.put('/:id', authorize(...MANAGEMENT_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const { firstName, lastName, phone, status, roleId, departmentId, teamId, shiftType, address, joiningDate } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data:  { firstName, lastName, phone, status, roleId, departmentId, teamId, shiftType, address, joiningDate: joiningDate ? new Date(joiningDate) : undefined, updatedAt: new Date() },
      include: { role: true, department: true, team: true },
    });
    // Invalidate user list cache and team leader's cached teamId
    await invalidateByPattern('users:list:*');
    await invalidateByPattern(`user:${req.params.id}:*`);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// PATCH /users/:id/change-password
router.patch('/:id/change-password', selfOrAdmin('id'), async (req: AuthRequest, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ success: false, message: 'Not found' });

    if (currentPassword) {
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) throw new AppError('Current password incorrect', 400);
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash: hash } });
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) { next(err); }
});

// DELETE /users/:id  (soft delete)
router.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    await prisma.user.update({ where: { id: req.params.id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
    await invalidateByPattern('users:list:*');
    await invalidateByPattern(`user:${req.params.id}:*`);
    res.json({ success: true, message: 'User deactivated' });
  } catch (err) { next(err); }
});

// PATCH /users/:id/fcm-token
router.patch('/:id/fcm-token', selfOrAdmin('id'), async (req, res, next) => {
  try {
    await prisma.user.update({ where: { id: req.params.id }, data: { fcmToken: req.body.fcmToken } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /users/:id/avatar
router.post('/:id/avatar', selfOrAdmin('id'), uploadRateLimiter, upload.single('avatar'), uploadAvatar);

// GET /users/:id/tasks
router.get('/:id/tasks', selfOrAdmin('id'), async (req, res, next) => {
  try {
    const page   = Number(req.query.page)  || 1;
    const limit  = Number(req.query.limit) || 20;
    const status = req.query.status as string | undefined;
    const where: any = { assigneeId: req.params.id, deletedAt: null };
    if (status) where.status = status;

    const [tasks, total] = await prisma.$transaction([
      prisma.task.findMany({ where, skip: (page-1)*limit, take: limit, orderBy: { createdAt: 'desc' },
        include: { team: { select: { name: true } }, _count: { select: { comments: true } } } }),
      prisma.task.count({ where }),
    ]);
    res.json({ success: true, data: tasks, pagination: { page, limit, total, totalPages: Math.ceil(total/limit) } });
  } catch (err) { next(err); }
});

// GET /users/online  — who is online right now
router.get('/status/online', authorize(...MANAGEMENT_ROLES), async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where:  { isOnline: true, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, avatarUrl: true, lastActiveAt: true, team: { select: { name: true } } },
    });
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
});

export default router;
