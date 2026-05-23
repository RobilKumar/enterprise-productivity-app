import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { NotificationService } from '../services/notification.service';
import { createAuditLog } from '../services/audit.service';
import { GamificationService } from '../services/gamification.service';
import type { AuthRequest } from '../types';

// ─── Zod Schemas ─────────────────────────────────────────────
const CreateTaskSchema = z.object({
  title:           z.string().min(1).max(300),
  description:     z.string().optional(),
  assigneeId:      z.string().uuid(),
  teamId:          z.string().uuid().optional(),
  priority:        z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  category:        z.string().optional(),
  dueDate:         z.string().datetime().optional(),
  estimatedHours:  z.number().positive().optional(),
  isRecurring:     z.boolean().default(false),
  recurringPattern: z.enum(['daily', 'weekly', 'monthly']).optional(),
  recurringEndDate: z.string().datetime().optional(),
  slaHours:        z.number().positive().optional(),
  proofRequired:   z.boolean().default(false),
  dependencies:    z.array(z.string().uuid()).optional(),
});

const UpdateTaskStatusSchema = z.object({
  status:          z.enum(['ACCEPTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'REJECTED', 'REOPENED']),
  rejectionReason: z.string().optional(),
  notes:           z.string().optional(),
});

const TaskListSchema = z.object({
  page:         z.coerce.number().min(1).default(1),
  limit:        z.coerce.number().min(1).max(100).default(20),
  status:       z.string().optional(),
  priority:     z.string().optional(),
  assigneeId:   z.string().uuid().optional(),
  teamId:       z.string().uuid().optional(),
  category:     z.string().optional(),
  search:       z.string().optional(),
  dueBefore:    z.string().optional(),
  dueAfter:     z.string().optional(),
  isEscalated:  z.coerce.boolean().optional(),
  sortBy:       z.enum(['createdAt', 'dueDate', 'priority', 'status']).default('createdAt'),
  sortOrder:    z.enum(['asc', 'desc']).default('desc'),
});

// Priority sort weights for SQL ordering
const PRIORITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

// ─── Create Task ──────────────────────────────────────────────
export async function createTask(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const body = CreateTaskSchema.parse(req.body);

    // Verify assignee exists
    const assignee = await prisma.user.findFirst({
      where: { id: body.assigneeId, deletedAt: null, status: 'ACTIVE' },
    });
    if (!assignee) throw new AppError('Assignee not found or inactive', 404);

    const task = await prisma.task.create({
      data: {
        title:           body.title,
        description:     body.description,
        assigneeId:      body.assigneeId,
        createdById:     req.user!.userId,
        teamId:          body.teamId,
        priority:        body.priority,
        category:        body.category,
        dueDate:         body.dueDate ? new Date(body.dueDate) : undefined,
        estimatedHours:  body.estimatedHours,
        isRecurring:     body.isRecurring,
        recurringPattern: body.recurringPattern,
        recurringEndDate: body.recurringEndDate ? new Date(body.recurringEndDate) : undefined,
        slaHours:        body.slaHours,
        proofRequired:   body.proofRequired,
      },
      include: {
        assignee:   { select: { id: true, firstName: true, lastName: true, email: true, fcmToken: true } },
        createdBy:  { select: { id: true, firstName: true, lastName: true } },
        team:       { select: { id: true, name: true } },
      },
    });

    // Add task dependencies
    if (body.dependencies && body.dependencies.length > 0) {
      await prisma.taskDependency.createMany({
        data: body.dependencies.map((depId) => ({ taskId: task.id, dependsOnId: depId })),
        skipDuplicates: true,
      });
    }

    // Send notification to assignee
    await NotificationService.send({
      userId: body.assigneeId,
      type:   'TASK_ASSIGNED',
      title:  'New Task Assigned',
      body:   `You've been assigned: "${body.title}"`,
      data:   { taskId: task.id },
      fcmToken: assignee.fcmToken || undefined,
    });

    await createAuditLog({
      userId: req.user!.userId, action: 'CREATE_TASK', entity: 'Task', entityId: task.id, newData: body, req,
    });

    return res.status(201).json({ success: true, data: task });
  } catch (err) {
    next(err);
  }
}

// ─── Get Task List ────────────────────────────────────────────
export async function getTasks(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const query = TaskListSchema.parse(req.query);
    const { userId, role } = req.user!;

    const where: any = { deletedAt: null };

    // RBAC filtering: employees only see own tasks
    if (role === 'EMPLOYEE') where.assigneeId = userId;
    else if (role === 'TEAM_LEADER') {
      const leader = await prisma.user.findUnique({ where: { id: userId }, select: { teamId: true } });
      if (leader?.teamId) where.teamId = leader.teamId;
    }

    // Filters
    if (query.status)     where.status     = query.status;
    if (query.priority)   where.priority   = query.priority;
    if (query.assigneeId && role !== 'EMPLOYEE') where.assigneeId = query.assigneeId;
    if (query.teamId)     where.teamId     = query.teamId;
    if (query.category)   where.category   = query.category;
    if (query.isEscalated !== undefined) where.isEscalated = query.isEscalated;
    if (query.dueBefore)  where.dueDate    = { ...where.dueDate, lt: new Date(query.dueBefore) };
    if (query.dueAfter)   where.dueDate    = { ...where.dueDate, gt: new Date(query.dueAfter) };
    if (query.search) {
      where.OR = [
        { title:       { contains: query.search } },
        { description: { contains: query.search } },
        { category:    { contains: query.search } },
      ];
    }

    const [tasks, total] = await prisma.$transaction([
      prisma.task.findMany({
        where,
        skip:  (query.page - 1) * query.limit,
        take:  query.limit,
        orderBy: query.sortBy === 'priority'
          ? [{ priority: 'asc' }, { createdAt: 'desc' }]
          : [{ [query.sortBy]: query.sortOrder }],
        include: {
          assignee:   { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          createdBy:  { select: { id: true, firstName: true, lastName: true } },
          team:       { select: { id: true, name: true } },
          _count:     { select: { comments: true, attachments: true } },
        },
      }),
      prisma.task.count({ where }),
    ]);

    return res.json({
      success: true,
      data:    tasks,
      pagination: {
        page:       query.page,
        limit:      query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Get Single Task ──────────────────────────────────────────
export async function getTask(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const task = await prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: {
        assignee:     { select: { id: true, firstName: true, lastName: true, avatarUrl: true, email: true } },
        createdBy:    { select: { id: true, firstName: true, lastName: true } },
        team:         { select: { id: true, name: true } },
        comments:     {
          where:   { deletedAt: null },
          include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
          orderBy: { createdAt: 'asc' },
        },
        attachments:  true,
        history:      { orderBy: { createdAt: 'desc' }, take: 20 },
        dependencies: { include: { dependsOn: { select: { id: true, title: true, status: true } } } },
        workTimeLogs: { where: { userId: req.user!.userId }, orderBy: { startTime: 'desc' }, take: 10 },
      },
    });

    if (!task) throw new AppError('Task not found', 404);

    // RBAC: employee can only see own tasks
    if (req.user!.role === 'EMPLOYEE' && task.assigneeId !== req.user!.userId) {
      throw new AppError('Access denied', 403);
    }

    return res.json({ success: true, data: task });
  } catch (err) {
    next(err);
  }
}

// ─── Update Task ──────────────────────────────────────────────
export async function updateTask(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const body = z.object({
      title:          z.string().min(1).optional(),
      description:    z.string().optional(),
      priority:       z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
      category:       z.string().optional(),
      dueDate:        z.string().datetime().optional().nullable(),
      estimatedHours: z.number().positive().optional(),
      assigneeId:     z.string().uuid().optional(),
      teamId:         z.string().uuid().optional().nullable(),
    }).parse(req.body);

    const existing = await prisma.task.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError('Task not found', 404);

    // Only admin/manager/creator can update task details
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(req.user!.role) && existing.createdById !== req.user!.userId) {
      throw new AppError('Insufficient permissions to update this task', 403);
    }

    const updateData: any = { ...body };
    if (body.dueDate) updateData.dueDate = new Date(body.dueDate);

    const task = await prisma.task.update({
      where:   { id },
      data:    updateData,
      include: { assignee: { select: { id: true, firstName: true, lastName: true } } },
    });

    // Notify assignee if reassigned
    if (body.assigneeId && body.assigneeId !== existing.assigneeId) {
      const newAssignee = await prisma.user.findUnique({ where: { id: body.assigneeId } });
      await NotificationService.send({
        userId: body.assigneeId,
        type:   'TASK_ASSIGNED',
        title:  'Task Reassigned to You',
        body:   `Task "${task.title}" has been assigned to you.`,
        data:   { taskId: task.id },
        fcmToken: newAssignee?.fcmToken || undefined,
      });
    } else if (existing.assigneeId !== req.user!.userId) {
      await NotificationService.send({
        userId: existing.assigneeId,
        type:   'TASK_UPDATED',
        title:  'Task Updated',
        body:   `Task "${task.title}" has been updated.`,
        data:   { taskId: task.id },
      });
    }

    await createAuditLog({
      userId: req.user!.userId, action: 'UPDATE_TASK', entity: 'Task', entityId: id,
      oldData: existing, newData: body, req,
    });

    return res.json({ success: true, data: task });
  } catch (err) {
    next(err);
  }
}

// ─── Update Task Status ───────────────────────────────────────
export async function updateTaskStatus(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { status, rejectionReason, notes } = UpdateTaskStatusSchema.parse(req.body);

    const task = await prisma.task.findFirst({ where: { id, deletedAt: null } });
    if (!task) throw new AppError('Task not found', 404);

    // Status transition rules
    const allowedTransitions: Record<string, string[]> = {
      PENDING:     ['ACCEPTED', 'REJECTED'],
      ACCEPTED:    ['IN_PROGRESS', 'REJECTED'],
      IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'REJECTED'],
      ON_HOLD:     ['IN_PROGRESS', 'REJECTED'],
      COMPLETED:   ['REOPENED'],
      REJECTED:    ['REOPENED'],
      REOPENED:    ['ACCEPTED', 'IN_PROGRESS'],
    };

    if (!allowedTransitions[task.status]?.includes(status)) {
      throw new AppError(`Cannot transition from ${task.status} to ${status}`, 400);
    }

    // Only assignee can accept/start/complete; admin can reject/reopen
    if (['ACCEPTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED'].includes(status) &&
        task.assigneeId !== req.user!.userId &&
        !['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(req.user!.role)) {
      throw new AppError('Only the assignee can update this status', 403);
    }

    if (status === 'REJECTED' && !rejectionReason) {
      throw new AppError('Rejection reason is required', 400);
    }

    const updateData: any = { status };
    if (status === 'COMPLETED') updateData.completedAt = new Date();
    if (status === 'IN_PROGRESS' && !task.startedAt) updateData.startedAt = new Date();
    if (rejectionReason) updateData.rejectionReason = rejectionReason;

    const updated = await prisma.task.update({ where: { id }, data: updateData });

    // Handle gamification on completion
    if (status === 'COMPLETED') {
      await GamificationService.onTaskCompleted(task.assigneeId, task);
    }

    // Notify relevant parties
    const notifyUserId = status === 'COMPLETED' || status === 'REJECTED'
      ? task.createdById
      : task.assigneeId;

    if (notifyUserId !== req.user!.userId) {
      await NotificationService.send({
        userId: notifyUserId,
        type:   status === 'COMPLETED' ? 'TASK_COMPLETED' : 'TASK_UPDATED',
        title:  `Task ${status.charAt(0) + status.slice(1).toLowerCase()}`,
        body:   `Task "${task.title}" status changed to ${status}.`,
        data:   { taskId: task.id },
      });
    }

    return res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// ─── Delete Task (soft) ───────────────────────────────────────
export async function deleteTask(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(req.user!.role)) {
      throw new AppError('Insufficient permissions', 403);
    }

    const task = await prisma.task.findFirst({ where: { id, deletedAt: null } });
    if (!task) throw new AppError('Task not found', 404);

    await prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });

    await createAuditLog({
      userId: req.user!.userId, action: 'DELETE_TASK', entity: 'Task', entityId: id, req,
    });

    return res.json({ success: true, message: 'Task deleted successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── Add Comment ──────────────────────────────────────────────
export async function addComment(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { content, isInternal } = z.object({
      content:    z.string().min(1),
      isInternal: z.boolean().default(false),
    }).parse(req.body);

    const task = await prisma.task.findFirst({ where: { id, deletedAt: null } });
    if (!task) throw new AppError('Task not found', 404);

    // Internal comments only for managers+
    if (isInternal && !['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEADER'].includes(req.user!.role)) {
      throw new AppError('Cannot create internal comments', 403);
    }

    const comment = await prisma.taskComment.create({
      data:    { taskId: id, userId: req.user!.userId, content, isInternal },
      include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    });

    // Notify assignee/creator about new comment
    const notifyId = task.assigneeId === req.user!.userId ? task.createdById : task.assigneeId;
    await NotificationService.send({
      userId: notifyId,
      type:   'COMMENT_ADDED',
      title:  'New Comment',
      body:   `New comment on task "${task.title}"`,
      data:   { taskId: id, commentId: comment.id },
    });

    return res.status(201).json({ success: true, data: comment });
  } catch (err) {
    next(err);
  }
}
