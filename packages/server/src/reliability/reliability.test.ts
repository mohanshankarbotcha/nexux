import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NexusError,
  ProviderError,
  ProviderAuthError,
  ProviderRateLimitError,
  NetworkError,
  TimeoutError,
  TaskCancelledError,
  ToolExecutionError,
  MalformedToolCallError,
  PathTraversalError,
  resolveSafePath,
  sanitizeString,
} from '@nexus/core';
import { createNexusApp } from '../api/app.js';
import { withSafeRetry, isRetryableError } from '../providers/retry.js';
import { TerminalTool } from '../tools/terminal.js';
import { ReadFileTool } from '../tools/read-file.js';

async function makeReliabilityRequest(
  app: any,
  method: string,
  pathUrl: string,
  headers: Record<string, string> = {},
  body?: any
) {
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const url = `http://localhost:${port}${pathUrl}`;

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const resHeaders = Object.fromEntries(res.headers.entries());
    let json: any = {};
    try {
      json = await res.json();
    } catch {}
    return { status: res.status, headers: resHeaders, body: json };
  } finally {
    server.close();
  }
}

test('Reliability / Structured Internal Errors & User-Readable Messages', () => {
  // Provider Auth Error
  const authErr = new ProviderAuthError('openai');
  assert.equal(authErr.statusCode, 401);
  assert.equal(authErr.code, 'PROVIDER_AUTH_FAILED');
  assert.equal(authErr.isRetryable, false);
  assert.ok(authErr.recoveryAction?.includes('Provider Setup'));
  assert.ok(authErr.userReadableMessage.length > 0);

  // Provider Rate Limit Error
  const rateLimitErr = new ProviderRateLimitError('gemini', 3000);
  assert.equal(rateLimitErr.statusCode, 429);
  assert.equal(rateLimitErr.code, 'PROVIDER_RATE_LIMIT');
  assert.equal(rateLimitErr.isRetryable, true);
  assert.equal(rateLimitErr.retryAfterMs, 3000);
  assert.ok(rateLimitErr.recoveryAction?.includes('Rate limit reached'));

  // Network Error
  const netErr = new NetworkError('DNS resolution failed');
  assert.equal(netErr.statusCode, 503);
  assert.equal(netErr.code, 'NETWORK_ERROR');
  assert.equal(netErr.isRetryable, true);
  assert.ok(netErr.recoveryAction?.includes('connectivity'));

  // Timeout Error
  const timeoutErr = new TimeoutError('npm test', 60000);
  assert.equal(timeoutErr.statusCode, 408);
  assert.equal(timeoutErr.code, 'TIMEOUT_ERROR');
  assert.equal(timeoutErr.isRetryable, false);
  assert.ok(timeoutErr.userReadableMessage.includes('60s'));

  // Task Cancelled Error
  const cancelErr = new TaskCancelledError('task_123');
  assert.equal(cancelErr.statusCode, 499);
  assert.equal(cancelErr.code, 'TASK_CANCELLED');
  assert.equal(cancelErr.isRetryable, false);

  // Malformed Tool Call Error
  const malformedErr = new MalformedToolCallError('edit_file', '{ bad json', 'Unexpected token');
  assert.equal(malformedErr.statusCode, 400);
  assert.equal(malformedErr.code, 'MALFORMED_TOOL_CALL');
  assert.equal(malformedErr.isRetryable, true);
});

test('Reliability / Safe Retry Logic', async (t) => {
  await t.test('retries transient rate limit and succeeds on subsequent attempt', async () => {
    let attempts = 0;
    const result = await withSafeRetry(
      async (attempt) => {
        attempts++;
        if (attempt === 0) {
          throw new ProviderRateLimitError('openai');
        }
        return 'success_after_rate_limit';
      },
      { maxRetries: 2, baseDelayMs: 20, providerName: 'openai' }
    );

    assert.equal(result, 'success_after_rate_limit');
    assert.equal(attempts, 2);
  });

  await t.test('retries transient network error and succeeds', async () => {
    let attempts = 0;
    const result = await withSafeRetry(
      async (attempt) => {
        attempts++;
        if (attempt === 0) {
          throw new NetworkError('Connection reset by peer');
        }
        return 'success_after_network_error';
      },
      { maxRetries: 2, baseDelayMs: 20, providerName: 'gemini' }
    );

    assert.equal(result, 'success_after_network_error');
    assert.equal(attempts, 2);
  });

  await t.test('fails fast without retry on auth error', async () => {
    let attempts = 0;
    await assert.rejects(
      async () => {
        await withSafeRetry(
          async () => {
            attempts++;
            throw new ProviderAuthError('openai');
          },
          { maxRetries: 3, baseDelayMs: 20, providerName: 'openai' }
        );
      },
      (err: any) => {
        assert.equal(err.code, 'PROVIDER_AUTH_FAILED');
        return true;
      }
    );

    // Must not have retried
    assert.equal(attempts, 1);
  });

  await t.test('cancels immediately if AbortSignal is aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      async () => {
        await withSafeRetry(
          async () => 'never_reached',
          { maxRetries: 3, baseDelayMs: 20, providerName: 'openai', abortSignal: controller.signal }
        );
      },
      (err: any) => {
        assert.equal(err.code, 'TASK_CANCELLED');
        return true;
      }
    );
  });
});

test('Reliability / Tool Error Trapping and Boundary Guards', async (t) => {
  const readTool = new ReadFileTool();
  const ctx = {
    workspaceRoot: 'C:/mock_workspace',
    sessionId: 'rel_sess',
    taskId: 'rel_task',
    agentRole: 'coder',
  };

  await t.test('traps path traversal attempt and returns structured failure', async () => {
    const res = await readTool.execute({ filePath: '../../boot.ini' }, ctx);
    assert.equal(res.success, false);
    assert.ok(res.error?.includes('path traversal attempt'));
  });

  await t.test('traps non-existent file gracefully without crashing', async () => {
    const res = await readTool.execute({ filePath: 'does_not_exist.txt' }, ctx);
    assert.equal(res.success, false);
    assert.ok(
      res.error?.includes('File not found') ||
      res.error?.includes('does not exist') ||
      res.error?.includes('failed')
    );
  });

  await t.test('terminal traps non-zero exit commands gracefully', async () => {
    const termTool = new TerminalTool();
    const isWindows = process.platform === 'win32';
    const failCmd = isWindows ? 'dir non_existent_folder_xyz_123' : 'ls non_existent_folder_xyz_123';

    const res = await termTool.execute({ command: failCmd }, ctx);
    assert.equal(res.success, true);
    assert.notEqual(res.data?.exitCode, 0);
    assert.ok(res.data?.stderr || res.data?.stdout);
  });
});

test('Reliability / API Correlation IDs and Error Observability', async () => {
  const app = createNexusApp();

  // Test correlation ID echoing
  const customId = `test_corr_${Date.now()}`;
  const healthRes = await makeReliabilityRequest(
    app,
    'GET',
    '/api/health',
    { 'X-Correlation-Id': customId }
  );

  assert.equal(healthRes.status, 200);
  assert.equal(healthRes.headers['x-correlation-id'], customId);

  // Test structured error handling on non-existent route
  const notFoundRes = await makeReliabilityRequest(app, 'GET', '/api/invalid-route-xyz');
  assert.equal(notFoundRes.status, 404);
  assert.ok(notFoundRes.body.error);

  // Test validation error handling on tasks endpoint
  const taskRes = await makeReliabilityRequest(
    app,
    'POST',
    '/api/tasks',
    { 'X-Correlation-Id': 'corr_task_err' },
    {}
  );

  assert.equal(taskRes.status, 400);
  assert.equal(taskRes.body.success, false);
  assert.ok(taskRes.body.error);
  assert.equal(taskRes.body.error.code, 'VALIDATION_ERROR');
  assert.equal(taskRes.body.error.correlationId, 'corr_task_err');
  assert.ok(taskRes.body.error.recoveryAction);
  assert.ok(taskRes.body.error.userReadableMessage);
});
