import { ToolDefinition, ToolName, ToolResult, ToolCallContext, ToolExecutionError } from '@nexus/core';
import { ITool } from './base-tool.js';
import { globalTracer } from '../tracing/tracer.js';

export class ToolRegistry {
  private tools = new Map<ToolName, ITool>();

  register(tool: ITool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: ToolName): ITool | undefined {
    return this.tools.get(name);
  }

  has(name: ToolName): boolean {
    return this.tools.has(name);
  }

  getAllDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  async execute(
    name: ToolName,
    input: unknown,
    context: ToolCallContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ToolExecutionError(name, `Tool '${name}' is not registered`);
    }
    const tracerSpan = context.taskId
      ? globalTracer.startSpan(context.taskId, `Tool: ${name}`, 'tool', {
          metadata: typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : undefined,
        })
      : null;

    try {
      const result = await tool.execute(input, context);
      if (tracerSpan) {
        tracerSpan.end({ error: result.success ? undefined : result.error });
      }
      return result;
    } catch (err: any) {
      if (tracerSpan) {
        tracerSpan.end({ error: err.message });
      }
      throw err;
    }
  }
}

export const globalToolRegistry = new ToolRegistry();
