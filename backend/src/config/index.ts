// ─── config/database.ts ───────────────────────────────────────
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

declare global { var __prisma: PrismaClient | undefined; }

export const prisma: PrismaClient = global.__prisma ?? new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'stdout' },
    { level: 'warn',  emit: 'stdout' },
  ],
});

if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;

prisma.$on('query' as never, (e: any) => {
  if (process.env.NODE_ENV === 'development') {
    logger.debug(`Query: ${e.query} [${e.duration}ms]`);
  }
});

// ─── config/redis.ts ─────────────────────────────────────────
import Redis from 'ioredis';

let redisClient: Redis;

export async function connectRedis(): Promise<void> {
  redisClient = new Redis({
    host:     process.env.REDIS_HOST || 'localhost',
    port:     Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    retryStrategy: (times) => Math.min(times * 100, 3000),
    maxRetriesPerRequest: 3,
  });

  redisClient.on('connect', () => logger.info('Redis connected'));
  redisClient.on('error',   (e) => logger.error('Redis error:', e));

  await redisClient.ping();
}

export { redisClient as redis };

// ─── config/minio.ts ─────────────────────────────────────────
import * as Minio from 'minio';

export let minioClient: Minio.Client;

export async function initMinIO(): Promise<void> {
  minioClient = new Minio.Client({
    endPoint:  process.env.MINIO_ENDPOINT || 'localhost',
    port:      Number(process.env.MINIO_PORT) || 9000,
    useSSL:    process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',
  });

  const buckets = [
    process.env.MINIO_BUCKET_TASKS       || 'task-attachments',
    process.env.MINIO_BUCKET_AVATARS     || 'user-avatars',
    process.env.MINIO_BUCKET_SCREENSHOTS || 'screenshots',
    process.env.MINIO_BUCKET_VOICE       || 'voice-notes',
  ];

  for (const bucket of buckets) {
    const exists = await minioClient.bucketExists(bucket);
    if (!exists) {
      await minioClient.makeBucket(bucket, 'us-east-1');
      logger.info(`MinIO bucket created: ${bucket}`);
    }
  }
  logger.info('MinIO initialised');
}

// ─── config/firebase.ts ──────────────────────────────────────
import firebaseAdmin from 'firebase-admin';

export async function initFirebaseAdmin(): Promise<void> {
  if (firebaseAdmin.apps.length) return;
  try {
    const credential = process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? firebaseAdmin.credential.applicationDefault()
      : firebaseAdmin.credential.cert({
          projectId:   process.env.FCM_PROJECT_ID   || '',
          clientEmail: process.env.FCM_CLIENT_EMAIL || '',
          privateKey:  (process.env.FCM_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        });

    firebaseAdmin.initializeApp({ credential });
    logger.info('Firebase Admin initialised');
  } catch (err) {
    logger.warn('Firebase Admin init skipped (no credentials):', (err as Error).message);
  }
}

// ─── config/swagger.ts ───────────────────────────────────────
import swaggerJsdoc from 'swagger-jsdoc';

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title:       'Enterprise Productivity API',
      version:     '1.0.0',
      description: 'Complete REST API for the Enterprise Team Productivity & Work Monitoring System',
      contact:     { name: 'API Support', email: 'support@company.com' },
    },
    servers: [
      { url: 'http://localhost:5000/api/v1', description: 'Development' },
      { url: 'https://api.company.com/api/v1', description: 'Production' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer' }, limit: { type: 'integer' },
            total: { type: 'integer' }, totalPages: { type: 'integer' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
});

// ─── utils/logger.ts ─────────────────────────────────────────
import winston from 'winston';
import path from 'path';

const logDir = process.env.LOG_DIR || './logs';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: 'productivity-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) =>
          `${timestamp} [${level}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`
        ),
      ),
    }),
    new winston.transports.File({ filename: path.join(logDir, 'error.log'),  level: 'error', maxsize: 10_000_000, maxFiles: 5 }),
    new winston.transports.File({ filename: path.join(logDir, 'combined.log'), maxsize: 10_000_000, maxFiles: 10 }),
  ],
});

// ─── utils/metrics.ts ────────────────────────────────────────
import promClient from 'prom-client';
import { Request, Response, NextFunction } from 'express';

promClient.collectDefaultMetrics({ prefix: 'productivity_' });

const httpRequestDuration = new promClient.Histogram({
  name:       'productivity_http_request_duration_seconds',
  help:       'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets:    [0.1, 0.5, 1, 2, 5],
});

const httpRequestTotal = new promClient.Counter({
  name:       'productivity_http_requests_total',
  help:       'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const labels = { method: req.method, route: req.route?.path || req.path, status_code: res.statusCode };
    end(labels);
    httpRequestTotal.inc(labels);
  });
  next();
}

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
}

// ─── utils/audit.ts ──────────────────────────────────────────
import { prisma as auditPrisma } from '../config/database';

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
    await auditPrisma.auditLog.create({
      data: {
        userId:    params.userId,
        action:    params.action,
        entity:    params.entity,
        entityId:  params.entityId,
        oldData:   params.oldData ? JSON.stringify(params.oldData)  : undefined,
        newData:   params.newData ? JSON.stringify(params.newData)  : undefined,
        ipAddress: (params.req as any)?.ip,
        userAgent: (params.req as any)?.headers?.['user-agent'],
      },
    });
  } catch {
    // Audit log errors should not break the main flow
  }
}

// ─── services/email.service.ts ───────────────────────────────
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

export async function sendEmail({ to, subject, html, text }: { to: string; subject: string; html?: string; text?: string; }): Promise<void> {
  await transporter.sendMail({ from: process.env.EMAIL_FROM, to, subject, html, text });
}

// ─── services/pdf.service.ts ─────────────────────────────────
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';

export async function generatePDF(template: string, data: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    const stream = new PassThrough();

    doc.pipe(stream);
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end',  () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text(data.title || 'Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text(`Period: ${data.period}`, { align: 'center' });
    doc.fontSize(10).text(`Generated: ${new Date(data.generatedAt).toLocaleString()}`, { align: 'center' });
    doc.moveDown(1);

    // Table header
    const cols = { title: 50, assignee: 220, status: 360, priority: 440, due: 510 };
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Task Title', cols.title, doc.y);
    doc.text('Assignee',   cols.assignee, doc.y, { width: 130 });
    doc.text('Status',     cols.status,   doc.y, { width: 80 });
    doc.text('Priority',   cols.priority, doc.y, { width: 70 });
    doc.text('Due Date',   cols.due,      doc.y, { width: 80 });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
    doc.moveDown(0.3);

    // Table rows
    doc.font('Helvetica').fontSize(8);
    for (const task of (data.tasks || [])) {
      if (doc.y > 720) { doc.addPage(); }
      const y = doc.y;
      doc.text((task.title || '').substring(0, 35), cols.title,    y, { width: 165 });
      doc.text(`${task.assignee?.firstName || ''} ${task.assignee?.lastName || ''}`, cols.assignee, y, { width: 130 });
      doc.text(task.status   || '',                cols.status,    y, { width: 80 });
      doc.text(task.priority || '',                cols.priority,  y, { width: 70 });
      doc.text(task.dueDate  ? new Date(task.dueDate).toLocaleDateString() : 'N/A', cols.due, y, { width: 80 });
      doc.moveDown(0.5);
    }

    doc.end();
  });
}

// ─── services/excel.service.ts ───────────────────────────────
import xlsx from 'xlsx';

export async function generateExcel(tasks: any[], csv = false): Promise<Buffer> {
  const rows = tasks.map((t) => ({
    'Task ID':       t.id,
    'Title':         t.title,
    'Assignee':      `${t.assignee?.firstName || ''} ${t.assignee?.lastName || ''}`,
    'Employee ID':   t.assignee?.employeeId || '',
    'Department':    t.assignee?.department?.name || '',
    'Team':          t.team?.name || '',
    'Status':        t.status,
    'Priority':      t.priority,
    'Category':      t.category || '',
    'Due Date':      t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '',
    'Completed At':  t.completedAt ? new Date(t.completedAt).toLocaleDateString() : '',
    'Est. Hours':    t.estimatedHours || '',
    'Actual Hours':  t.actualHours || '',
    'Escalated':     t.isEscalated ? 'Yes' : 'No',
    'Created At':    new Date(t.createdAt).toLocaleDateString(),
  }));

  const ws = xlsx.utils.json_to_sheet(rows);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Tasks');

  return xlsx.write(wb, { type: 'buffer', bookType: csv ? 'csv' : 'xlsx' });
}

// ─── services/audit.service.ts ───────────────────────────────
export { createAuditLog } from '../utils/metrics';

// ─── controllers/upload.controller.ts ────────────────────────
import { Response, NextFunction } from 'express';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { minioClient } from '../config/minio';
import { prisma as uploadPrisma } from '../config/database';
import { AppError as UploadError } from '../middleware/errorHandler';
import type { AuthRequest } from '../types';

export async function uploadAttachment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) throw new UploadError('No file uploaded', 400);

    const { id: taskId } = req.params;
    const file = req.file;
    const ext  = path.extname(file.originalname).toLowerCase();
    const key  = `${taskId}/${uuidv4()}${ext}`;

    let buffer    = file.buffer;
    let mimeType  = file.mimetype;
    let thumbKey: string | undefined;

    // Compress images
    if (file.mimetype.startsWith('image/')) {
      buffer = await sharp(file.buffer).resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
      mimeType = 'image/webp';

      const thumb  = await sharp(file.buffer).resize(200, 200, { fit: 'cover' }).webp({ quality: 70 }).toBuffer();
      thumbKey = `${taskId}/thumb_${uuidv4()}.webp`;
      await minioClient.putObject(process.env.MINIO_BUCKET_TASKS || 'task-attachments', thumbKey, thumb, thumb.length, { 'Content-Type': 'image/webp' });
    }

    const bucket = process.env.MINIO_BUCKET_TASKS || 'task-attachments';
    await minioClient.putObject(bucket, key, buffer, buffer.length, { 'Content-Type': mimeType });

    const type = file.mimetype.startsWith('image/')  ? 'IMAGE'
               : file.mimetype === 'application/pdf' ? 'PDF'
               : file.mimetype.startsWith('audio/')  ? 'VOICE_NOTE'
               : 'DOCUMENT';

    const attachment = await uploadPrisma.attachment.create({
      data: {
        taskId:       taskId || undefined,
        uploadedById: req.user!.userId,
        type:         type as any,
        fileName:     file.originalname,
        fileSize:     buffer.length,
        mimeType,
        storageKey:   key,
        thumbnailUrl: thumbKey,
      },
    });

    res.status(201).json({ success: true, data: attachment });
  } catch (err) {
    next(err);
  }
}

// ─── types/index.ts ──────────────────────────────────────────
import { Request } from 'express';

export interface JWTPayload {
  userId: string;
  role:   string;
  email:  string;
  iat?:   number;
  exp?:   number;
}

export interface AuthRequest extends Request {
  user?: JWTPayload;
}
