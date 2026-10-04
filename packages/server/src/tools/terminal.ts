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
  SecurityViolationError,
  resolveSafePath,
  sanitizeString,
  globalEventBus,
  DEFAULT_TOOL_CONFIG,
  logger,
} from '@nexus/core';

const DANGEROUS_COMMAND_RULES = [
  // Disallow remote Git push operations to protect external repositories
  {
    pattern: /(?:^|[;&|`\n\r])\s*git\s+push\b/i,
    reason: 'Remote Git push operations are restricted to prevent unauthorized remote changes.',
  },
  // Disallow destructive root or drive wiping
  {
    pattern: /\brm\s+(?:-[a-zA-Z]*r[a-zA-Z]*f*|-[a-zA-Z]*f[a-zA-Z]*r*)\s+[\/\\](?:\s|$|\*)/i,
    reason: 'Destructive filesystem deletion of system root is strictly prohibited.',
  },
  {
    pattern: /\b(?:del|rd|rmdir)\s+\/[sS]\s+\/[qQ]\s+[a-zA-Z]:\\/i,
    reason: 'Destructive drive wiping is strictly prohibited.',
  },
  {
    pattern: /\bformat\s+[a-zA-Z]:/i,
    reason: 'Disk format command is strictly prohibited.',
  },
  {
    pattern: /\b(?:shutdown|reboot|poweroff|init\s+0)\b/i,
    reason: 'System power and restart commands are strictly prohibited.',
  },
  {
    pattern: /\bdd\s+if=.*of=\/dev\//i,
    reason: 'Direct block device writes are strictly prohibited.',
  },
  {
    pattern: /\bmkfs(?:\.[a-z0-9]+)?\b/i,
    reason: 'Filesystem formatting is strictly prohibited.',
  },
  {
    pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    reason: 'Fork bombs are strictly prohibited.',
  },
];

function getSanitizedEnv(): NodeJS.ProcessEnv {
  const cleanEnv: NodeJS.ProcessEnv = {
    ...process.env,
    CI: 'true',
    PAGER: 'cat',
    GIT_TERMINAL_PROMPT: '0',
  };

  const sensitiveExact = new Set([
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
    'ANTHROPIC_API_KEY',
    'NEXUS_API_KEY',
    'AWS_SECRET_ACCESS_KEY',
    'GITHUB_TOKEN',
    'GH_TOKEN',
  ]);

  for (const key of Object.keys(cleanEnv)) {
    const upper = key.toUpperCase();
    if (sensitiveExact.has(upper)) {
      delete cleanEnv[key];
      continue;
    }
    if (
      (upper.includes('API_KEY') ||
        upper.includes('SECRET') ||
        upper.includes('PASSWORD') ||
        (upper.includes('TOKEN') && !['COLORTERM', 'TERM', 'TERM_PROGRAM'].includes(upper))) &&
      !['PATH', 'SYSTEMROOT', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOME'].includes(upper)
    ) {
      delete cleanEnv[key];
    }
  }

  return cleanEnv;
}

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

    const trimmedCmd = input.command.trim();

    // Verify command safety against destructive patterns and unauthorized remote pushes
    for (const rule of DANGEROUS_COMMAND_RULES) {
      if (rule.pattern.test(trimmedCmd)) {
        throw new SecurityViolationError(`Security policy violation: ${rule.reason}`);
      }
    }

    const startTime = Date.now();
    const timeoutMs = Math.min(input.timeoutMs || DEFAULT_TOOL_CONFIG.terminalTimeoutMs, 120_000);
    const maxOutputBytes = input.maxOutputBytes || DEFAULT_TOOL_CONFIG.terminalMaxOutputBytes;

    const cwd = input.workingDir
      ? resolveSafePath(context.workspaceRoot, input.workingDir)
      : resolveSafePath(context.workspaceRoot, '.');

    const bus = context.eventBus || globalEventBus;
    bus.emit({
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
        env: getSanitizedEnv(),
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

        const bus = context.eventBus || globalEventBus;
        bus.emit({
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
