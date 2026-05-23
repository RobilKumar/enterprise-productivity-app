import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate, authorize, MANAGEMENT_ROLES } from '../middleware/auth.middleware';
import type { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

// GET /plants — all active plants (with employee count)
router.get('/', async (_req, res, next) => {
  try {
    const plants = await prisma.plant.findMany({
      where:   { isActive: true },
      include: { _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: plants });
  } catch (err) { next(err); }
});

// POST /plants — create (ADMIN+)
router.post('/', authorize(...MANAGEMENT_ROLES), async (req, res, next) => {
  try {
    const { name, code, address, city, description } = req.body;
    const plant = await prisma.plant.create({
      data: { name, code: code || null, address, city, description },
    });
    res.status(201).json({ success: true, data: plant });
  } catch (err) { next(err); }
});

// PUT /plants/:id — update (ADMIN+)
router.put('/:id', authorize(...MANAGEMENT_ROLES), async (req, res, next) => {
  try {
    const { name, code, address, city, description, isActive } = req.body;
    const plant = await prisma.plant.update({
      where: { id: req.params.id },
      data:  { name, code: code || null, address, city, description, isActive },
    });
    res.json({ success: true, data: plant });
  } catch (err) { next(err); }
});

// DELETE /plants/:id — soft-delete (block if has active users)
router.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const count = await prisma.user.count({
      where: { plantId: req.params.id, deletedAt: null },
    });
    if (count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete plant — ${count} employee(s) are assigned to it`,
      });
    }
    await prisma.plant.update({
      where: { id: req.params.id },
      data:  { isActive: false },
    });
    res.json({ success: true, message: 'Plant deactivated' });
  } catch (err) { next(err); }
});

// PATCH /plants/:id/assign — assign an employee to this plant
router.patch('/:id/assign', authorize(...MANAGEMENT_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId is required' });

    const user = await prisma.user.update({
      where:  { id: userId },
      data:   { plantId: req.params.id },
      select: { id: true, firstName: true, lastName: true, employeeId: true },
    });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// PATCH /plants/:id/unassign — remove plant from an employee
router.patch('/:id/unassign', authorize(...MANAGEMENT_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId is required' });

    const user = await prisma.user.update({
      where:  { id: userId },
      data:   { plantId: null },
      select: { id: true, firstName: true, lastName: true },
    });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

export default router;
