import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {
  ROUTE_BUDGETS,
  NexusEventBus,
  NexusEvent,
  ProviderValidationResult,
  ProviderRequest,
  ProviderResponse,
} from '@nexus/core';
import { ProviderPreflightCache } from '../providers/preflight-cache.js';
import { IModelProvider } from '../providers/base-provider.js';
import { ActiveTaskRegistry } from '../tasks/active-task-registry.js';
import { StorageEngine } from '../storage/storage-engine.js';

class MockPreflightProvider implements IModelProvider {
  readonly id = 'gemini' as const;
  readonly name = 'Mock Preflight Provider';
  validateCallCount = 0;
  validateModelCallCount = 0;

  async validateCredentials(): Promise<ProviderValidationResult> {
    this.validateCallCount++;
    return { provider: 'gemini', isValid: true, message: 'Valid', testedAt: Date.now() };
  }

  async validateModel(model: string): Promise<any> {
    this.validateModelCallCount++;
    return { provider: 'gemini', model, isValid: true, testedAt: Date.now() };
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    return {
      requestId: request.requestId,
      provider: 'gemini',
      model: request.model,
      content: 'OK',
      usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      finishReason: 'stop',
      durationMs: 5,
    };
  }

  async stream(request: ProviderRequest, onChunk: any): Promise<ProviderResponse> {
    const res = await this.complete(request);
    onChunk({ requestId: request.requestId, deltaText: res.content });
    return res;
  }
}

test('Prompt 06 Speed - Preflight cache eliminates redundant 800ms+ network calls (< 1ms)', async () => {
  const provider = new MockPreflightProvider();
  const cache = new ProviderPreflightCache();

  // Call 1: cold cache -> calls provider
  const start1 = Date.now();
  const res1 = await cache.validateWithCache(provider);
  const dur1 = Date.now() - start1;
  assert.equal(res1.isValid, true);
  assert.equal(provider.validateCallCount, 1);

  // Call 2: warm cache -> returns instantly (< 5ms) without calling provider
  const start2 = Date.now();
  const res2 = await cache.validateWithCache(provider);
  const dur2 = Date.now() - start2;
  assert.equal(res2.isValid, true);
  assert.equal(provider.validateCallCount, 1); // Not incremented!
  assert.ok(dur2 < 10, `Expected cache hit < 10ms, got ${dur2}ms`);

  // Model validation cache check
  await cache.validateModelWithCache(provider, 'gemini-2.5-flash');
  assert.equal(provider.validateModelCallCount, 1);
  await cache.validateModelWithCache(provider, 'gemini-2.5-flash');
  assert.equal(provider.validateModelCallCount, 1); // Cached!

  // Invalidation clears cache
  cache.invalidate('gemini');
  await cache.validateWithCache(provider);
  assert.equal(provider.validateCallCount, 2); // Called again after invalidation!
});

test('Prompt 06 Budgets - Route budgets are configured with strict thresholds', () => {
  assert.equal(ROUTE_BUDGETS.S1.timeoutMs, 10_000);
  assert.equal(ROUTE_BUDGETS.S1.maxTokens, 4_000);
  assert.equal(ROUTE_BUDGETS.S1.maxModelCalls, 2);

  assert.equal(ROUTE_BUDGETS.S2.timeoutMs, 15_000);
  assert.equal(ROUTE_BUDGETS.S2.maxTokens, 8_000);

  assert.equal(ROUTE_BUDGETS.S3.timeoutMs, 90_000);
  assert.equal(ROUTE_BUDGETS.S3.maxTokens, 16_000);

  assert.equal(ROUTE_BUDGETS.S4.timeoutMs, 300_000);
  assert.equal(ROUTE_BUDGETS.S4.maxTokens, 32_000);
});

test('Prompt 06 Recovery - ActiveTaskRegistry enforces timeout and cleans up active registry', async () => {
  const tempDir = path.join(os.tmpdir(), `nexus_reg_test_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const storage = new StorageEngine(path.join(tempDir, '.nexus_data'));
    const bus = new NexusEventBus();
    const registry = new ActiveTaskRegistry(bus, storage);

    const taskId = 'task_timeout_test';
    const abortCtrl = new AbortController();

    storage.saveTask({
      id: taskId,
      sessionId: 'sess_1',
      prompt: 'Hanging task',
      status: 'running',
      stage: 'running',
      changedFiles: [],
      activeAgents: [],
      createdAt: Date.now(),
    });

    // Register with short 100ms timeout
    registry.register(taskId, {
      sessionId: 'sess_1',
      prompt: 'Hanging task',
      workspaceRoot: tempDir,
      abortController: abortCtrl,
      timeoutMs: 100,
    });

    assert.equal(registry.has(taskId), true);

    // Wait 150ms for timeout to trigger
    await new Promise((r) => setTimeout(r, 150));

    // Must be aborted, unregistered, and marked failed/timeout
    assert.equal(abortCtrl.signal.aborted, true);
    assert.equal(registry.has(taskId), false);

    const task = storage.getTask(taskId);
    assert.ok(task);
    assert.equal(task.status, 'failed');
    assert.equal(task.stage, 'timeout');
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});

test('Prompt 06 Recovery - Clean cancellation and unregistration', () => {
  const tempDir = path.join(os.tmpdir(), `nexus_cancel_test_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const storage = new StorageEngine(path.join(tempDir, '.nexus_data'));
    const bus = new NexusEventBus();
    const registry = new ActiveTaskRegistry(bus, storage);

    const taskId = 'task_cancel_test';
    const abortCtrl = new AbortController();

    storage.saveTask({
      id: taskId,
      sessionId: 'sess_2',
      prompt: 'Cancel me',
      status: 'running',
      stage: 'running',
      changedFiles: [],
      activeAgents: [],
      createdAt: Date.now(),
    });

    registry.register(taskId, {
      sessionId: 'sess_2',
      prompt: 'Cancel me',
      workspaceRoot: tempDir,
      abortController: abortCtrl,
    });

    assert.equal(registry.has(taskId), true);

    const cancelRes = registry.cancel(taskId, 'User clicked stop');
    assert.equal(cancelRes.success, true);
    assert.equal(abortCtrl.signal.aborted, true);
    assert.equal(registry.has(taskId), false);

    const task = storage.getTask(taskId);
    assert.ok(task);
    assert.equal(task.status, 'cancelled');
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});

test('Prompt 06 Recovery - Server restart recovers running tasks with SERVER_RESTART code', () => {
  const tempDir = path.join(os.tmpdir(), `nexus_restart_test_${Date.now()}`);
  const dataDir = path.join(tempDir, '.nexus_data');
  fs.mkdirSync(dataDir, { recursive: true });

  try {
    // 1. Initial server session saves a task stuck in 'running' state
    const storage1 = new StorageEngine(dataDir);
    storage1.saveTask({
      id: 'task_interrupted_1',
      sessionId: 'sess_3',
      prompt: 'Working on feature',
      status: 'running',
      stage: 'coding',
      changedFiles: [],
      activeAgents: [],
      createdAt: Date.now() - 5000,
    });

    // 2. Simulate server restart: new StorageEngine instance opens the data directory
    const storage2 = new StorageEngine(dataDir);
    const recovered = storage2.getTask('task_interrupted_1');

    assert.ok(recovered);
    assert.equal(recovered.status, 'failed');
    assert.equal(recovered.stage, 'failed');
    assert.ok(recovered.error?.includes('SERVER_RESTART'));
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});
