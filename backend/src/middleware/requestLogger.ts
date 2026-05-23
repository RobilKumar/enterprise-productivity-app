import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const id = uuidv4();
  (req as any).requestId = id;
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    logger.http(`${req.method} ${req.path} ${res.statusCode} ${ms}ms [${id}]`);
  });
  next();
}
