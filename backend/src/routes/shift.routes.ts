import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate, authorize, MANAGEMENT_ROLES } from '../middleware/auth.middleware';
import type { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

// Helper: parse workingDays string → array for API responses
const parseShift = (s: any) => ({
  ...s,
  workingDays: (() => { try { return typeof s.workingDays === 'string' ? JSON.parse(s.workingDays) : (s.workingDays || [1,2,3,4,5]); } catch { return [1,2,3,4,5]; } })(),
});

// GET /shifts — all active shifts with employee count
router.get('/', async (_req, res, next) => {
  try {
    const shifts = await prisma.shift.findMany({
      where:   { isActive: true },
      include: { _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: shifts.map(parseShift) });
  } catch (err) { next(err); }
});

// POST /shifts — create shift (ADMIN+)
router.post('/', authorize(...MANAGEMENT_ROLES), async (req, res, next) => {
  try {
    const { name, shiftType, startTime, endTime, workingDays, gracePeriodMins, description } = req.body;
    const shift = await prisma.shift.create({
      data: {
        name,
        shiftType: shiftType || 'FLEXIBLE',
        startTime,
        endTime,
        workingDays: JSON.stringify(workingDays || [1, 2, 3, 4, 5]),
        gracePeriodMins: gracePeriodMins ?? 15,
        description,
      },
    });
    res.status(201).json({ success: true, data: parseShift(shift) });
  } catch (err) { next(err); }
});

// PUT /shifts/:id — update shift
router.put('/:id', authorize(...MANAGEMENT_ROLES), async (req, res, next) => {
  try {
    const { name, shiftType, startTime, endTime, workingDays, gracePeriodMins, description, isActive } = req.body;
    const updateData: any = { name, shiftType, startTime, endTime, gracePeriodMins, description, isActive };
    if (workingDays !== undefined) updateData.workingDays = JSON.stringify(workingDays);
    const shift = await prisma.shift.update({
      where: { id: req.params.id },
      data:  updateData,
    });
    res.json({ success: true, data: parseShift(shift) });
  } catch (err) { next(err); }
});

// DELETE /shifts/:id — soft-delete (block if has active users)
router.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const count = await prisma.user.count({
      where: { shiftId: req.params.id, deletedAt: null },
    });
    if (count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete shift — ${count} employee(s) are on this shift`,
      });
    }
    await prisma.shift.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ success: true, message: 'Shift deactivated' });
  } catch (err) { next(err); }
});

// PATCH /shifts/:id/assign — assign this shift to an employee
router.patch('/:id/assign', authorize(...MANAGEMENT_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId is required' });

    const user = await prisma.user.update({
      where:  { id: userId },
      data:   { shiftId: req.params.id },
      select: { id: true, firstName: true, lastName: true, employeeId: true,
                shift: { select: { id: true, name: true, startTime: true, endTime: true } } },
    });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// PATCH /shifts/:id/unassign — remove shift from employee
router.patch('/:id/unassign', authorize(...MANAGEMENT_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId is required' });

    const user = await prisma.user.update({
      where:  { id: userId },
      data:   { shiftId: null },
      select: { id: true, firstName: true, lastName: true },
    });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// GET /shifts/:id/employees — list employees on this shift
router.get('/:id/employees', authorize(...MANAGEMENT_ROLES), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where:  { shiftId: req.params.id, deletedAt: null },
      select: { id: true, employeeId: true, firstName: true, lastName: true,
                department: { select: { name: true } },
                plant:      { select: { name: true } },
                role:       { select: { name: true } } },
      orderBy: { firstName: 'asc' },
    });
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
});

export default router;
