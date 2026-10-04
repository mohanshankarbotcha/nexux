import { AgentRole } from './agent.js';
import { ProviderId } from './provider.js';

export interface UsageRecord {
  requestId: string;
  sessionId: string;
  taskId: string;
  agent: AgentRole;
  provider: ProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  isEstimated: boolean;
  estimatedCostUsd: number;
  timestamp: number;
  durationMs: number;
  status: 'success' | 'failed' | 'cancelled';
  error?: string;
}

export interface UsageAggregationItem {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tokens: number;
  estimatedCostUsd: number;
}

export interface UsageSummary {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalEstimatedCostUsd: number;
  byProvider: Record<string, UsageAggregationItem>;
  byModel: Record<string, UsageAggregationItem>;
  byAgent: Record<string, UsageAggregationItem>;
  byTask: Record<string, UsageAggregationItem>;
  bySession: Record<string, UsageAggregationItem>;
}

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

export type PricingTable = Record<string, ModelPricing>;
