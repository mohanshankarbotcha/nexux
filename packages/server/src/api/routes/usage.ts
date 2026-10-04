import { Router, Request, Response } from 'express';
import { UsageSummary } from '@nexus/core';
import { globalStorage } from '../../storage/storage-engine.js';

export function createUsageRouter(): Router {
  const router = Router();

  router.get('/records', (req: Request, res: Response) => {
    const records = globalStorage.getUsageRecords();
    res.json({
      success: true,
      records: records.slice(-200).reverse(), // Return up to 200 most recent records
    });
  });

  router.get('/summary', (req: Request, res: Response) => {
    const records = globalStorage.getUsageRecords();

    const summary: UsageSummary = {
      totalRequests: records.length,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalEstimatedCostUsd: 0,
      byProvider: {},
      byModel: {},
      byAgent: {},
      byTask: {},
      bySession: {},
    };

    function accumulate(
      target: Record<string, any>,
      key: string,
      r: any
    ) {
      if (!target[key]) {
        target[key] = {
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          tokens: 0,
          estimatedCostUsd: 0,
        };
      }
      const item = target[key];
      item.requests += 1;
      item.inputTokens += r.inputTokens;
      item.outputTokens += r.outputTokens;
      item.totalTokens += r.totalTokens;
      item.tokens += r.totalTokens;
      item.estimatedCostUsd = Math.round((item.estimatedCostUsd + r.estimatedCostUsd) * 1_000_000) / 1_000_000;
    }

    for (const r of records) {
      summary.totalInputTokens += r.inputTokens;
      summary.totalOutputTokens += r.outputTokens;
      summary.totalTokens += r.totalTokens;
      summary.totalEstimatedCostUsd += r.estimatedCostUsd;

      accumulate(summary.byProvider, r.provider, r);
      accumulate(summary.byModel, r.model, r);
      accumulate(summary.byAgent, r.agent, r);
      if (r.taskId) accumulate(summary.byTask, r.taskId, r);
      if (r.sessionId) accumulate(summary.bySession, r.sessionId, r);
    }

    // Round total cost
    summary.totalEstimatedCostUsd = Math.round(summary.totalEstimatedCostUsd * 1_000_000) / 1_000_000;

    res.json({
      success: true,
      summary,
    });
  });

  return router;
}
