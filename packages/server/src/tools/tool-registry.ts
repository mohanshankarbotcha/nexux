import { ToolDefinition, ToolName, ToolResult, ToolCallContext, ToolExecutionError } from '@nexus/core';
import { ITool } from './base-tool.js';

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
    return tool.execute(input, context);
  }
}

export const globalToolRegistry = new ToolRegistry();
