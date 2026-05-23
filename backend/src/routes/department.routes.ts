import { Router } from 'express';
import { prisma }  from '../config/database';
import { authenticate, authorize, MANAGEMENT_ROLES } from '../middleware/auth.middleware';

const router = Router();
router.use(authenticate);

router.get('/', async (_req, res, next) => {
  try {
    const depts = await prisma.department.findMany({
      where:   { isActive: true },
      include: {
        manager: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        _count:  { select: { users: true, teams: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: depts });
  } catch (err) { next(err); }
});

router.post('/', authorize(...MANAGEMENT_ROLES), async (req, res, next) => {
  try {
    const dept = await prisma.department.create({ data: req.body });
    res.status(201).json({ success: true, data: dept });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const dept = await prisma.department.findUnique({
      where:   { id: req.params.id },
      include: {
        manager: { select: { id: true, firstName: true, lastName: true } },
        teams:   { where: { isActive: true }, include: { _count: { select: { members: true } } } },
        _count:  { select: { users: true } },
      },
    });
    if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });
    res.json({ success: true, data: dept });
  } catch (err) { next(err); }
});

router.put('/:id', authorize(...MANAGEMENT_ROLES), async (req, res, next) => {
  try {
    const dept = await prisma.department.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: dept });
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const count = await prisma.user.count({ where: { departmentId: req.params.id, deletedAt: null } });
    if (count > 0) return res.status(400).json({ success: false, message: `Cannot delete department with ${count} active users` });
    await prisma.department.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ success: true, message: 'Department deactivated' });
  } catch (err) { next(err); }
});

export default router;
