export type TraceSpanType =
  | 'route'
  | 'preflight'
  | 'model_request'
  | 'tool'
  | 'verify'
  | 'wait'
  | 'ui_event';

export interface TraceSpan {
  taskId: string;
  spanId: string;
  parentId?: string;
  name: string;
  type: TraceSpanType;
  start: number;
  durationMs?: number;
  provider?: string;
  model?: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  retryCount?: number;
  metadata?: Record<string, unknown>;
  error?: string;
  status: 'running' | 'completed' | 'failed';
}

export interface TaskTimeline {
  taskId: string;
  startTime: number;
  endTime?: number;
  totalDurationMs?: number;
  spans: TraceSpan[];
}
