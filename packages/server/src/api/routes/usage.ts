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
    };

    for (const r of records) {
      summary.totalInputTokens += r.inputTokens;
      summary.totalOutputTokens += r.outputTokens;
      summary.totalTokens += r.totalTokens;
      summary.totalEstimatedCostUsd += r.estimatedCostUsd;

      // By provider
      if (!summary.byProvider[r.provider]) {
        summary.byProvider[r.provider] = { requests: 0, tokens: 0, estimatedCostUsd: 0 };
      }
      summary.byProvider[r.provider].requests += 1;
      summary.byProvider[r.provider].tokens += r.totalTokens;
      summary.byProvider[r.provider].estimatedCostUsd += r.estimatedCostUsd;

      // By model
      if (!summary.byModel[r.model]) {
        summary.byModel[r.model] = { requests: 0, tokens: 0, estimatedCostUsd: 0 };
      }
      summary.byModel[r.model].requests += 1;
      summary.byModel[r.model].tokens += r.totalTokens;
      summary.byModel[r.model].estimatedCostUsd += r.estimatedCostUsd;

      // By agent
      if (!summary.byAgent[r.agent]) {
        summary.byAgent[r.agent] = { requests: 0, tokens: 0, estimatedCostUsd: 0 };
      }
      summary.byAgent[r.agent].requests += 1;
      summary.byAgent[r.agent].tokens += r.totalTokens;
      summary.byAgent[r.agent].estimatedCostUsd += r.estimatedCostUsd;
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
