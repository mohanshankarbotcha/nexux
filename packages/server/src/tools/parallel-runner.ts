import { ToolName, ToolCallContext, ToolResult, SecurityViolationError } from '@nexus/core';
import { ToolRegistry } from './tool-registry.js';

export interface ParallelToolTask {
  name: ToolName;
  input: unknown;
}

export class ParallelReadRunner {
  private static CONCURRENCY_SAFE_TOOLS = new Set<ToolName>([
    'read_file',
    'list_files',
    'search_files',
    'git_status',
    'git_diff',
  ]);

  /**
   * Executes a list of read-only tool calls in parallel with a bounded concurrency limit.
   */
  async runParallel(
    registry: ToolRegistry,
    tasks: ParallelToolTask[],
    context: ToolCallContext,
    concurrencyLimit = 4
  ): Promise<ToolResult[]> {
    // Validate that all tasks are concurrency-safe
    for (const task of tasks) {
      if (!ParallelReadRunner.CONCURRENCY_SAFE_TOOLS.has(task.name)) {
        throw new SecurityViolationError(
          `Cannot execute mutating tool '${task.name}' in parallel read runner (Rule R11).`
        );
      }
    }

    const results: ToolResult[] = new Array(tasks.length);
    let nextIndex = 0;

    async function worker() {
      while (nextIndex < tasks.length) {
        const currentIndex = nextIndex++;
        const task = tasks[currentIndex];
        try {
          results[currentIndex] = await registry.execute(task.name, task.input, context);
        } catch (err: any) {
          results[currentIndex] = {
            toolName: task.name,
            callId: `err_${Date.now()}`,
            success: false,
            ok: false,
            error: err.message,
            durationMs: 0,
          };
        }
      }
    }

    const workerCount = Math.min(concurrencyLimit, tasks.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    return results;
  }
}

export const globalParallelReadRunner = new ParallelReadRunner();
