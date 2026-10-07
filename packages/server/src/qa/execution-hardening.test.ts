import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {
  ActiveTaskRegistry,
  globalActiveTaskRegistry,
} from '../tasks/active-task-registry.js';
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
import {
  NexusEventBus,
  NexusEvent,
  ProviderRequest,
  ProviderResponse,
  ProviderValidationResult,
  resolveSafePath,
  Task,
} from '@nexus/core';

// Test Provider simulating real provider execution and tool calling
class RealisticTestProvider implements IModelProvider {
  readonly id: 'gemini' | 'openai';
  readonly name: string;
  public completedRequests: ProviderRequest[] = [];

  constructor(id: 'gemini' | 'openai' = 'gemini') {
    this.id = id;
    this.name = `Test ${id} Provider`;
  }

  getApiKey(): string {
    return 'test-key-123';
  }

  async validateCredentials(): Promise<ProviderValidationResult> {
    return { provider: this.id, isValid: true, message: 'Valid', testedAt: Date.now() };
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    this.completedRequests.push(request);

    let content = 'Completed';
    let toolCalls: any[] | undefined = undefined;

    if (request.systemInstruction?.includes('Planner Agent')) {
      content = JSON.stringify({
        summary: 'Build a calculator application with html, css, and js',
        steps: [
          {
            id: 's1',
            description: 'Create calculator HTML, CSS, and JS',
            targetFiles: ['index.html', 'style.css', 'calculator.js'],
          },
        ],
        risks: [],
      });
    } else if (request.systemInstruction?.includes('Coder Agent')) {
      // First turn: generate write_file tool calls
      const hasToolResult = request.messages.some((m) => m.role === 'tool');
      if (!hasToolResult) {
        toolCalls = [
          {
            id: 'call_html',
            name: 'write_file',
            arguments: {
              filePath: 'index.html',
              content: '<!DOCTYPE html><html><head><title>Calculator</title><link rel="stylesheet" href="style.css"></head><body><div id="calculator"><input id="display" /><button onclick="press(\'1\')">1</button></div><script src="calculator.js"></script></body></html>',
              overwrite: true,
            },
          },
          {
            id: 'call_css',
            name: 'write_file',
            arguments: {
              filePath: 'style.css',
              content: 'body { font-family: sans-serif; background: #111; color: #fff; } #calculator { width: 300px; margin: 40px auto; }',
              overwrite: true,
            },
          },
          {
            id: 'call_js',
            name: 'write_file',
            arguments: {
              filePath: 'calculator.js',
              content: 'function press(val) { const d = document.getElementById("display"); d.value += val; } function calculate() { const d = document.getElementById("display"); d.value = eval(d.value); }',
              overwrite: true,
            },
          },
        ];
        content = 'Creating the calculator application files.';
      } else {
        content = 'Calculator application implemented with index.html, style.css, and calculator.js.';
      }
    } else if (request.systemInstruction?.includes('Reviewer Agent')) {
      content = 'Review complete: Created calculator application with index.html, style.css, and calculator.js. Verified and operational.';
    }

    return {
      requestId: request.requestId || `req_${Date.now()}`,
      provider: this.id,
      model: request.model,
      content,
      toolCalls,
      usage: {
        inputTokens: 150,
        outputTokens: 75,
        totalTokens: 225,
        isEstimated: false,
      },
      finishReason: 'stop',
      durationMs: 40,
    };
  }

  async stream(request: ProviderRequest): Promise<ProviderResponse> {
    return this.complete(request);
  }
}

test('Execution Hardening — ActiveTaskRegistry Lifecycle, Heartbeats, and State Tracking', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus_hardening_reg_'));
  const storage = new StorageEngine(tempDir);
  const eventBus = new NexusEventBus();
  const registry = new ActiveTaskRegistry(eventBus, storage);

  const taskId = 'task_hard_1';
  const abortCtrl = new AbortController();
  const receivedHeartbeats: NexusEvent[] = [];

  eventBus.on('task_heartbeat', (evt) => {
    receivedHeartbeats.push(evt);
  });

  const entry = registry.register(taskId, {
    sessionId: 'session_hard_1',
    prompt: 'Build calculator',
    workspaceRoot: tempDir,
    abortController: abortCtrl,
    provider: 'gemini',
    model: 'gemini-2.5-pro',
  });

  assert.equal(entry.taskId, taskId);
  assert.equal(entry.status, 'running');
  assert.equal(entry.stage, 'created');
  assert.equal(registry.has(taskId), true);

  // Update stage
  registry.updateStage(taskId, 'coding', 'coder', 'Implementing files');
  assert.equal(registry.get(taskId)?.stage, 'coding');
  assert.equal(registry.get(taskId)?.agentRole, 'coder');

  // Verify listActive
  const activeList = registry.listActive();
  assert.equal(activeList.length, 1);
  assert.equal(activeList[0].taskId, taskId);
  assert.equal(activeList[0].model, 'gemini-2.5-pro');

  // Complete
  registry.complete(taskId, 'Task done');
  assert.equal(registry.has(taskId), false);
  assert.equal(registry.listActive().length, 0);

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('Execution Hardening — Mid-Execution Task Cancellation', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus_hardening_cancel_'));
  const storage = new StorageEngine(tempDir);
  const eventBus = new NexusEventBus();
  const registry = new ActiveTaskRegistry(eventBus, storage);

  const taskId = 'task_hard_cancel';
  const abortCtrl = new AbortController();
  let cancelledEventFired = false;

  const now = Date.now();
  const testTask: Task = {
    id: taskId,
    sessionId: 'session_cancel',
    prompt: 'Long running build task',
    status: 'running',
    stage: 'created',
    changedFiles: [],
    activeAgents: [],
    createdAt: now,
    updatedAt: now,
  };
  storage.saveTask(testTask);

  eventBus.on('task_cancelled', (evt) => {
    if (evt.taskId === taskId) cancelledEventFired = true;
  });

  registry.register(taskId, {
    sessionId: 'session_cancel',
    prompt: 'Long running build task',
    workspaceRoot: tempDir,
    abortController: abortCtrl,
  });

  assert.equal(abortCtrl.signal.aborted, false);

  // Cancel via registry
  const cancelResult = registry.cancel(taskId, 'User requested stop');
  assert.equal(cancelResult.success, true);
  assert.equal(abortCtrl.signal.aborted, true);
  assert.equal(cancelledEventFired, true);
  assert.equal(registry.has(taskId), false);

  // Repeat cancel on same task ID returns idempotent success
  const cancelRepeat = registry.cancel(taskId);
  assert.equal(cancelRepeat.success, true);

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('Execution Hardening — Autonomous Build and Physical Disk Verification ("Calculator App")', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus_hardening_calc_'));
  const storage = new StorageEngine(tempDir);
  const eventBus = new NexusEventBus();

  const toolRegistry = new ToolRegistry();
  registerDefaultTools(toolRegistry);

  const modelRouter = new ModelRouter();
  const provider = new RealisticTestProvider('gemini');
  modelRouter.registerProvider(provider);

  const contextEngine = new ContextEngine();
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
    contextEngine,
    toolRegistry,
    modelRouter
  );

  const taskId = `task_calc_${Date.now()}`;
  const abortCtrl = new AbortController();

  const result = await coordinator.run('Build me a calculator application with HTML, CSS, and JavaScript', {
    sessionId: 'session_calc',
    taskId,
    workspaceRoot: tempDir,
    abortSignal: abortCtrl.signal,
    provider: 'gemini',
    model: 'gemini-2.5-flash',
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.status, 'completed');

  // Verify that changed files were recorded
  const changedFiles = result.data?.changedFiles || [];
  assert.ok(changedFiles.length >= 3, `Expected at least 3 changed files, got ${changedFiles.length}`);
  assert.ok(changedFiles.includes('index.html'));
  assert.ok(changedFiles.includes('style.css'));
  assert.ok(changedFiles.includes('calculator.js'));

  // Physical disk verification: files MUST physically exist in workspace directory
  const htmlPath = resolveSafePath(tempDir, 'index.html');
  const cssPath = resolveSafePath(tempDir, 'style.css');
  const jsPath = resolveSafePath(tempDir, 'calculator.js');

  assert.ok(fs.existsSync(htmlPath), 'index.html must physically exist on disk');
  assert.ok(fs.existsSync(cssPath), 'style.css must physically exist on disk');
  assert.ok(fs.existsSync(jsPath), 'calculator.js must physically exist on disk');

  // Verify content of physical files
  const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
  assert.ok(htmlContent.includes('<title>Calculator</title>'));
  assert.ok(htmlContent.includes('calculator.js'));

  const jsContent = fs.readFileSync(jsPath, 'utf-8');
  assert.ok(jsContent.includes('function press'));

  // Verify token accounting
  assert.ok((result.data?.totalTokens || 0) > 0, 'Total tokens must be > 0');
  const taskInStorage = storage.getTask(taskId);
  assert.ok(taskInStorage);
  assert.equal(taskInStorage?.status, 'completed');
  assert.equal(taskInStorage?.stage, 'completed');
  assert.ok((taskInStorage?.totalTokens || 0) > 0);

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('Execution Hardening — Model Selector Override Propagation', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus_hardening_model_'));
  const storage = new StorageEngine(tempDir);
  const eventBus = new NexusEventBus();

  const toolRegistry = new ToolRegistry();
  registerDefaultTools(toolRegistry);

  const modelRouter = new ModelRouter();
  const openaiProvider = new RealisticTestProvider('openai');
  const geminiProvider = new RealisticTestProvider('gemini');
  modelRouter.registerProvider(openaiProvider);
  modelRouter.registerProvider(geminiProvider);

  const contextEngine = new ContextEngine();
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
    contextEngine,
    toolRegistry,
    modelRouter
  );

  // Run with OpenAI + gpt-4o override
  const taskId = `task_openai_${Date.now()}`;
  await coordinator.run('Build a sample script', {
    sessionId: 'session_openai',
    taskId,
    workspaceRoot: tempDir,
    abortSignal: new AbortController().signal,
    provider: 'openai',
    model: 'gpt-4o',
  });

  // Check that openaiProvider received the request with model gpt-4o
  assert.ok(openaiProvider.completedRequests.length > 0, 'OpenAI provider should have executed requests');
  const requestModels = openaiProvider.completedRequests.map((r) => r.model);
  assert.ok(requestModels.includes('gpt-4o'), `Expected model gpt-4o, got ${requestModels.join(', ')}`);

  // Verify task stored metadata reflects the selected model
  const storedTask = storage.getTask(taskId);
  assert.equal(storedTask?.providerMetadata?.provider, 'openai');
  assert.equal(storedTask?.providerMetadata?.model, 'gpt-4o');

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('Execution Hardening — Coder Markdown Fallback Parser', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus_hardening_parser_'));
  const storage = new StorageEngine(tempDir);
  const eventBus = new NexusEventBus();
  const toolRegistry = new ToolRegistry();
  registerDefaultTools(toolRegistry);

  // Provider that outputs markdown code block with filename header without calling tool directly
  class MarkdownCodeProvider implements IModelProvider {
    readonly id = 'gemini' as const;
    readonly name = 'Markdown Code Provider';
    getApiKey(): string { return 'test-key'; }
    async validateCredentials(): Promise<ProviderValidationResult> {
      return { provider: 'gemini', isValid: true, message: 'Valid', testedAt: Date.now() };
    }
    async complete(request: ProviderRequest): Promise<ProviderResponse> {
      return {
        requestId: 'req_md',
        provider: 'gemini',
        model: request.model,
        content: `Here is the requested code:
### calculator.py
\`\`\`python
def add(a, b):
    return a + b
\`\`\`
`,
        usage: { inputTokens: 50, outputTokens: 50, totalTokens: 100, isEstimated: false },
        finishReason: 'stop',
        durationMs: 20,
      };
    }
    async stream(request: ProviderRequest): Promise<ProviderResponse> {
      return this.complete(request);
    }
  }

  const modelRouter = new ModelRouter();
  modelRouter.registerProvider(new MarkdownCodeProvider());

  const coder = new CoderAgent(modelRouter, toolRegistry, eventBus, storage);
  const result = await coder.run('Create calculator.py', {
    sessionId: 'session_parse',
    taskId: 'task_parse',
    workspaceRoot: tempDir,
  });

  assert.equal(result.success, true);
  assert.ok(result.data?.changedFiles.includes('calculator.py'));

  const createdFile = resolveSafePath(tempDir, 'calculator.py');
  assert.ok(fs.existsSync(createdFile), 'calculator.py must exist on disk via markdown parsing fallback');
  const content = fs.readFileSync(createdFile, 'utf-8');
  assert.ok(content.includes('def add(a, b):'));

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
});
