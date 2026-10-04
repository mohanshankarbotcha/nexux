import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import {
  NexusError,
  logger,
  sanitizeObject,
  DEFAULT_SERVER_CONFIG,
} from '@nexus/core';
import { createHealthRouter } from './routes/health.js';
import { createWorkspaceRouter } from './routes/workspace.js';
import { createProviderRouter } from './routes/provider.js';
import { createTaskRouter } from './routes/task.js';
import { createUsageRouter } from './routes/usage.js';
import { createSessionRouter } from './routes/session.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createNexusApp() {
  const app = express();

  // Basic middleware
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '10mb' }));

  // Request logger & correlation ID middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId =
      (req.headers['x-correlation-id'] as string) ||
      (req.headers['x-request-id'] as string) ||
      `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    (req as any).correlationId = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);

    const start = Date.now();
    res.on('finish', () => {
      logger
        .withCorrelationId(correlationId)
        .debug(`${req.method} ${req.path} -> ${res.statusCode} in ${Date.now() - start}ms`);
    });
    next();
  });

  // Mount API routers
  const prefix = DEFAULT_SERVER_CONFIG.apiPrefix;
  app.use(`${prefix}/health`, createHealthRouter());
  app.use(`${prefix}/workspaces`, createWorkspaceRouter());
  app.use(`${prefix}/providers`, createProviderRouter());
  app.use(`${prefix}/tasks`, createTaskRouter());
  app.use(`${prefix}/sessions`, createSessionRouter());
  app.use(`${prefix}/usage`, createUsageRouter());

  // Serve static client bundle if built
  const clientDist = path.resolve(process.cwd(), 'packages/client/dist');
  const clientDistSibling = path.resolve(__dirname, '../../../client/dist');
  const targetDist = fs.existsSync(clientDist)
    ? clientDist
    : fs.existsSync(clientDistSibling)
    ? clientDistSibling
    : null;

  if (targetDist) {
    app.use(express.static(targetDist));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith(prefix)) {
        return next();
      }
      res.sendFile(path.join(targetDist, 'index.html'));
    });
  }

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: `API route not found: ${req.method} ${req.path}`,
    });
  });

  // Centralized Error handler
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    let nexusErr: NexusError;
    const correlationId = (req as any).correlationId || `err_${Date.now()}`;

    if (err instanceof NexusError) {
      nexusErr = err;
    } else if (err instanceof Error) {
      nexusErr = new NexusError(err.message, 'INTERNAL_ERROR', 500, { stack: err.stack });
    } else {
      nexusErr = new NexusError(String(err), 'INTERNAL_ERROR', 500);
    }

    nexusErr.correlationId = nexusErr.correlationId || correlationId;

    logger
      .withCorrelationId(correlationId)
      .error(`Request Error [${req.method} ${req.path}]: ${nexusErr.message}`, {
        code: nexusErr.code,
        statusCode: nexusErr.statusCode,
        recoveryAction: nexusErr.recoveryAction,
      });

    res.status(nexusErr.statusCode).json({
      success: false,
      error: sanitizeObject({
        ...nexusErr.toJSON(),
        correlationId,
        userReadableMessage: nexusErr.userReadableMessage,
        recoveryAction: nexusErr.recoveryAction,
      }),
    });
  });

  return app;
}
