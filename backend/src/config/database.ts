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

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('Database connected');
}
