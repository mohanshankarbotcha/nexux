import {
  ToolCallContext,
  ToolDefinition,
  ToolName,
  ToolResult,
  ToolRiskClass,
  ToolResultEnvelope,
  ToolExecutionError,
  globalEventBus,
  sanitizeObject,
  logger,
} from '@nexus/core';
import { globalEvidenceLedger } from './evidence-ledger.js';

export interface ITool<TInput = unknown, TOutput = unknown> {
  readonly name: ToolName;
  readonly definition: ToolDefinition;
  readonly riskClass: ToolRiskClass;
  readonly concurrencySafe: boolean;
  readonly defaultTimeoutMs: number;

  execute(input: TInput, context: ToolCallContext): Promise<ToolResult<TOutput>>;
}

export abstract class BaseTool<TInput = unknown, TOutput = unknown> implements ITool<TInput, TOutput> {
  abstract readonly name: ToolName;
  abstract readonly definition: ToolDefinition;
  readonly riskClass: ToolRiskClass = 'read';
  readonly concurrencySafe: boolean = false;
  readonly defaultTimeoutMs: number = 60_000;

  protected abstract run(input: TInput, context: ToolCallContext): Promise<TOutput>;

  async execute(input: TInput, context: ToolCallContext): Promise<ToolResult<TOutput>> {
    const startTime = Date.now();
    const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const evidenceId = `ev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    logger.debug(`Executing tool [${this.name}]`, { callId, taskId: context.taskId, input });

    if (context.abortSignal?.aborted) {
      const durationMs = Date.now() - startTime;
      const errorMsg = 'Execution cancelled by user or timeout';
      const envelope: ToolResultEnvelope<TOutput> = {
        ok: false,
        error: {
          code: 'EXECUTION_ABORTED',
          message: errorMsg,
          retryable: false,
        },
        durationMs,
        truncated: false,
        evidenceId,
      };
      return {
        toolName: this.name,
        callId,
        success: false,
        ok: false,
        error: errorMsg,
        durationMs,
        evidenceId,
        envelope,
      };
    }

    try {
      const data = await this.run(input, context);
      const durationMs = Date.now() - startTime;
      const isTruncated = typeof data === 'object' && data !== null && (data as any).truncated === true;

      const envelope: ToolResultEnvelope<TOutput> = {
        ok: true,
        data,
        durationMs,
        truncated: isTruncated,
        evidenceId,
      };

      // Record in Evidence Ledger
      const summary = typeof data === 'string'
        ? data.slice(0, 150)
        : JSON.stringify(data).slice(0, 150);

      await globalEvidenceLedger.record(context.workspaceRoot, {
        evidenceId,
        taskId: context.taskId,
        tool: this.name,
        argsRedacted: sanitizeObject((input || {}) as Record<string, unknown>),
        resultSummary: summary,
        ok: true,
        durationMs,
        timestamp: Date.now(),
      });

      logger.debug(`Tool [${this.name}] completed in ${durationMs}ms`, { callId, evidenceId });

      return {
        toolName: this.name,
        callId,
        success: true,
        ok: true,
        data,
        durationMs,
        truncated: isTruncated,
        evidenceId,
        envelope,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Tool [${this.name}] failed: ${errorMsg}`, { callId, evidenceId, err });

      const envelope: ToolResultEnvelope<TOutput> = {
        ok: false,
        error: {
          code: (err as any)?.code || 'TOOL_ERROR',
          message: errorMsg,
          retryable: false,
        },
        durationMs,
        truncated: false,
        evidenceId,
      };

      // Record failure in Evidence Ledger
      await globalEvidenceLedger.record(context.workspaceRoot, {
        evidenceId,
        taskId: context.taskId,
        tool: this.name,
        argsRedacted: sanitizeObject((input || {}) as Record<string, unknown>),
        resultSummary: `Error: ${errorMsg.slice(0, 150)}`,
        ok: false,
        durationMs,
        timestamp: Date.now(),
      });

      return {
        toolName: this.name,
        callId,
        success: false,
        ok: false,
        error: errorMsg,
        durationMs,
        truncated: false,
        evidenceId,
        envelope,
      };
    }
  }
}
