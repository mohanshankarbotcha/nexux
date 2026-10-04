import {
  ToolCallContext,
  ToolDefinition,
  ToolName,
  ToolResult,
  ToolExecutionError,
  logger,
} from '@nexus/core';

export interface ITool<TInput = unknown, TOutput = unknown> {
  readonly name: ToolName;
  readonly definition: ToolDefinition;

  execute(input: TInput, context: ToolCallContext): Promise<ToolResult<TOutput>>;
}

export abstract class BaseTool<TInput = unknown, TOutput = unknown> implements ITool<TInput, TOutput> {
  abstract readonly name: ToolName;
  abstract readonly definition: ToolDefinition;

  protected abstract run(input: TInput, context: ToolCallContext): Promise<TOutput>;

  async execute(input: TInput, context: ToolCallContext): Promise<ToolResult<TOutput>> {
    const startTime = Date.now();
    const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    logger.debug(`Executing tool [${this.name}]`, { callId, taskId: context.taskId, input });

    if (context.abortSignal?.aborted) {
      return {
        toolName: this.name,
        callId,
        success: false,
        error: 'Execution cancelled by user or timeout',
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const data = await this.run(input, context);
      const durationMs = Date.now() - startTime;
      logger.debug(`Tool [${this.name}] completed in ${durationMs}ms`, { callId });
      return {
        toolName: this.name,
        callId,
        success: true,
        data,
        durationMs,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Tool [${this.name}] failed: ${errorMsg}`, { callId, err });
      return {
        toolName: this.name,
        callId,
        success: false,
        error: errorMsg,
        durationMs,
      };
    }
  }
}
