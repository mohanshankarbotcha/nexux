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
} from '../agent/index.js';
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
  calculateEstimatedCost,
} from '@nexus/core';

// Intelligent mock provider supporting realistic end-to-end QA scenarios
class QABenchmarkProvider implements IModelProvider {
  readonly id = 'gemini' as const;
  readonly name = 'QA Benchmark Gemini Provider';

  async validateCredentials(): Promise<ProviderValidationResult> {
    return { provider: 'gemini', isValid: true, message: 'Valid', testedAt: Date.now() };
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const userMsg = request.messages.find((m) => m.role === 'user')?.content || '';
    const prompt = userMsg;
    const sys = request.systemInstruction || '';
    let content = 'Understood.';
    let toolCalls: any[] | undefined = undefined;

    // Explorer Agent handling
    if (sys.includes('Explorer Agent')) {
      return {
        requestId: request.requestId,
        provider: 'gemini',
        model: request.model,
        content: 'Listing repository files to understand structure.',
        toolCalls: [{ id: 'call_exp_1', name: 'list_files', arguments: { directoryPath: '.' } }],
        usage: { inputTokens: 30, outputTokens: 20, totalTokens: 50 },
        finishReason: 'tool_calls',
        durationMs: 10,
      };
    }

    // Planner Agent handling
    if (sys.includes('Planner Agent')) {
      return {
        requestId: request.requestId,
        provider: 'gemini',
        model: request.model,
        content: JSON.stringify({
          summary: `Implementation plan for ${prompt.slice(0, 40)}`,
          steps: [
            {
              id: 's1',
              description: `Implement required changes for task`,
              targetFiles: ['src/calculator.js'],
            },
          ],
          risks: [],
        }),
        usage: { inputTokens: 40, outputTokens: 30, totalTokens: 70 },
        finishReason: 'stop',
        durationMs: 10,
      };
    }

    // Reviewer Agent handling
    if (sys.includes('Reviewer Agent')) {
      return {
        requestId: request.requestId,
        provider: 'gemini',
        model: request.model,
        content: 'Code changes reviewed and approved with zero regressions.',
        usage: { inputTokens: 30, outputTokens: 20, totalTokens: 50 },
        finishReason: 'stop',
        durationMs: 10,
      };
    }

    // Debugger Agent handling
    if (sys.includes('Debugger Agent')) {
      return {
        requestId: request.requestId,
        provider: 'gemini',
        model: request.model,
        content: 'Debugger identified root cause and applied fix.',
        usage: { inputTokens: 30, outputTokens: 20, totalTokens: 50 },
        finishReason: 'stop',
        durationMs: 10,
      };
    }

    // Task A: Read and explain repository
    if (prompt.includes('Task A') || prompt.includes('explain repository')) {
      content = 'Repository Analysis:\nThe project is a mathematical utility library containing src/calculator.js, src/utils.js, and automated test suite test/calculator.test.mjs.';
    }

    // Task B: Add divide operation
    else if (prompt.includes('Task B') || prompt.includes('divide operation')) {
      if (sys.includes('Coder Agent')) {
        const hasEdited = request.messages.some((m) => m.role === 'tool' && m.name === 'edit_file');
        if (!hasEdited) {
          toolCalls = [
            {
              id: 'call_edit_b',
              name: 'edit_file',
              arguments: {
                filePath: 'src/calculator.js',
                targetContent: 'module.exports = {\n  add,\n  subtract,\n  multiply,\n};',
                replacementContent: 'function divide(a, b) {\n  if (b === 0) throw new Error("Division by zero");\n  return a / b;\n}\n\nmodule.exports = {\n  add,\n  subtract,\n  multiply,\n  divide,\n};',
              },
            },
          ];
          content = 'Implementing divide function with division by zero guard in src/calculator.js.';
        } else {
          content = 'Divide function successfully added to src/calculator.js.';
        }
      }
    }

    // Task C: Fix deliberate bug in multiply
    else if (prompt.includes('Task C') || prompt.includes('deliberate bug')) {
      if (sys.includes('Coder Agent')) {
        const hasEdited = request.messages.some((m) => m.role === 'tool' && m.name === 'edit_file');
        if (!hasEdited) {
          toolCalls = [
            {
              id: 'call_edit_c',
              name: 'edit_file',
              arguments: {
                filePath: 'src/calculator.js',
                targetContent: 'function multiply(a, b) {\n  return a * b + 1; // deliberate bug\n}',
                replacementContent: 'function multiply(a, b) {\n  return a * b;\n}',
              },
            },
          ];
          content = 'Fixing off-by-one bug in multiply function.';
        } else {
          content = 'Multiply function repaired to correct mathematical logic.';
        }
      }
    }

    // Task D: Modify multiple files
    else if (prompt.includes('Task D') || prompt.includes('multiple files')) {
      if (sys.includes('Coder Agent')) {
        const toolMsgCount = request.messages.filter((m) => m.role === 'tool').length;
        if (toolMsgCount === 0) {
          toolCalls = [
            {
              id: 'call_edit_d1',
              name: 'write_file',
              arguments: {
                filePath: 'src/utils.js',
                content: 'function validateNumber(n) {\n  if (typeof n !== "number" || isNaN(n)) throw new TypeError("Invalid number");\n  return true;\n}\n\nmodule.exports = { validateNumber };\n',
                overwrite: true,
              },
            },
          ];
          content = 'Creating validateNumber helper in src/utils.js.';
        } else if (toolMsgCount === 1) {
          toolCalls = [
            {
              id: 'call_edit_d2',
              name: 'edit_file',
              arguments: {
                filePath: 'src/calculator.js',
                targetContent: 'function add(a, b) {',
                replacementContent: 'const { validateNumber } = require("./utils.js");\n\nfunction add(a, b) {\n  validateNumber(a);\n  validateNumber(b);',
              },
            },
          ];
          content = 'Importing validateNumber in src/calculator.js.';
        } else {
          content = 'Successfully modified multiple files: src/utils.js and src/calculator.js.';
        }
      }
    }

    // Task E: Run tests and repair a failure
    else if (prompt.includes('Task E') || prompt.includes('repair a failure')) {
      if (sys.includes('Coder Agent')) {
        const termCalls = request.messages.filter((m) => m.name === 'terminal').length;
        const hasFixed = request.messages.some((m) => m.name === 'edit_file');

        if (termCalls === 0) {
          toolCalls = [
            {
              id: 'call_term_e1',
              name: 'terminal',
              arguments: { command: 'node test/calculator.test.mjs' },
            },
          ];
          content = 'Running automated tests to observe test failure.';
        } else if (!hasFixed) {
          toolCalls = [
            {
              id: 'call_edit_e',
              name: 'edit_file',
              arguments: {
                filePath: 'src/calculator.js',
                targetContent: 'function subtract(a, b) {\n  return b - a; // inverted order bug\n}',
                replacementContent: 'function subtract(a, b) {\n  return a - b;\n}',
              },
            },
          ];
          content = 'Repairing inverted argument bug in subtract function.';
        } else if (termCalls === 1) {
          toolCalls = [
            {
              id: 'call_term_e2',
              name: 'terminal',
              arguments: { command: 'node test/calculator.test.mjs' },
            },
          ];
          content = 'Re-running automated tests to confirm pass.';
        } else {
          content = 'All unit tests passing with zero errors.';
        }
      }
    }

    return {
      requestId: request.requestId,
      provider: 'gemini',
      model: request.model,
      content,
      toolCalls,
      usage: { inputTokens: 50, outputTokens: 35, totalTokens: 85 },
      finishReason: toolCalls ? 'tool_calls' : 'stop',
      durationMs: 15,
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

function setupRealisticSampleRepo() {
  const uid = `nexus_qa_repo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const repoDir = path.join(os.tmpdir(), uid);
  const dataDir = path.join(os.tmpdir(), `${uid}_data`);

  fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(repoDir, 'test'), { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  // 1. package.json
  fs.writeFileSync(
    path.join(repoDir, 'package.json'),
    JSON.stringify(
      {
        name: 'sample-calc-lib',
        version: '1.0.0',
        scripts: { test: 'node test/calculator.test.mjs' },
      },
      null,
      2
    )
  );

  // 2. src/calculator.js (with intentional deliberate bugs)
  fs.writeFileSync(
    path.join(repoDir, 'src/calculator.js'),
    `function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return b - a; // inverted order bug
}

function multiply(a, b) {
  return a * b + 1; // deliberate bug
}

module.exports = {
  add,
  subtract,
  multiply,
};
`
  );

  // 3. src/utils.js
  fs.writeFileSync(path.join(repoDir, 'src/utils.js'), '// Utility module\nmodule.exports = {};\n');

  // 4. test/calculator.test.mjs (native Node test runner)
  fs.writeFileSync(
    path.join(repoDir, 'test/calculator.test.mjs'),
    `import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const calc = require('../src/calculator.js');

// Test add
assert.equal(calc.add(2, 3), 5, 'add(2, 3) must be 5');

// Test subtract
assert.equal(calc.subtract(10, 4), 6, 'subtract(10, 4) must be 6');

// Test multiply
assert.equal(calc.multiply(3, 4), 12, 'multiply(3, 4) must be 12');

console.log('ALL TESTS PASSED SUCCESSFULLY');
`
  );

  // Initialize git repo for diff & git tracking
  try {
    spawnSync('git', ['init'], { cwd: repoDir, windowsHide: true });
    spawnSync('git', ['config', 'user.name', 'NexusTest'], { cwd: repoDir, windowsHide: true });
    spawnSync('git', ['config', 'user.email', 'test@nexus.ai'], { cwd: repoDir, windowsHide: true });
    spawnSync('git', ['add', '.'], { cwd: repoDir, windowsHide: true });
    spawnSync('git', ['commit', '-m', 'initial commit'], { cwd: repoDir, windowsHide: true });
  } catch {}

  const storage = new StorageEngine(dataDir);
  const eventBus = new NexusEventBus();
  const provider = new QABenchmarkProvider();

  const router = new ModelRouter();
  router.registerProvider(provider);

  const tools = new ToolRegistry();
  registerDefaultTools(tools);

  const wsService = new WorkspaceService(storage);
  wsService.openWorkspace(repoDir);

  const contextEngine = new ContextEngine(wsService);

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

  const cleanup = () => {
    try {
      fs.rmSync(repoDir, { recursive: true, force: true });
    } catch {}
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {}
  };

  return { repoDir, dataDir, coordinator, storage, eventBus, cleanup };
}

test('Phase 14 Quality Gate / Realistic Coding Benchmark Tasks', { concurrency: 1 }, async (t) => {
  const { repoDir, coordinator, storage, cleanup } = setupRealisticSampleRepo();

  try {
    // TASK A: Read and explain repository
    await t.test('Task A: read and explain repository structure', async () => {
      const taskId = `qa_task_a_${Date.now()}`;
      const res = await coordinator.run('Task A: read and explain repository structure and key functions', {
        sessionId: 'qa_sess',
        taskId,
        workspaceRoot: repoDir,
      });

      assert.equal(res.success, true);
      assert.ok(res.summary.includes('Repository Analysis') || res.summary.length > 20);

      // Verify task status in storage
      const task = storage.getTask(taskId);
      assert.equal(task?.status, 'completed');
      assert.ok(task?.completedAt);
    });

    // TASK B: Add a small feature (divide operation)
    await t.test('Task B: add a small feature (divide operation with zero guard)', async () => {
      const taskId = `qa_task_b_${Date.now()}`;
      const res = await coordinator.run(
        'Task B: add a small feature - add divide operation with division by zero guard to src/calculator.js',
        {
          sessionId: 'qa_sess',
          taskId,
          workspaceRoot: repoDir,
        }
      );

      assert.equal(res.success, true);

      // Verify file actually changed on disk!
      const calcContent = fs.readFileSync(path.join(repoDir, 'src/calculator.js'), 'utf-8');
      assert.ok(calcContent.includes('function divide(a, b)'), 'divide function must exist in file');
      assert.ok(calcContent.includes('Division by zero'), 'zero division check must exist in file');
      assert.ok(calcContent.includes('divide,'));

      // Verify diff was tracked
      assert.ok(res.data?.diff || res.data?.changedFiles.length! > 0);
    });

    // TASK C: Fix a deliberate bug (off-by-one in multiply)
    await t.test('Task C: fix a deliberate bug in multiply function', async () => {
      const taskId = `qa_task_c_${Date.now()}`;
      const res = await coordinator.run('Task C: fix a deliberate bug in multiply function in src/calculator.js', {
        sessionId: 'qa_sess',
        taskId,
        workspaceRoot: repoDir,
      });

      assert.equal(res.success, true);

      // Verify bug is fixed on disk
      const calcContent = fs.readFileSync(path.join(repoDir, 'src/calculator.js'), 'utf-8');
      assert.ok(!calcContent.includes('return a * b + 1'), 'Deliberate bug must be eliminated');
      assert.ok(calcContent.includes('return a * b;'), 'Correct multiply logic must be in file');
    });

    // TASK D: Modify multiple files
    await t.test('Task D: modify multiple files across workspace', async () => {
      const taskId = `qa_task_d_${Date.now()}`;
      const res = await coordinator.run(
        'Task D: modify multiple files - create validateNumber in src/utils.js and import it in src/calculator.js',
        {
          sessionId: 'qa_sess',
          taskId,
          workspaceRoot: repoDir,
        }
      );

      assert.equal(res.success, true);

      // Verify both files changed on disk
      const utilsContent = fs.readFileSync(path.join(repoDir, 'src/utils.js'), 'utf-8');
      assert.ok(utilsContent.includes('validateNumber'), 'src/utils.js must contain validateNumber');

      const calcContent = fs.readFileSync(path.join(repoDir, 'src/calculator.js'), 'utf-8');
      assert.ok(calcContent.includes('validateNumber'), 'src/calculator.js must import validateNumber');

      // Verify multiple files reported in result
      assert.ok(res.data?.changedFiles.length! >= 2, 'Must report at least 2 changed files');
    });

    // TASK E: Run tests and repair a failure
    await t.test('Task E: run tests and repair a failure via terminal tool', async () => {
      const taskId = `qa_task_e_${Date.now()}`;
      const res = await coordinator.run('Task E: run tests and repair a failure in subtract function', {
        sessionId: 'qa_sess',
        taskId,
        workspaceRoot: repoDir,
      });

      assert.equal(res.success, true);

      // Verify subtract bug was repaired
      const calcContent = fs.readFileSync(path.join(repoDir, 'src/calculator.js'), 'utf-8');
      assert.ok(!calcContent.includes('return b - a;'), 'Inverted subtract bug must be eliminated');
      assert.ok(calcContent.includes('return a - b;'), 'Correct subtract logic must be in file');

      // Run real test runner process to confirm 100% pass!
      const testResult = spawnSync('node', ['test/calculator.test.mjs'], {
        cwd: repoDir,
        encoding: 'utf-8',
        windowsHide: true,
      });
      assert.equal(testResult.status, 0, `Test suite must pass. Stderr: ${testResult.stderr}`);
      assert.ok(testResult.stdout.includes('ALL TESTS PASSED'));
    });

    // Verification of Quality Metrics
    await t.test('Verifies token usage and pricing calculation correctness', () => {
      const costGpt4o = calculateEstimatedCost('gpt-4o', 1000, 500);
      assert.ok(costGpt4o > 0);
      assert.equal(typeof costGpt4o, 'number');

      const costGemini = calculateEstimatedCost('gemini-1.5-flash', 1000, 500);
      assert.ok(costGemini > 0);
      assert.ok(costGpt4o > costGemini, 'gpt-4o should cost more than gemini-1.5-flash per 1k tokens');
    });
  } finally {
    cleanup();
  }
});
