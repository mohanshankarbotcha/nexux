import { Router, Request, Response } from 'express';

export function createHealthRouter(): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'NEXUS.AI Backend',
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
  });

  return router;
}
