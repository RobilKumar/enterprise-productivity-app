import { Router }    from 'express';
import { z }          from 'zod';
import { prisma }     from '../config/database';
import { authenticate, authorize, MANAGEMENT_ROLES, LEADER_AND_UP } from '../middleware/auth.middleware';
import { NotificationService } from '../services/notification.service';
import { emitGatepass }        from '../utils/socketHelper';
import type { AuthRequest }    from '../types';

const router = Router();
router.use(authenticate);

// ─── Zod Schemas ─────────────────────────────────────────────────

const CreateSchema = z.object({
  outpassType:        z.enum(['OFFICIAL', 'PERSONAL', 'MEDICAL', 'EMERGENCY']),
  destination:        z.string().min(2).max(200),
  purpose:            z.string().min(5).max(500),
  isFullDay:          z.boolean().optional().default(false),
  expectedReturnTime: z.string().optional(), // Required when isFullDay = false
  remarks:            z.string().max(300).optional(),
}).refine(
  data => data.isFullDay || !!data.expectedReturnTime,
  { message: 'expectedReturnTime is required for half-day passes', path: ['expectedReturnTime'] }
);

const ApproveSchema = z.object({
  approved:       z.boolean(),
  approvalRemarks: z.string().max(300).optional(),
});

// ─── Helper: resolve RM for a user ───────────────────────────────

async function resolveRM(userId: string) {
  const user = await prisma.user.findUnique({
    where:   { id: userId },
    include: {
      reportingManager: { select: { id: true, firstName: true, lastName: true } },
      team:             { include: { leader: { select: { id: true, firstName: true, lastName: true } } } },
    },
  });
  return user?.reportingManager ?? user?.team?.leader ?? null;
}

// ─── Helper: generate pass number ──────���─────────────────────────

async function generatePassNumber(): Promise<string> {
  const year  = new Date().getFullYear();
  const count = await prisma.gatepassRequest.count({
    where: {
      createdAt: {
        gte: new Date(`${year}-01-01T00:00:00.000Z`),
        lt:  new Date(`${year + 1}-01-01T00:00:00.000Z`),
      },
    },
  });
  return `GP-${year}-${String(count + 1).padStart(6, '0')}`;
}

// ─── User select helper ───────────────────────────────────────────

const userSelect = {
  id: true, firstName: true, lastName: true,
  employeeId: true,
  department: { select: { name: true } },
  role:       { select: { name: true, displayName: true } },
};

// ═══════��═══════════════════════════════��═══════════════════════════
//  EMPLOYEE ROUTES
// ════════���══════════════════════════════════════════════════════════

// GET /gatepass/my  — own requests
router.get('/my', async (req: AuthRequest, res, next) => {
  try {
    const requests = await prisma.gatepassRequest.findMany({
      where:   { requesterId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        approvedBy:       { select: { firstName: true, lastName: true } },
        exitRecordedBy:   { select: { firstName: true, lastName: true } },
        returnRecordedBy: { select: { firstName: true, lastName: true } },
      },
    });
    res.json({ success: true, data: requests });
  } catch (err) { next(err); }
});

// POST /gatepass  — raise new request
router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const body = CreateSchema.parse(req.body);
    const userId = req.user!.userId;

    const rm = await resolveRM(userId);

    const passNumber = await generatePassNumber();
    const request    = await prisma.gatepassRequest.create({
      data: {
        passNumber,
        requesterId:        userId,
        outpassType:        body.outpassType,
        destination:        body.destination,
        purpose:            body.purpose,
        isFullDay:          body.isFullDay ?? false,
        expectedReturnTime: body.isFullDay ? null : new Date(body.expectedReturnTime!),
        remarks:            body.remarks,
        status:             'PENDING',
      },
      include: { requester: { select: userSelect } },
    });

    const requester = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    const fullName  = `${requester?.firstName} ${requester?.lastName}`;

    const newPayload = {
      id: request.id, passNumber, requesterId: userId,
      name: fullName, isFullDay: body.isFullDay,
      destination: body.destination,
    };

    // Notify ONLY the RM — nobody else gets the toast
    if (rm) {
      await NotificationService.send({
        userId: rm.id,
        type:   'GATEPASS_PENDING',
        title:  '🚪 New Gatepass Request',
        body:   `${fullName} raised an outpass [${passNumber}]${body.isFullDay ? ' (Full Day)' : ''}. Please review.`,
        data:   { gatepassId: request.id },
      });
      emitGatepass('new', newPayload, [`user:${rm.id}`]);
    }
    // Silent refresh for Gate Terminal / HR Dashboard panels (no toast)
    emitGatepass('refresh', { type: 'new' }, ['company']);

    res.status(201).json({ success: true, data: request });
  } catch (err) { next(err); }
});

// PATCH /gatepass/:id/cancel  — cancel own pending request
router.patch('/:id/cancel', async (req: AuthRequest, res, next) => {
  try {
    const request = await prisma.gatepassRequest.findFirst({
      where: { id: req.params.id, requesterId: req.user!.userId },
    });
    if (!request)                      return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'PENDING')  return res.status(400).json({ success: false, message: 'Only PENDING requests can be cancelled' });

    const updated = await prisma.gatepassRequest.update({
      where: { id: req.params.id },
      data:  { status: 'CANCELLED' },
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// ═════════════��═════════════════════════════════════════════════════
//  MANAGER / APPROVER ROUTES
// ══════════════════════════════════════════════════════���════════════

// GET /gatepass/pending  — pending requests from reportees
router.get('/pending', authorize(...LEADER_AND_UP), async (req: AuthRequest, res, next) => {
  try {
    const managerId = req.user!.userId;
    const requests  = await prisma.gatepassRequest.findMany({
      where: {
        status: 'PENDING',
        OR: [
          // employee explicitly set this manager as RM
          { requester: { reportingManagerId: managerId } },
          // employee's team leader is this user, and employee has no explicit RM
          { requester: { reportingManagerId: null, team: { leaderId: managerId } } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      include: { requester: { select: { ...userSelect, team: { select: { name: true } } } } },
    });
    res.json({ success: true, data: requests });
  } catch (err) { next(err); }
});

// PATCH /gatepass/:id/approve  — approve or reject
router.patch('/:id/approve', authorize(...LEADER_AND_UP), async (req: AuthRequest, res, next) => {
  try {
    const { approved, approvalRemarks } = ApproveSchema.parse(req.body);
    const managerId = req.user!.userId;

    const request = await prisma.gatepassRequest.findUnique({
      where:   { id: req.params.id },
      include: {
        requester: {
          include: {
            reportingManager: true,
            team:             { include: { leader: true } },
          },
        },
      },
    });
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'PENDING') return res.status(400).json({ success: false, message: `Request is ${request.status}, not PENDING` });

    // Authorization: must be explicit RM, team leader (fallback), or ADMIN/SUPER_ADMIN
    const isExplicitRM   = request.requester.reportingManagerId === managerId;
    const isTeamLeader   = !request.requester.reportingManagerId && request.requester.team?.leaderId === managerId;
    const isAdmin        = ['ADMIN', 'SUPER_ADMIN'].includes(req.user!.role);
    if (!isExplicitRM && !isTeamLeader && !isAdmin) {
      return res.status(403).json({ success: false, message: 'You are not the reporting manager for this request' });
    }

    const newStatus = approved ? 'APPROVED' : 'REJECTED';
    const updated   = await prisma.gatepassRequest.update({
      where: { id: req.params.id },
      data:  { status: newStatus, approvedById: managerId, approvedAt: new Date(), approvalRemarks },
    });

    const requesterName = `${request.requester.firstName} ${request.requester.lastName}`;
    const socketPayload = {
      id: request.id, passNumber: request.passNumber,
      requesterId: request.requesterId, name: requesterName,
      destination: request.destination, approved,
    };

    if (approved) {
      await NotificationService.send({
        userId: request.requesterId,
        type:   'GATEPASS_APPROVED',
        title:  '✅ Gatepass Approved',
        body:   `Your outpass [${request.passNumber}] to ${request.destination} has been approved.`,
        data:   { gatepassId: request.id },
      });
      // Socket: notify ONLY the requester — their manager doesn't need a toast for their own action
      emitGatepass('approved', socketPayload, [`user:${request.requesterId}`]);
    } else {
      await NotificationService.send({
        userId: request.requesterId,
        type:   'GATEPASS_REJECTED',
        title:  '❌ Gatepass Request Rejected',
        body:   `Your outpass [${request.passNumber}] has been rejected.${approvalRemarks ? ` Reason: ${approvalRemarks}` : ''}`,
        data:   { gatepassId: request.id },
      });
      // Socket: notify ONLY the requester
      emitGatepass('rejected', { ...socketPayload, reason: approvalRemarks }, [`user:${request.requesterId}`]);
    }
    // Silent refresh for Gate Terminal / HR Dashboard (no toast for anyone)
    emitGatepass('refresh', { type: approved ? 'approved' : 'rejected' }, ['company']);

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// ═════════════════���═════════════════════════════════════════════════
//  SECURITY / GATE TERMINAL ROUTES
// ═══════════════════════════���═══════════════════════════════���═══════

// GET /gatepass/security  — APPROVED + EXITED passes (active)
router.get('/security', authorize(...MANAGEMENT_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const passes = await prisma.gatepassRequest.findMany({
      where:   { status: { in: ['APPROVED', 'EXITED'] } },
      orderBy: { approvedAt: 'desc' },
      include: {
        requester:       { select: { ...userSelect, team: { select: { name: true } } } },
        approvedBy:      { select: { firstName: true, lastName: true } },
        exitRecordedBy:  { select: { firstName: true, lastName: true } },
      },
    });
    res.json({ success: true, data: passes });
  } catch (err) { next(err); }
});

// PATCH /gatepass/:id/exit  — mark employee as exited
router.patch('/:id/exit', authorize(...MANAGEMENT_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const request = await prisma.gatepassRequest.findUnique({ where: { id: req.params.id } });
    if (!request)                       return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'APPROVED')  return res.status(400).json({ success: false, message: `Cannot mark exit — status is ${request.status}` });

    const updated = await prisma.gatepassRequest.update({
      where: { id: req.params.id },
      data:  { status: 'EXITED', actualExitTime: new Date(), exitRecordedById: req.user!.userId },
    });

    const emp = await prisma.user.findUnique({ where: { id: request.requesterId }, select: { firstName: true, lastName: true } });
    const empName = `${emp?.firstName} ${emp?.lastName}`;
    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    const admins = await prisma.user.findMany({
      where:  { role: { name: { in: ['ADMIN', 'SUPER_ADMIN'] } }, deletedAt: null },
      select: { id: true },
    });
    await NotificationService.broadcast(
      admins.map(a => a.id),
      'GATEPASS_EXITED',
      `🚶 Employee Exited — ${empName}`,
      `[${request.passNumber}] ${empName} left at ${time}.`,
      { gatepassId: request.id },
    );
    // Toast only for management (ADMIN/SUPER_ADMIN/MANAGER/TEAM_LEADER) — not the employee who exited
    emitGatepass('exited', {
      id: request.id, passNumber: request.passNumber,
      requesterId: request.requesterId, name: empName, time,
    }, ['mgmt']);
    // Silent refresh for everyone's panels
    emitGatepass('refresh', { type: 'exited' }, ['company']);

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// PATCH /gatepass/:id/return  — mark employee as returned
router.patch('/:id/return', authorize(...MANAGEMENT_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const request = await prisma.gatepassRequest.findUnique({ where: { id: req.params.id } });
    if (!request)                      return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'EXITED')   return res.status(400).json({ success: false, message: `Cannot mark return — status is ${request.status}` });

    const updated = await prisma.gatepassRequest.update({
      where: { id: req.params.id },
      data:  { status: 'RETURNED', actualReturnTime: new Date(), returnRecordedById: req.user!.userId },
    });

    const emp = await prisma.user.findUnique({ where: { id: request.requesterId }, select: { firstName: true, lastName: true } });
    const empName = `${emp?.firstName} ${emp?.lastName}`;
    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    const admins = await prisma.user.findMany({
      where:  { role: { name: { in: ['ADMIN', 'SUPER_ADMIN'] } }, deletedAt: null },
      select: { id: true },
    });
    await NotificationService.broadcast(
      admins.map(a => a.id),
      'GATEPASS_RETURNED',
      `🏠 Employee Returned — ${empName}`,
      `[${request.passNumber}] ${empName} returned at ${time}.`,
      { gatepassId: request.id },
    );
    // Toast only for management — not the employee who returned
    emitGatepass('returned', {
      id: request.id, passNumber: request.passNumber,
      requesterId: request.requesterId, name: empName, time,
    }, ['mgmt']);
    // Silent refresh for everyone's panels
    emitGatepass('refresh', { type: 'returned' }, ['company']);

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// ════════���══════════════════════════════════════════════════════════
//  HR / ADMIN DASHBOARD
// ════════════════════════════════════════���═════════════════════════��

// GET /gatepass/hr  — all requests with optional status filter
router.get('/hr', authorize(...MANAGEMENT_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const where: any = {};
    if (req.query.status) where.status = req.query.status;

    const requests = await prisma.gatepassRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        requester:        { select: { ...userSelect, team: { select: { name: true } } } },
        approvedBy:       { select: { firstName: true, lastName: true } },
        exitRecordedBy:   { select: { firstName: true, lastName: true } },
        returnRecordedBy: { select: { firstName: true, lastName: true } },
      },
    });
    res.json({ success: true, data: requests });
  } catch (err) { next(err); }
});

// ══════��════════════════════════════════��══════════════════════════���
//  ADMIN — SET REPORTING MANAGER FOR A USER
// ═══════════════════════════════��═══════════════════════════════════

// PATCH /gatepass/users/:userId/set-rm  — assign RM
router.patch('/users/:userId/set-rm', authorize('SUPER_ADMIN', 'ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const { reportingManagerId } = z.object({ reportingManagerId: z.string().nullable() }).parse(req.body);
    const updated = await prisma.user.update({
      where: { id: req.params.userId },
      data:  { reportingManagerId },
      select: { id: true, firstName: true, lastName: true, reportingManagerId: true },
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// GET /gatepass/users/:userId/rm  — get current RM of a user
router.get('/users/:userId/rm', async (req: AuthRequest, res, next) => {
  try {
    const rm = await resolveRM(req.params.userId);
    res.json({ success: true, data: rm });
  } catch (err) { next(err); }
});

export default router;
