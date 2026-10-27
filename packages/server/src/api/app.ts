import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { validateRequestToken, getOrCreateApiToken } from '../security/auth-token.js';
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

  // Security Middleware (Prompt 03)
  const ALLOWED_ORIGINS = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]);

  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      // Allow local tools, electron/mobile file/app protocols, and same-origin (no origin header)
      if (!origin) return callback(null, true);
      if (
        ALLOWED_ORIGINS.has(origin) ||
        origin.startsWith('app://') ||
        origin.startsWith('file://') ||
        origin.startsWith('vscode-webview://') ||
        origin === 'null'
      ) {
        return callback(null, true);
      }
      if (process.env.NEXUS_ALLOWED_ORIGINS) {
        const custom = process.env.NEXUS_ALLOWED_ORIGINS.split(',').map((s) => s.trim());
        if (custom.includes(origin)) return callback(null, true);
      }
      return callback(new Error(`CORS rejected unauthorized origin: ${origin}`));
    },
    credentials: true,
  };

  app.use(cors(corsOptions));
  app.use(express.json({ limit: '2mb' }));

  // DNS Rebinding / Host header validation (Loopback only)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const hostHeader = (req.headers.host || '').split(':')[0].toLowerCase();
    const isLoopback =
      hostHeader === 'localhost' ||
      hostHeader === '127.0.0.1' ||
      hostHeader === '::1' ||
      hostHeader === '0.0.0.0' ||
      hostHeader === '';
    if (!isLoopback && process.env.NODE_ENV === 'production') {
      logger.warn(`Security: Rejected unexpected Host header: ${req.headers.host}`);
      return res.status(403).json({ success: false, error: 'Forbidden: Invalid Host header' });
    }
    next();
  });

  // API Token Authentication Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Health check and non-API paths do not require authentication
    if (
      req.path === '/api/health' ||
      req.path === '/health' ||
      !req.path.startsWith('/api')
    ) {
      return next();
    }

    if (!validateRequestToken(req)) {
      logger.warn(`Security: Unauthorized request without valid API token: ${req.method} ${req.path}`);
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Missing or invalid API authentication token',
        errorCode: 'AUTH_REQUIRED',
      });
    }

    next();
  });

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
  const potentialDistPaths = [
    process.env.NEXUS_CLIENT_DIST,
    path.resolve(process.cwd(), 'packages/client/dist'),
    path.resolve(__dirname, '../../../client/dist'),
    path.resolve(__dirname, '../../client/dist'),
    path.resolve(__dirname, '../client-dist'),
    path.resolve(__dirname, '../../client-dist'),
    (process as any).resourcesPath ? path.resolve((process as any).resourcesPath, 'app/client-dist') : null,
    (process as any).resourcesPath ? path.resolve((process as any).resourcesPath, 'client-dist') : null,
  ].filter(Boolean) as string[];

  const targetDist = potentialDistPaths.find((p) => fs.existsSync(path.join(p, 'index.html'))) || null;

  if (targetDist) {
    const indexPath = path.join(targetDist, 'index.html');
    const sendInjectedHtml = (res: Response) => {
      try {
        let html = fs.readFileSync(indexPath, 'utf8');
        const token = getOrCreateApiToken();
        const injection = `<script>window.__NEXUS_API_TOKEN__ = ${JSON.stringify(token)};</script>`;
        if (html.includes('<head>')) {
          html = html.replace('<head>', `<head>${injection}`);
        } else {
          html = `${injection}${html}`;
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
      } catch {
        res.sendFile(indexPath);
      }
    };

    app.get(['/', '/index.html'], (req: Request, res: Response) => {
      sendInjectedHtml(res);
    });

    app.use(express.static(targetDist, { index: false }));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith(prefix)) {
        return next();
      }
      sendInjectedHtml(res);
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
