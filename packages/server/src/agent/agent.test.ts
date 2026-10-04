import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {
  CoordinatorAgent,
  ExplorerAgent,
  PlannerAgent,
  CoderAgent,
  DebuggerAgent,
  ReviewerAgent,
} from './index.js';
import { ModelRouter, IModelProvider } from '../providers/index.js';
import { ToolRegistry, registerDefaultTools } from '../tools/index.js';
import { StorageEngine } from '../storage/storage-engine.js';
import {
  NexusEventBus,
  NexusEvent,
  ProviderRequest,
  ProviderResponse,
  ProviderValidationResult,
  StreamChunk,
} from '@nexus/core';

// Mock Provider for orchestrating agent interactions deterministically
class MockOrchestratorProvider implements IModelProvider {
  readonly id = 'gemini' as const;
  readonly name = 'Mock Orchestrator Provider';

  async validateCredentials(): Promise<ProviderValidationResult> {
    return { provider: 'gemini', isValid: true, message: 'Valid', testedAt: Date.now() };
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const prompt = request.messages[request.messages.length - 1]?.content || '';
    let content = 'Default model response';
    let toolCalls: any[] | undefined = undefined;

    if (request.systemInstruction?.includes('Planner Agent')) {
      content = JSON.stringify({
        summary: 'Add greeting module and verify',
        steps: [
          {
            id: 's1',
            description: 'Create greeting.ts file',
            targetFiles: ['src/greeting.ts'],
            verificationCommand: 'echo VERIFICATION_PASSED',
          },
        ],
        risks: ['None'],
      });
    } else if (request.systemInstruction?.includes('Coder Agent')) {
      // First turn: call write_file tool
      if (!request.messages.some((m) => m.role === 'tool')) {
        toolCalls = [
          {
            id: 'tc_write_1',
            name: 'write_file',
            arguments: {
              filePath: 'src/greeting.ts',
              content: 'export const msg = "Hello from Nexus";\n',
              overwrite: true,
            },
          },
        ];
        content = 'I will create the greeting.ts file now.';
      } else {
        content = 'Created src/greeting.ts successfully.';
      }
    } else if (request.systemInstruction?.includes('Debugger Agent')) {
      content = 'Analyzed test failure and applied fix.';
    } else if (request.systemInstruction?.includes('Reviewer Agent')) {
      content = 'All changes look good. Code is clean and verified.';
    } else if (request.systemInstruction?.includes('Explorer Agent')) {
      content = 'Repository is a standard TypeScript project.';
    }

    return {
      requestId: request.requestId,
      provider: 'gemini',
      model: request.model,
      content,
      toolCalls,
      usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75, isEstimated: false },
      finishReason: toolCalls ? 'tool_calls' : 'stop',
      durationMs: 10,
    };
  }

  async stream(
    request: ProviderRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<ProviderResponse> {
    const res = await this.complete(request);
    onChunk({ requestId: request.requestId, deltaText: res.content });
    return res;
  }
}

function setupOrchestratorTest() {
  const tempDir = path.join(os.tmpdir(), `nexus_agent_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const storageDir = path.join(tempDir, '.nexus_data');
  const storage = new StorageEngine(storageDir);

  const modelRouter = new ModelRouter();
  const mockProvider = new MockOrchestratorProvider();
  modelRouter.registerProvider(mockProvider);

  const toolRegistry = new ToolRegistry();
  registerDefaultTools(toolRegistry);

  const eventBus = new NexusEventBus();

  const explorer = new ExplorerAgent(modelRouter, toolRegistry, eventBus, storage);
  const planner = new PlannerAgent(modelRouter, toolRegistry, eventBus, storage);
  const coder = new CoderAgent(modelRouter, toolRegistry, eventBus, storage);
  const debuggerAgent = new DebuggerAgent(modelRouter, toolRegistry, eventBus, storage);
  const reviewer = new ReviewerAgent(modelRouter, toolRegistry, eventBus, storage);

  const coordinator = new CoordinatorAgent(
    explorer,
    planner,
    coder,
    debuggerAgent,
    reviewer,
    storage,
    eventBus
  );

  return {
    tempDir,
    storage,
    eventBus,
    coordinator,
    cleanup: () => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    },
  };
}

test('Orchestrator - simple task skips deep planning and completes quickly', async () => {
  const { tempDir, coordinator, eventBus, cleanup } = setupOrchestratorTest();
  try {
    const events: NexusEvent[] = [];
    const unsub = eventBus.onAll((e) => events.push(e));

    const result = await coordinator.run('read src/index.ts', {
      sessionId: 'sess_simple',
      taskId: 'task_simple',
      workspaceRoot: tempDir,
    });

    unsub();

    assert.equal(result.success, true);
    assert.equal(result.data?.status, 'completed');
    // Simple task should skip explorer and planner
    assert.ok(!result.data?.stagesRun.includes('planner'));
    assert.ok(result.data?.stagesRun.includes('coder'));
    assert.ok(result.data?.stagesRun.includes('reviewer'));

    // Check events emitted
    const types = events.map((e) => e.type);
    assert.ok(types.includes('agent_started'));
    assert.ok(types.includes('agent_completed'));
    assert.ok(types.includes('task_completed'));
  } finally {
    cleanup();
  }
});

test('Orchestrator - complex task executes full multi-agent lifecycle and creates file', async () => {
  const { tempDir, coordinator, storage, eventBus, cleanup } = setupOrchestratorTest();
  try {
    const events: NexusEvent[] = [];
    const unsub = eventBus.onAll((e) => events.push(e));

    const result = await coordinator.run('Implement a new feature with greeting.ts module and build verification', {
      sessionId: 'sess_complex',
      taskId: 'task_complex',
      workspaceRoot: tempDir,
    });

    unsub();

    assert.equal(result.success, true);
    assert.equal(result.data?.status, 'completed');
    assert.ok(result.data?.stagesRun.includes('explorer'));
    assert.ok(result.data?.stagesRun.includes('planner'));
    assert.ok(result.data?.stagesRun.includes('coder'));
    assert.ok(result.data?.stagesRun.includes('reviewer'));

    // Verify file actually created by CoderAgent
    const createdFile = path.join(tempDir, 'src/greeting.ts');
    assert.ok(fs.existsSync(createdFile));
    assert.ok(fs.readFileSync(createdFile, 'utf-8').includes('Hello from Nexus'));

    // Verify task state saved to storage
    const savedTask = storage.getTask('task_complex');
    assert.ok(savedTask);
    assert.equal(savedTask.status, 'completed');
    assert.ok(savedTask.plan);
    assert.ok(savedTask.changedFiles.length > 0);

    // Verify usage records were captured
    const usage = storage.getUsageRecords();
    assert.ok(usage.length > 0);
    assert.ok(usage.some((u) => u.agent === 'coder'));
  } finally {
    cleanup();
  }
});

test('Orchestrator - handles cancellation cleanly', async () => {
  const { tempDir, coordinator, eventBus, cleanup } = setupOrchestratorTest();
  try {
    const abortController = new AbortController();
    abortController.abort(); // Immediately aborted

    const events: NexusEvent[] = [];
    const unsub = eventBus.onAll((e) => events.push(e));

    const result = await coordinator.run('Long running refactor task', {
      sessionId: 'sess_cancel',
      taskId: 'task_cancel',
      workspaceRoot: tempDir,
      abortSignal: abortController.signal,
    });

    unsub();

    assert.equal(result.success, false);
    assert.equal(result.data?.status, 'cancelled');

    const types = events.map((e) => e.type);
    assert.ok(types.includes('task_cancelled'));
  } finally {
    cleanup();
  }
});
