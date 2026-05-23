import 'dotenv/config';
import express    from 'express';
import http       from 'http';
import cors       from 'cors';
import helmet     from 'helmet';
import compression from 'compression';
import morgan     from 'morgan';
import { Server as SocketIOServer } from 'socket.io';
import swaggerUi  from 'swagger-ui-express';

import { connectRedis }      from './config/redis';
import { initMinIO }         from './config/minio';
import { initFirebaseAdmin } from './config/firebase';
import { swaggerSpec }       from './config/swagger';
import { logger }            from './utils/logger';
import { metricsMiddleware, metricsHandler } from './utils/metrics';
import { errorHandler }      from './middleware/errorHandler';
import { requestLogger }     from './middleware/requestLogger';
import { globalRateLimiter } from './middleware/rateLimiter';
import { initSocketHandlers } from './sockets';
import { startCronJobs }      from './jobs';
import { setIO }              from './services/notification.service';
import { prisma }             from './config/database';

import authRoutes          from './routes/auth.routes';
import roleRoutes          from './routes/role.routes';
import userRoutes          from './routes/user.routes';
import taskRoutes          from './routes/task.routes';
import teamRoutes          from './routes/team.routes';
import departmentRoutes    from './routes/department.routes';
import attendanceRoutes    from './routes/attendance.routes';
import leaveRoutes         from './routes/leave.routes';
import kpiRoutes           from './routes/kpi.routes';
import notificationRoutes  from './routes/notification.routes';
import reportRoutes        from './routes/report.routes';
import chatRoutes          from './routes/chat.routes';
import announcementRoutes  from './routes/announcement.routes';
import reviewRoutes        from './routes/review.routes';
import shiftRoutes         from './routes/shift.routes';
import summaryRoutes       from './routes/summary.routes';
import dashboardRoutes     from './routes/dashboard.routes';
import timerRoutes         from './routes/timer.routes';
import auditRoutes         from './routes/audit.routes';
import leaderboardRoutes   from './routes/leaderboard.routes';
import plantRoutes         from './routes/plant.routes';

const app    = express();
const server = http.createServer(app);

// Trust the first proxy (nginx) — required for X-Forwarded-For and rate limiting
app.set('trust proxy', 1);

// ─── Socket.IO ──────────────────────────────────────────────
export const io = new SocketIOServer(server, {
  cors: {
    origin:      process.env.FRONTEND_URL?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  pingTimeout:  60000,
  pingInterval: 25000,
});
setIO(io);

// ─── Middleware ──────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: process.env.FRONTEND_URL?.split(',') || 'http://localhost:3000', credentials: true, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', { stream: { write: msg => logger.http(msg.trim()) } }));
app.use(metricsMiddleware);
app.use(requestLogger);
app.use(globalRateLimiter);

// ─── Health & Metrics ────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', version: process.env.APP_VERSION || '1.0.0', timestamp: new Date().toISOString() }));
app.get('/metrics', metricsHandler);

// ─── Temporary Debug (remove after login is fixed) ───────────
app.get('/debug/db', async (_req, res) => {
  try {
    const userCount  = await prisma.user.count();
    const superadmin = await prisma.user.findFirst({
      where: { email: 'superadmin@company.com' },
      select: { id: true, email: true, status: true, passwordHash: true, deletedAt: true },
    });
    const dbUrl = process.env.DATABASE_URL || '(not set)';
    const maskedUrl = dbUrl.replace(/:([^@:]+)@/, ':***@');
    res.json({
      userCount,
      superadmin,
      dbUrl: maskedUrl,
      nodeEnv: process.env.NODE_ENV,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API Docs ────────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: 'Enterprise Productivity API', customCss: '.swagger-ui .topbar { display: none }' }));

// ─── Routes ──────────────────────────────────────────────────
const V1 = '/api/v1';
app.use(`${V1}/auth`,          authRoutes);
app.use(`${V1}/roles`,         roleRoutes);
app.use(`${V1}/users`,         userRoutes);
app.use(`${V1}/tasks`,         taskRoutes);
app.use(`${V1}/teams`,         teamRoutes);
app.use(`${V1}/departments`,   departmentRoutes);
app.use(`${V1}/attendance`,    attendanceRoutes);
app.use(`${V1}/leaves`,        leaveRoutes);
app.use(`${V1}/kpi`,           kpiRoutes);
app.use(`${V1}/notifications`,  notificationRoutes);
app.use(`${V1}/reports`,       reportRoutes);
app.use(`${V1}/chat`,          chatRoutes);
app.use(`${V1}/announcements`,  announcementRoutes);
app.use(`${V1}/reviews`,       reviewRoutes);
app.use(`${V1}/shifts`,        shiftRoutes);
app.use(`${V1}/summaries`,     summaryRoutes);
app.use(`${V1}/dashboard`,     dashboardRoutes);
app.use(`${V1}/timer`,         timerRoutes);
app.use(`${V1}/audit`,         auditRoutes);
app.use(`${V1}/leaderboard`,   leaderboardRoutes);
app.use(`${V1}/plants`,        plantRoutes);

app.use((_req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use(errorHandler);

// ─── Bootstrap ───────────────────────────────────────────────
async function bootstrap() {
  try {
    await connectRedis();
    await initMinIO();
    await initFirebaseAdmin();
    initSocketHandlers(io);
    startCronJobs();
    const PORT = Number(process.env.PORT) || 5000;
    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Server on port ${PORT} [${process.env.NODE_ENV}]`);
      logger.info(`📚 Docs: http://localhost:${PORT}/api-docs`);
    });
  } catch (err) {
    logger.error('Bootstrap failed:', err);
    process.exit(1);
  }
}
bootstrap();
export default app;
