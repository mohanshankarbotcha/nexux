import { TraceSpan, TraceSpanType, TaskTimeline, sanitizeObject, logger } from '@nexus/core';
import { globalStorage, StorageEngine } from '../storage/storage-engine.js';

export class TaskTracer {
  private inMemorySpans: Map<string, TraceSpan[]> = new Map();

  constructor(private storage: StorageEngine = globalStorage) {}

  startSpan(
    taskId: string,
    name: string,
    type: TraceSpanType,
    options?: {
      parentId?: string;
      provider?: string;
      model?: string;
      metadata?: Record<string, unknown>;
    }
  ): {
    span: TraceSpan;
    end: (opts?: {
      error?: string;
      tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number };
      metadata?: Record<string, unknown>;
      retryCount?: number;
    }) => TraceSpan;
  } {
    const spanId = `span_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const span: TraceSpan = {
      taskId,
      spanId,
      parentId: options?.parentId,
      name,
      type,
      start: Date.now(),
      provider: options?.provider,
      model: options?.model,
      metadata: options?.metadata ? sanitizeObject(options.metadata) : undefined,
      status: 'running',
    };

    if (!this.inMemorySpans.has(taskId)) {
      this.inMemorySpans.set(taskId, []);
    }
    this.inMemorySpans.get(taskId)!.push(span);

    const end = (opts?: {
      error?: string;
      tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number };
      metadata?: Record<string, unknown>;
      retryCount?: number;
    }) => {
      span.durationMs = Math.max(0, Date.now() - span.start);
      if (opts?.error) {
        span.error = opts.error;
        span.status = 'failed';
      } else {
        span.status = 'completed';
      }
      if (opts?.tokenUsage) span.tokenUsage = opts.tokenUsage;
      if (opts?.retryCount !== undefined) span.retryCount = opts.retryCount;
      if (opts?.metadata) {
        span.metadata = { ...(span.metadata || {}), ...sanitizeObject(opts.metadata) };
      }
      return span;
    };

    return { span, end };
  }

  recordSpan(span: TraceSpan): void {
    if (!this.inMemorySpans.has(span.taskId)) {
      this.inMemorySpans.set(span.taskId, []);
    }
    this.inMemorySpans.get(span.taskId)!.push(span);
  }

  getTimeline(taskId: string): TaskTimeline {
    const spans = this.inMemorySpans.get(taskId) || [];
    const sorted = [...spans].sort((a, b) => a.start - b.start);
    const startTime = sorted.length > 0 ? sorted[0].start : Date.now();
    const latestEndTime = sorted.reduce((max, s) => {
      const sEnd = s.start + (s.durationMs || 0);
      return Math.max(max, sEnd);
    }, startTime);

    return {
      taskId,
      startTime,
      endTime: sorted.length > 0 ? latestEndTime : undefined,
      totalDurationMs: sorted.length > 0 ? latestEndTime - startTime : 0,
      spans: sorted,
    };
  }

  exportTimelineJson(taskId: string): string {
    return JSON.stringify(this.getTimeline(taskId), null, 2);
  }

  clearTask(taskId: string): void {
    this.inMemorySpans.delete(taskId);
  }
}

export const globalTracer = new TaskTracer();
