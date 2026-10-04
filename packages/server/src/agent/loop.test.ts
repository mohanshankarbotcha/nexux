import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
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
import { ContextEngine } from '../context/context-engine.js';
import { WorkspaceService } from '../workspace/workspace-service.js';
import {
  NexusEventBus,
  NexusEvent,
  ProviderRequest,
  ProviderResponse,
  ProviderValidationResult,
  StreamChunk,
} from '@nexus/core';

class MockLoopProvider implements IModelProvider {
  readonly id = 'gemini' as const;
  readonly name = 'Mock Loop Provider';

  async validateCredentials(): Promise<ProviderValidationResult> {
    return { provider: 'gemini', isValid: true, message: 'Valid', testedAt: Date.now() };
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    let content = 'Understood.';
    let toolCalls: any[] | undefined = undefined;

    if (request.systemInstruction?.includes('Planner Agent')) {
      content = JSON.stringify({
        summary: 'Add multiply function to math.js and run verification tests',
        steps: [
          {
            id: 's1',
            description: 'Implement multiply function in math.js',
            targetFiles: ['math.js'],
            verificationCommand: 'node test.js',
          },
        ],
        risks: ['Ensure function signature handles negative numbers'],
      });
    } else if (request.systemInstruction?.includes('Coder Agent')) {
      const hasRead = request.messages.some((m) => m.name === 'read_file');
      if (!hasRead) {
        toolCalls = [
          {
            id: 'call_read_1',
            name: 'read_file',
            arguments: { filePath: 'math.js' },
          },
        ];
        content = 'Inspecting math.js content first.';
      } else {
        toolCalls = [
          {
            id: 'call_edit_1',
            name: 'edit_file',
            arguments: {
              filePath: 'math.js',
              targetContent: 'module.exports = { add };',
              replacementContent: 'function multiply(a, b) {\n  return a * b;\n}\n\nmodule.exports = { add, multiply };',
            },
          },
        ];
        content = 'Adding multiply function to math.js.';
      }
    } else if (request.systemInstruction?.includes('Reviewer Agent')) {
      content = 'Reviewed math.js changes. The multiply function was correctly implemented and verified.';
    } else if (request.systemInstruction?.includes('Explorer Agent')) {
      content = 'Found math.js and test.js in project root.';
    }

    return {
      requestId: request.requestId,
      provider: 'gemini',
      model: request.model,
      content,
      toolCalls,
      usage: { inputTokens: 40, outputTokens: 30, totalTokens: 70 },
      finishReason: toolCalls ? 'tool_calls' : 'stop',
      durationMs: 12,
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

test('End-to-End Coding Loop - modifies file, executes verification, and reviews diff', async () => {
  const tempDir = path.join(os.tmpdir(), `nexus_loop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // 1. Setup sample project with git
    spawnSync('git', ['init'], { cwd: tempDir, windowsHide: true });
    spawnSync('git', ['config', 'user.name', 'NexusTest'], { cwd: tempDir, windowsHide: true });
    spawnSync('git', ['config', 'user.email', 'test@nexus.ai'], { cwd: tempDir, windowsHide: true });

    // Initial files
    fs.writeFileSync(
      path.join(tempDir, 'math.js'),
      'function add(a, b) {\n  return a + b;\n}\n\nmodule.exports = { add };\n'
    );
    fs.writeFileSync(
      path.join(tempDir, 'test.js'),
      'const { add, multiply } = require("./math");\n' +
        'if (add(1, 2) !== 3) process.exit(1);\n' +
        'if (typeof multiply !== "function" || multiply(2, 3) !== 6) process.exit(1);\n' +
        'console.log("ALL_TESTS_PASS");\n'
    );

    // Initial commit
    spawnSync('git', ['add', '.'], { cwd: tempDir, windowsHide: true });
    spawnSync('git', ['commit', '-m', 'initial commit'], { cwd: tempDir, windowsHide: true });

    // Setup services
    const storage = new StorageEngine(path.join(tempDir, '.nexus_data'));
    const wsService = new WorkspaceService(storage);
    const contextEngine = new ContextEngine(wsService);
    const eventBus = new NexusEventBus();

    const modelRouter = new ModelRouter();
    modelRouter.registerProvider(new MockLoopProvider());

    const toolRegistry = new ToolRegistry();
    registerDefaultTools(toolRegistry);

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
      eventBus,
      contextEngine
    );

    // Track all events
    const events: NexusEvent[] = [];
    const unsub = eventBus.onAll((e) => events.push(e));

    // Execute real end-to-end task
    const result = await coordinator.run(
      'Add multiply function to math.js and make sure test.js passes',
      {
        sessionId: 'session_loop_1',
        taskId: 'task_loop_1',
        workspaceRoot: tempDir,
      }
    );

    unsub();

    // Verify task result
    assert.equal(result.success, true);
    assert.equal(result.data?.status, 'completed');
    assert.ok(result.data?.changedFiles.some((f) => f.includes('math.js')));

    // Verify file actually exists and was modified on disk!
    const mathContent = fs.readFileSync(path.join(tempDir, 'math.js'), 'utf-8');
    assert.ok(mathContent.includes('function multiply(a, b)'));
    assert.ok(mathContent.includes('multiply'));

    // Verify tests actually run and pass on the modified file!
    const testRun = spawnSync('node', ['test.js'], { cwd: tempDir, encoding: 'utf-8', windowsHide: true });
    assert.equal(testRun.status, 0);
    assert.ok(testRun.stdout.includes('ALL_TESTS_PASS'));

    // Verify event progression
    const eventTypes = events.map((e) => e.type);
    assert.ok(eventTypes.includes('task_started'));
    assert.ok(eventTypes.includes('agent_started'));
    assert.ok(eventTypes.includes('tool_started'));
    assert.ok(eventTypes.includes('tool_completed'));
    assert.ok(eventTypes.includes('command_started'));
    assert.ok(eventTypes.includes('command_completed'));
    assert.ok(eventTypes.includes('agent_completed'));
    assert.ok(eventTypes.includes('task_completed'));

    // Verify git diff reflects changes
    assert.ok(result.data?.diff?.includes('+function multiply(a, b)'));
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});
