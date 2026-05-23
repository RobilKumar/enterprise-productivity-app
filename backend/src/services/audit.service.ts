import { prisma } from '../config/database';
import { logger }  from '../utils/logger';
import { Request }  from 'express';

interface AuditParams {
  userId?:   string;
  action:    string;
  entity:    string;
  entityId?: string;
  oldData?:  unknown;
  newData?:  unknown;
  req?:      Request;
}

export async function createAuditLog(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId:    params.userId,
        action:    params.action,
        entity:    params.entity,
        entityId:  params.entityId,
        oldData:   params.oldData ? JSON.stringify(params.oldData) : undefined,
        newData:   params.newData ? JSON.stringify(params.newData) : undefined,
        ipAddress: params.req?.ip,
        userAgent: params.req?.headers?.['user-agent'],
      },
    });
  } catch (err) {
    // Don't crash main flow if audit log fails
    logger.warn('Audit log write failed:', err);
  }
}
