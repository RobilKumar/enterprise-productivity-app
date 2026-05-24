import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

declare global { var __prisma: PrismaClient | undefined; }

const isProd = process.env.NODE_ENV === 'production';

// In production: only log errors/warnings (query logging is expensive at scale).
// In development: emit query events so we can measure duration.
export const prisma: PrismaClient = global.__prisma ?? new PrismaClient({
  log: isProd
    ? [
        { level: 'error', emit: 'stdout' },
        { level: 'warn',  emit: 'stdout' },
      ]
    : [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'warn',  emit: 'stdout' },
      ],
});

if (!isProd) global.__prisma = prisma;

// Slow-query warning in development (threshold: 100ms)
prisma.$on('query' as never, (e: any) => {
  if (!isProd) {
    const dur = Number(e.duration);
    if (dur > 100) {
      logger.warn(`Slow query (${dur}ms): ${e.query}`);
    } else {
      logger.debug(`Query: ${e.query} [${dur}ms]`);
    }
  }
});

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('Database connected');
}
