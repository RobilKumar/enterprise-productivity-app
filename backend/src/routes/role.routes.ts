import { Router } from 'express';
import { prisma }  from '../config/database';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { createAuditLog } from '../services/audit.service';
import type { AuthRequest } from '../types';

const router = Router();
router.use(authenticate);

// Helper: parse permissions string → array for API responses
const parseRole = (r: any) => ({
  ...r,
  permissions: (() => { try { return typeof r.permissions === 'string' ? JSON.parse(r.permissions) : (r.permissions || []); } catch { return []; } })(),
});

// GET /roles — list all roles with permissions (for dropdowns & rights master)
router.get('/', async (_req, res, next) => {
  try {
    const roles = await prisma.role.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: roles.map(parseRole) });
  } catch (err) { next(err); }
});

// GET /roles/:id — single role details
router.get('/:id', authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const role = await prisma.role.findUnique({
      where:   { id: req.params.id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
    res.json({ success: true, data: parseRole(role) });
  } catch (err) { next(err); }
});

// PUT /roles/:id/permissions — update role permissions (SUPER_ADMIN only)
router.put('/:id/permissions', authorize('SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ success: false, message: 'permissions must be an array' });
    }

    const oldRole = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!oldRole) return res.status(404).json({ success: false, message: 'Role not found' });

    // Cannot change SUPER_ADMIN permissions
    if (oldRole.name === 'SUPER_ADMIN') {
      return res.status(400).json({ success: false, message: 'SUPER_ADMIN permissions cannot be changed' });
    }

    const role = await prisma.role.update({
      where: { id: req.params.id },
      data:  { permissions: JSON.stringify(permissions) },
    });

    await createAuditLog({
      userId:   req.user!.userId,
      action:   'UPDATE_ROLE_PERMISSIONS',
      entity:   'Role',
      entityId: role.id,
      oldData:  { permissions: JSON.parse(oldRole.permissions || '[]') },
      newData:  { permissions },
      req,
    });

    res.json({ success: true, data: parseRole(role) });
  } catch (err) { next(err); }
});

// PUT /roles/:id/display-name — rename role display name (SUPER_ADMIN only)
router.put('/:id/display-name', authorize('SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const { displayName } = req.body;
    if (!displayName) return res.status(400).json({ success: false, message: 'displayName required' });
    const role = await prisma.role.update({
      where: { id: req.params.id },
      data:  { displayName },
    });
    res.json({ success: true, data: role });
  } catch (err) { next(err); }
});

export default router;
