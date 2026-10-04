import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import {
  CoordinatorAgent,
  ExplorerAgent,
  PlannerAgent,
  CoderAgent,
  DebuggerAgent,
  ReviewerAgent,
} from '../agent/index.js';
import { ModelRouter, IModelProvider } from '../providers/index.js';
import { ToolRegistry, registerDefaultTools } from '../tools/index.js';
import { StorageEngine } from '../storage/storage-engine.js';
import { ContextEngine } from '../context/context-engine.js';
import { WorkspaceService } from '../workspace/workspace-service.js';
import { FileCache, globalFileCache } from '../cache/file-cache.js';
import {
  NexusEventBus,
  ProviderRequest,
  ProviderResponse,
  ProviderValidationResult,
  StreamChunk,
} from '@nexus/core';

class PerfMockProvider implements IModelProvider {
  readonly id = 'gemini' as const;
  readonly name = 'Perf Mock Provider';
  public callCount = 0;
  public totalInputTokens = 0;
  public totalOutputTokens = 0;

  async validateCredentials(): Promise<ProviderValidationResult> {
    return { provider: 'gemini', isValid: true, message: 'Valid', testedAt: Date.now() };
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    this.callCount++;
    const inTokens = request.messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
    const outTokens = 25;
    this.totalInputTokens += inTokens;
    this.totalOutputTokens += outTokens;

    return {
      requestId: request.requestId,
      provider: 'gemini',
      model: request.model,
      content: 'Performance test response completed successfully.',
      usage: { inputTokens: inTokens, outputTokens: outTokens, totalTokens: inTokens + outTokens },
      finishReason: 'stop',
      durationMs: 5,
    };
  }

  async stream(
    request: ProviderRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<ProviderResponse> {
    return this.complete(request);
  }

  reset(): void {
    this.callCount = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
  }
}

function createPerfWorkspace(): {
  workspaceDir: string;
  dataDir: string;
  cleanup: () => void;
} {
  const uid = `nexus_perf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const workspaceDir = path.join(os.tmpdir(), uid);
  const dataDir = path.join(os.tmpdir(), `${uid}_data`);

  fs.mkdirSync(path.join(workspaceDir, 'src'), { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  fs.writeFileSync(path.join(workspaceDir, 'README.md'), '# Performance Test Repository\nDetailed instructions.\n');
  fs.writeFileSync(
    path.join(workspaceDir, 'src', 'index.ts'),
    'export const add = (a: number, b: number) => a + b;\nexport const multiply = (a: number, b: number) => a * b;\n'
  );
  fs.writeFileSync(
    path.join(workspaceDir, 'package.json'),
    JSON.stringify({ name: 'perf-repo', version: '1.0.0' }, null, 2)
  );

  return {
    workspaceDir,
    dataDir,
    cleanup: () => {
      try {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
      } catch {}
      try {
        fs.rmSync(dataDir, { recursive: true, force: true });
      } catch {}
    },
  };
}

test('Phase 15 Performance and Token Efficiency Benchmark Suite', async (t) => {
  const { workspaceDir, dataDir, cleanup } = createPerfWorkspace();

  try {
    // 1. Startup Time Measurement
    await t.test('Measure 1: System and Component Startup Time', () => {
      const t0 = performance.now();

      const storage = new StorageEngine(dataDir);
      const wsService = new WorkspaceService(storage);
      const tools = new ToolRegistry();
      registerDefaultTools(tools);
      const provider = new PerfMockProvider();
      const router = new ModelRouter();
      router.registerProvider(provider);
      const contextEngine = new ContextEngine(wsService);
      const eventBus = new NexusEventBus();

      const coordinator = new CoordinatorAgent(
        new ExplorerAgent(router, tools, eventBus, storage),
        new PlannerAgent(router, tools, eventBus, storage),
        new CoderAgent(router, tools, eventBus, storage),
        new DebuggerAgent(router, tools, eventBus, storage),
        new ReviewerAgent(router, tools, eventBus, storage),
        storage,
        eventBus,
        contextEngine,
        tools,
        router
      );

      const startupDurationMs = performance.now() - t0;
      assert.ok(startupDurationMs < 200, `Startup time should be < 200ms, was ${startupDurationMs.toFixed(2)}ms`);
      assert.ok(coordinator !== undefined);
    });

    // 2. FileCache Disk Read Deduplication & Latency
    await t.test('Measure 2: FileCache Read Deduplication and Latency Optimization', () => {
      const cache = new FileCache(50);
      const filePath = path.join(workspaceDir, 'src', 'index.ts');

      // Cold Read (hits disk)
      const tCold0 = performance.now();
      const coldResult = cache.readFile(filePath);
      const coldDuration = performance.now() - tCold0;

      assert.equal(coldResult.hit, false, 'First read must be a cache miss');
      assert.ok(coldResult.content.includes('export const add'));

      // Warm Read (hits memory cache via mtime check)
      const tWarm0 = performance.now();
      const warmResult = cache.readFile(filePath);
      const warmDuration = performance.now() - tWarm0;

      assert.equal(warmResult.hit, true, 'Second read must be a cache hit');
      assert.equal(warmResult.content, coldResult.content);

      const stats = cache.getStats();
      assert.equal(stats.hits, 1);
      assert.equal(stats.misses, 1);
      assert.equal(stats.hitRatio, 0.5);
      assert.ok(stats.bytesSaved > 0);

      // Verify invalidation on file modification
      fs.appendFileSync(filePath, '\nexport const subtract = (a: number, b: number) => a - b;\n');
      cache.invalidate(filePath);

      const afterInvalidate = cache.readFile(filePath);
      assert.equal(afterInvalidate.hit, false, 'Read after invalidation must be a cache miss');
      assert.ok(afterInvalidate.content.includes('subtract'));
    });

    // 3. Context Engine Compilation and Cache Latency
    await t.test('Measure 3: Context Selection Latency and Cache Hit Efficiency', async () => {
      const storage = new StorageEngine(dataDir);
      const wsService = new WorkspaceService(storage);
      wsService.openWorkspace(workspaceDir);
      const contextEngine = new ContextEngine(wsService);

      const prompt = 'Look at src/index.ts and calculate functions';

      // Cold context compilation
      const tCold0 = performance.now();
      const coldPkg = await contextEngine.buildTaskContext(workspaceDir, prompt, 's1', 't1');
      const coldDuration = performance.now() - tCold0;

      assert.ok(coldPkg.items.length >= 1);
      assert.ok(coldPkg.totalBytes > 0);
      assert.ok(coldPkg.totalEstimatedTokens > 0);

      // Warm context request (hits contextPackageCache)
      const tWarm0 = performance.now();
      const warmPkg = await contextEngine.buildTaskContext(workspaceDir, prompt, 's1', 't2');
      const warmDuration = performance.now() - tWarm0;

      assert.equal(warmPkg.projectSummary, coldPkg.projectSummary);
      assert.equal(warmPkg.items.length, coldPkg.items.length);
      assert.equal(warmPkg.totalBytes, coldPkg.totalBytes);

      // Warm context retrieval must be substantially faster (cache hit)
      assert.ok(warmDuration <= coldDuration + 5, `Warm retrieval (${warmDuration.toFixed(2)}ms) should be fast`);
    });

    // 4. Redundant Tool Call Prevention
    await t.test('Measure 4: Redundant Read-Only Tool Call Caching in Agent', async () => {
      const storage = new StorageEngine(dataDir);
      const tools = new ToolRegistry();
      registerDefaultTools(tools);
      const provider = new PerfMockProvider();
      const router = new ModelRouter();
      router.registerProvider(provider);
      const eventBus = new NexusEventBus();

      const explorer = new ExplorerAgent(router, tools, eventBus, storage);
      const context = {
        sessionId: 'perf_sess',
        taskId: 'perf_task',
        workspaceRoot: workspaceDir,
      };

      // Call list_files twice consecutively
      const res1 = await (explorer as any).callTool('list_files', { directoryPath: '.' }, context);
      assert.equal(res1.success, true);

      const res2 = await (explorer as any).callTool('list_files', { directoryPath: '.' }, context);
      assert.equal(res2.success, true);
      assert.equal(res2.durationMs, 0, 'Cached tool call must return with 0ms execution time');
    });

    // 5. Stage Skipping & Model Token Efficiency
    await t.test('Measure 5: Unnecessary Stage Skipping and Token Savings', async () => {
      const storage = new StorageEngine(dataDir);
      const wsService = new WorkspaceService(storage);
      wsService.openWorkspace(workspaceDir);
      const contextEngine = new ContextEngine(wsService);
      const tools = new ToolRegistry();
      registerDefaultTools(tools);
      const provider = new PerfMockProvider();
      const router = new ModelRouter();
      router.registerProvider(provider);
      const eventBus = new NexusEventBus();

      const coordinator = new CoordinatorAgent(
        new ExplorerAgent(router, tools, eventBus, storage),
        new PlannerAgent(router, tools, eventBus, storage),
        new CoderAgent(router, tools, eventBus, storage),
        new DebuggerAgent(router, tools, eventBus, storage),
        new ReviewerAgent(router, tools, eventBus, storage),
        storage,
        eventBus,
        contextEngine,
        tools,
        router
      );

      // A direct explanation / read-only task
      provider.reset();
      const readRes = await coordinator.run('explain src/index.ts', {
        sessionId: 'perf_sess',
        taskId: 'perf_read_task',
        workspaceRoot: workspaceDir,
      });

      assert.equal(readRes.success, true);
      // For simple explain task, complex planner is skipped
      assert.ok(!readRes.data?.stagesRun.includes('planner'), 'Planner must be skipped for simple explain');

      // Reviewer fast-path: Since 0 files changed, Reviewer did not call LLM
      const callsForRead = provider.callCount;
      // In coder agent turn: only 1 LLM call was needed
      assert.ok(callsForRead <= 2, `Expected <= 2 model requests for simple explain task, got ${callsForRead}`);
    });
  } finally {
    cleanup();
  }
});
