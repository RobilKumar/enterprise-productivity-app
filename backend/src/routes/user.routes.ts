import { Router }  from 'express';
import multer       from 'multer';
import * as XLSX    from 'xlsx';
import { prisma }   from '../config/database';
import { authenticate, authorize, MANAGEMENT_ROLES, selfOrAdmin } from '../middleware/auth.middleware';
import { uploadRateLimiter } from '../middleware/rateLimiter';
import { AppError }          from '../middleware/errorHandler';
import { uploadAvatar }      from '../controllers/upload.controller';
import { withCache, invalidateByPattern, TTL } from '../utils/cache';
import { createAuditLog }    from '../services/audit.service';
import bcrypt                from 'bcryptjs';
import type { AuthRequest }  from '../types';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

// GET /users/bulk-upload/template  — download blank Excel template
router.get('/bulk-upload/template', authorize(...MANAGEMENT_ROLES), (_req, res) => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['employeeId','firstName','lastName','email','phone','role','department','team'],
    ['EMP00010','John','Doe','john.doe@company.com','+1234567890','EMPLOYEE','Engineering','Backend Team'],
    ['EMP00011','Jane','Smith','jane.smith@company.com','','EMPLOYEE','Engineering','Frontend Team'],
  ]);
  ws['!cols'] = [10,12,12,28,16,12,16,14].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Employees');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="employee-bulk-upload-template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// POST /users/bulk-upload  — create employees from Excel
router.post('/bulk-upload', authorize(...MANAGEMENT_ROLES), upload.single('file'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.file) throw new AppError('No file uploaded', 400);

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (rows.length === 0) throw new AppError('Excel file is empty or has no data rows', 400);
    if (rows.length > 200)  throw new AppError('Maximum 200 rows per upload', 400);

    // Resolve role / dept / team look-up tables once
    const [allRoles, allDepts, allTeams] = await Promise.all([
      prisma.role.findMany(),
      prisma.department.findMany(),
      prisma.team.findMany(),
    ]);

    const roleMap  = Object.fromEntries(allRoles.map(r => [r.name.toUpperCase(), r.id]));
    const deptMap  = Object.fromEntries(allDepts.map(d => [d.name.toLowerCase(), d.id]));
    const teamMap  = Object.fromEntries(allTeams.map(t => [t.name.toLowerCase(), t.id]));

    const DEFAULT_PASSWORD = 'Welcome@123';
    const defaultHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    const results: any[] = [];
    let created = 0;
    let failed  = 0;

    for (let i = 0; i < rows.length; i++) {
      const row  = rows[i];
      const rowN = i + 2; // Excel row number (header = 1)

      const firstName = String(row['firstName'] || row['first_name'] || '').trim();
      const lastName  = String(row['lastName']  || row['last_name']  || '').trim();
      const email     = String(row['email']     || '').trim().toLowerCase();
      const phone     = String(row['phone']     || '').trim() || undefined;
      const roleName  = String(row['role']      || 'EMPLOYEE').trim().toUpperCase();
      const deptName  = String(row['department']|| '').trim().toLowerCase();
      const teamName  = String(row['team']      || '').trim().toLowerCase();
      const empId     = String(row['employeeId']|| row['employee_id'] || '').trim().toUpperCase() || undefined;

      if (!firstName || !lastName || !email) {
        results.push({ row: rowN, email, status: 'failed', error: 'firstName, lastName, and email are required' });
        failed++;
        continue;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        results.push({ row: rowN, email, status: 'failed', error: 'Invalid email address' });
        failed++;
        continue;
      }

      const roleId = roleMap[roleName] || roleMap['EMPLOYEE'];
      const departmentId = deptName ? deptMap[deptName] : undefined;
      const teamId       = teamName ? teamMap[teamName] : undefined;

      try {
        // Auto-generate employee ID if not provided
        let resolvedEmpId = empId;
        if (!resolvedEmpId) {
          const last = await prisma.user.findFirst({ orderBy: { employeeId: 'desc' } });
          const lastNum = last?.employeeId?.match(/\d+/)?.[0];
          const next = lastNum ? String(Number(lastNum) + 1).padStart(5, '0') : '00001';
          resolvedEmpId = `EMP${next}`;
        }

        await prisma.user.create({
          data: {
            employeeId:   resolvedEmpId,
            firstName,
            lastName,
            email,
            phone,
            passwordHash: defaultHash,
            roleId,
            departmentId,
            teamId,
            status:       'ACTIVE',
            joiningDate:  new Date(),
          },
        });

        results.push({ row: rowN, email, employeeId: resolvedEmpId, status: 'created' });
        created++;
      } catch (err: any) {
        const msg = err?.code === 'P2002'
          ? `Duplicate: ${err?.meta?.target?.join(', ') || 'email or employeeId'} already exists`
          : err?.message || 'Unknown error';
        results.push({ row: rowN, email, status: 'failed', error: msg });
        failed++;
      }
    }

    await invalidateByPattern('users:list:*');

    res.json({
      success: true,
      data: {
        summary: { total: rows.length, created, failed },
        defaultPassword: DEFAULT_PASSWORD,
        results,
      },
    });
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

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash: hash } });
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) { next(err); }
});

// PATCH /users/:id/employee-id  (SUPER_ADMIN + ADMIN — change an employee's ID)
router.patch('/:id/employee-id', authorize('SUPER_ADMIN', 'ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const { newEmployeeId } = req.body;

    if (!newEmployeeId || typeof newEmployeeId !== 'string') {
      throw new AppError('newEmployeeId is required', 400);
    }

    const formatted = newEmployeeId.trim().toUpperCase();

    if (!/^[A-Z0-9_\-]{1,20}$/.test(formatted)) {
      throw new AppError('Employee ID must be 1–20 alphanumeric characters (letters, digits, _ or -)', 400);
    }

    // Fetch the target user
    const existing = await prisma.user.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) throw new AppError('User not found', 404);

    // Ensure the new ID is not already taken (by another user)
    if (formatted !== existing.employeeId) {
      const conflict = await prisma.user.findUnique({ where: { employeeId: formatted } });
      if (conflict) throw new AppError(`Employee ID "${formatted}" is already taken`, 409);
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data:  { employeeId: formatted, updatedAt: new Date() },
      select: { id: true, employeeId: true, firstName: true, lastName: true, email: true },
    });

    await invalidateByPattern('users:list:*');
    await invalidateByPattern(`user:${req.params.id}:*`);

    await createAuditLog({
      userId:   req.user!.userId,
      action:   'UPDATE_EMPLOYEE_ID',
      entity:   'User',
      entityId: req.params.id,
      oldData:  { employeeId: existing.employeeId },
      newData:  { employeeId: formatted },
      req,
    });

    res.json({ success: true, data: updated, message: `Employee ID updated to "${formatted}"` });
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
