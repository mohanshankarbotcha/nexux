import { spawn } from 'node:child_process';
import {
  BaseTool,
} from './base-tool.js';
import {
  TerminalInput,
  TerminalOutput,
  ToolCallContext,
  ToolDefinition,
  ToolName,
  ToolExecutionError,
  resolveSafePath,
  sanitizeString,
  globalEventBus,
  DEFAULT_TOOL_CONFIG,
  logger,
} from '@nexus/core';

export class TerminalTool extends BaseTool<TerminalInput, TerminalOutput> {
  readonly name: ToolName = 'terminal';
  readonly definition: ToolDefinition = {
    name: 'terminal',
    description: 'Executes a command within the authorized workspace terminal environment.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute',
        },
        timeoutMs: {
          type: 'number',
          description: 'Maximum execution time in milliseconds (default: 60,000)',
        },
        maxOutputBytes: {
          type: 'number',
          description: 'Maximum output bytes to capture before truncating (default: 524,288)',
        },
        workingDir: {
          type: 'string',
          description: 'Optional working directory relative to workspace root',
        },
      },
      required: ['command'],
    },
  };

  protected async run(input: TerminalInput, context: ToolCallContext): Promise<TerminalOutput> {
    if (!input.command || typeof input.command !== 'string') {
      throw new ToolExecutionError(this.name, 'command parameter is required');
    }

    const startTime = Date.now();
    const timeoutMs = Math.min(input.timeoutMs || DEFAULT_TOOL_CONFIG.terminalTimeoutMs, 120_000);
    const maxOutputBytes = input.maxOutputBytes || DEFAULT_TOOL_CONFIG.terminalMaxOutputBytes;

    const cwd = input.workingDir
      ? resolveSafePath(context.workspaceRoot, input.workingDir)
      : resolveSafePath(context.workspaceRoot, '.');

    globalEventBus.emit({
      id: `evt_${Date.now()}`,
      type: 'command_started',
      sessionId: context.sessionId,
      taskId: context.taskId,
      timestamp: startTime,
      command: sanitizeString(input.command),
    });

    return new Promise<TerminalOutput>((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let killed = false;

      // Platform shell
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'cmd.exe' : '/bin/sh';
      const shellArgs = isWindows ? ['/d', '/s', '/c', input.command] : ['-c', input.command];

      const child = spawn(shell, shellArgs, {
        cwd,
        windowsHide: true,
        env: {
          ...process.env,
          // Prevent interactive prompts or pagers
          CI: 'true',
          PAGER: 'cat',
          GIT_TERMINAL_PROMPT: '0',
        },
      });

      const killProcessTree = () => {
        if (killed) return;
        killed = true;
        if (isWindows && child.pid) {
          try {
            spawn('taskkill', ['/pid', child.pid.toString(), '/T', '/F'], { windowsHide: true });
          } catch {}
        } else {
          try {
            child.kill('SIGTERM');
          } catch {}
        }
      };

      const timer = setTimeout(() => {
        timedOut = true;
        logger.warn(`Command timed out after ${timeoutMs}ms: ${input.command}`);
        killProcessTree();
      }, timeoutMs);

      if (context.abortSignal) {
        context.abortSignal.addEventListener('abort', () => {
          killProcessTree();
        });
      }

      let truncatedStdout = false;
      child.stdout.on('data', (chunk: Buffer) => {
        if (truncatedStdout) return;
        stdout += chunk.toString('utf-8');
        if (Buffer.byteLength(stdout, 'utf-8') > maxOutputBytes) {
          stdout = stdout.slice(0, maxOutputBytes) + '\n...[OUTPUT TRUNCATED]';
          truncatedStdout = true;
        }
      });

      let truncatedStderr = false;
      child.stderr.on('data', (chunk: Buffer) => {
        if (truncatedStderr) return;
        stderr += chunk.toString('utf-8');
        if (Buffer.byteLength(stderr, 'utf-8') > maxOutputBytes) {
          stderr = stderr.slice(0, maxOutputBytes) + '\n...[OUTPUT TRUNCATED]';
          truncatedStderr = true;
        }
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;

        const sanitizedStdout = sanitizeString(stdout);
        const sanitizedStderr = sanitizeString(stderr);

        globalEventBus.emit({
          id: `evt_${Date.now()}`,
          type: 'command_completed',
          sessionId: context.sessionId,
          taskId: context.taskId,
          timestamp: Date.now(),
          command: sanitizeString(input.command),
          exitCode: timedOut ? -1 : code,
          outputPreview: sanitizedStdout.slice(0, 300) || sanitizedStderr.slice(0, 300),
          durationMs,
        });

        resolve({
          command: sanitizeString(input.command),
          exitCode: timedOut ? -1 : code,
          stdout: sanitizedStdout,
          stderr: sanitizedStderr,
          timedOut,
          durationMs,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        resolve({
          command: sanitizeString(input.command),
          exitCode: -1,
          stdout: '',
          stderr: sanitizeString(`Spawn error: ${err.message}`),
          timedOut: false,
          durationMs,
        });
      });
    });
  }
}
