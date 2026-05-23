// ─── kpi.routes.ts ───────────────────────────────────────────
import { Router } from 'express';
import { authenticate, authorize, MANAGEMENT_ROLES, ALL_ROLES } from '../middleware/auth.middleware';
import {
  getDashboard, getUserKPI, getTeamKPI, getCompanyKPI,
  downloadReport, getEmployeeRanking,
} from '../controllers/kpi.controller';

const kpiRouter = Router();
kpiRouter.use(authenticate);
kpiRouter.get('/dashboard',              authorize(...ALL_ROLES),         getDashboard);
kpiRouter.get('/user/:userId?',          authorize(...ALL_ROLES),         getUserKPI);
kpiRouter.get('/team/:teamId',           authorize(...ALL_ROLES),         getTeamKPI);
kpiRouter.get('/company',                authorize(...MANAGEMENT_ROLES),  getCompanyKPI);
kpiRouter.get('/ranking',                authorize(...MANAGEMENT_ROLES),  getEmployeeRanking);
kpiRouter.get('/report/download',        authorize(...MANAGEMENT_ROLES),  downloadReport);
export { kpiRouter as default };

// ─── dashboard.routes.ts ──────────────────────────────────────
import { Router as DR } from 'express';
import { authenticate as da, authorize as dz, ALL_ROLES as DAR } from '../middleware/auth.middleware';
import { getDashboard as gd } from '../controllers/kpi.controller';
const dashboardRouter = DR();
dashboardRouter.use(da);
dashboardRouter.get('/', dz(...DAR), gd);
export { dashboardRouter };

// ─── notification.routes.ts ───────────────────────────────────
import { Router as NR } from 'express';
import { prisma } from '../config/database';
import { authenticate as na } from '../middleware/auth.middleware';
import type { AuthRequest } from '../types';

const notifRouter = NR();
notifRouter.use(na);

notifRouter.get('/', async (req: AuthRequest, res) => {
  const page  = Number(req.query.page)  || 1;
  const limit = Number(req.query.limit) || 20;
  const [items, total] = await prisma.$transaction([
    prisma.notification.findMany({
      where:   { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
    prisma.notification.count({ where: { userId: req.user!.userId } }),
  ]);
  res.json({ success: true, data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

notifRouter.patch('/:id/read', async (req: AuthRequest, res) => {
  await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user!.userId },
    data:  { isRead: true, readAt: new Date() },
  });
  res.json({ success: true });
});

notifRouter.patch('/read-all', async (req: AuthRequest, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.userId, isRead: false },
    data:  { isRead: true, readAt: new Date() },
  });
  res.json({ success: true });
});

notifRouter.get('/unread-count', async (req: AuthRequest, res) => {
  const count = await prisma.notification.count({ where: { userId: req.user!.userId, isRead: false } });
  res.json({ success: true, data: { count } });
});

export { notifRouter };

// ─── user.routes.ts ───────────────────────────────────────────
import { Router as UR } from 'express';
import { authenticate as ua, authorize as uz, MANAGEMENT_ROLES as UMR } from '../middleware/auth.middleware';
import { prisma as up } from '../config/database';
import bcrypt from 'bcryptjs';
import type { AuthRequest as UAR } from '../types';

const userRouter = UR();
userRouter.use(ua);

userRouter.get('/', uz(...UMR), async (req: UAR, res, next) => {
  try {
    const page   = Number(req.query.page)  || 1;
    const limit  = Number(req.query.limit) || 20;
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const deptId = req.query.departmentId as string | undefined;
    const teamId = req.query.teamId as string | undefined;

    const where: any = { deletedAt: null };
    if (status) where.status       = status;
    if (deptId) where.departmentId = deptId;
    if (teamId) where.teamId       = teamId;
    if (search) where.OR = [
      { firstName: { contains: search } },
      { lastName:  { contains: search } },
      { email:     { contains: search } },
      { employeeId:{ contains: search } },
    ];

    const [users, total] = await up.$transaction([
      up.user.findMany({ where, skip: (page-1)*limit, take: limit,
        select: { id:true, employeeId:true, firstName:true, lastName:true, email:true, phone:true,
          status:true, avatarUrl:true, joiningDate:true, isOnline:true, totalPoints:true,
          role:{select:{name:true,displayName:true}},
          department:{select:{id:true,name:true}},
          team:{select:{id:true,name:true}},
        },
        orderBy: { firstName: 'asc' },
      }),
      up.user.count({ where }),
    ]);
    res.json({ success:true, data:users, pagination:{ page,limit,total, totalPages:Math.ceil(total/limit) } });
  } catch(e){ next(e); }
});

userRouter.get('/:id', async (req: UAR, res, next) => {
  try {
    const user = await up.user.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        role:true, department:true, team:true,
        badges:{ include:{ badge:true } },
        _count:{ select:{ assignedTasks:true } },
      },
    });
    if (!user) return res.status(404).json({ success:false, message:'User not found' });
    const { passwordHash, twoFactorSecret, ...safe } = user as any;
    res.json({ success:true, data:safe });
  } catch(e){ next(e); }
});

userRouter.put('/:id', uz(...UMR), async (req: UAR, res, next) => {
  try {
    const { firstName,lastName,phone,status,roleId,departmentId,teamId,shiftType,address } = req.body;
    const user = await up.user.update({
      where: { id: req.params.id },
      data:  { firstName,lastName,phone,status,roleId,departmentId,teamId,shiftType,address, updatedAt: new Date() },
      include: { role:true },
    });
    res.json({ success:true, data:user });
  } catch(e){ next(e); }
});

userRouter.patch('/:id/change-password', async (req: UAR, res, next) => {
  try {
    if (req.user!.userId !== req.params.id && !['SUPER_ADMIN','ADMIN'].includes(req.user!.role))
      return res.status(403).json({ success:false, message:'Access denied' });
    const { currentPassword, newPassword } = req.body;
    const user = await up.user.findUnique({ where:{ id:req.params.id } });
    if (!user) return res.status(404).json({ success:false, message:'Not found' });
    if (currentPassword) {
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return res.status(400).json({ success:false, message:'Current password incorrect' });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await up.user.update({ where:{ id:req.params.id }, data:{ passwordHash:hash } });
    res.json({ success:true, message:'Password changed' });
  } catch(e){ next(e); }
});

userRouter.delete('/:id', uz('SUPER_ADMIN','ADMIN'), async (req: UAR, res, next) => {
  try {
    await up.user.update({ where:{ id:req.params.id }, data:{ deletedAt:new Date(), status:'INACTIVE' } });
    res.json({ success:true, message:'User deactivated' });
  } catch(e){ next(e); }
});

userRouter.patch('/:id/fcm-token', async (req: UAR, res, next) => {
  try {
    await up.user.update({ where:{ id:req.params.id }, data:{ fcmToken: req.body.fcmToken } });
    res.json({ success:true });
  } catch(e){ next(e); }
});

export { userRouter };

// ─── team.routes.ts ──────────────────────────────────────────
import { Router as TR } from 'express';
import { authenticate as ta, authorize as tz, MANAGEMENT_ROLES as TMR } from '../middleware/auth.middleware';
import { prisma as tp } from '../config/database';
import type { AuthRequest as TAR } from '../types';

const teamRouter = TR();
teamRouter.use(ta);

teamRouter.get('/', async (_req, res, next) => {
  try {
    const teams = await tp.team.findMany({
      where:   { isActive: true },
      include: {
        leader:     { select: { id:true,firstName:true,lastName:true,avatarUrl:true } },
        department: { select: { id:true,name:true } },
        _count:     { select: { members:true, tasks:true } },
      },
      orderBy: { name:'asc' },
    });
    res.json({ success:true, data:teams });
  } catch(e){ next(e); }
});

teamRouter.post('/', tz(...TMR), async (req: TAR, res, next) => {
  try {
    const team = await tp.team.create({ data: req.body, include: { leader:true, department:true } });
    // Create a team chat room automatically
    await tp.chatRoom.create({ data: { name:`${team.name} Chat`, isGroupChat:true, teamId:team.id } });
    res.status(201).json({ success:true, data:team });
  } catch(e){ next(e); }
});

teamRouter.get('/:id', async (req, res, next) => {
  try {
    const team = await tp.team.findUnique({
      where:   { id:req.params.id },
      include: {
        leader:     { select:{ id:true,firstName:true,lastName:true,avatarUrl:true } },
        department: true,
        members:    { where:{ deletedAt:null }, select:{ id:true,firstName:true,lastName:true,avatarUrl:true,status:true,role:{ select:{ name:true } } } },
      },
    });
    if (!team) return res.status(404).json({ success:false, message:'Team not found' });
    res.json({ success:true, data:team });
  } catch(e){ next(e); }
});

teamRouter.put('/:id', tz(...TMR), async (req: TAR, res, next) => {
  try {
    const team = await tp.team.update({ where:{ id:req.params.id }, data:req.body });
    res.json({ success:true, data:team });
  } catch(e){ next(e); }
});

export { teamRouter };
