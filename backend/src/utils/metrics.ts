import promClient from 'prom-client';
import { Request, Response, NextFunction } from 'express';

promClient.collectDefaultMetrics({ prefix: 'productivity_' });

const httpDuration = new promClient.Histogram({
  name:       'productivity_http_request_duration_seconds',
  help:       'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets:    [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});

const httpTotal = new promClient.Counter({
  name:       'productivity_http_requests_total',
  help:       'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const activeConnections = new promClient.Gauge({
  name: 'productivity_active_connections',
  help: 'Active Socket.IO connections',
});

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const route = req.route?.path || req.path;
    const labels = { method: req.method, route, status_code: res.statusCode };
    end(labels);
    httpTotal.inc(labels);
  });
  next();
}

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
}

export function incSocketConnections(delta: 1 | -1): void {
  activeConnections.inc(delta);
}
