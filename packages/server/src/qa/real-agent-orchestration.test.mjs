import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import cp from 'node:child_process';
import assert from 'node:assert/strict';

import {
  CoordinatorAgent,
  ExplorerAgent,
  PlannerAgent,
  CoderAgent,
  DebuggerAgent,
  ReviewerAgent,
} from '../../dist/agent/index.js';
import { ModelRouter } from '../../dist/providers/index.js';
import { ToolRegistry, registerDefaultTools } from '../../dist/tools/index.js';
import { StorageEngine } from '../../dist/storage/storage-engine.js';
import { ContextEngine } from '../../dist/context/context-engine.js';
import { WorkspaceService } from '../../dist/workspace/workspace-service.js';
import { NexusEventBus } from '@nexus/core';

console.log('====================================================');
console.log('  NEXUS.AI — Multi-Agent Live Orchestration Test');
console.log('====================================================\n');

const testRunId = Date.now();
const testWsDir = path.join(os.tmpdir(), `nexus-agent-test-${testRunId}`);
const testDataDir = path.join(os.tmpdir(), `nexus-agent-data-${testRunId}`);

fs.mkdirSync(testWsDir, { recursive: true });
fs.mkdirSync(testDataDir, { recursive: true });

// Realistic model provider mock that performs exact tool calling instructions
class AutonomousTestProvider {
  id = 'gemini';
  name = 'Autonomous Agent Model';

  async validateCredentials() {
    return { provider: 'gemini', isValid: true, message: 'Valid', testedAt: Date.now() };
  }

  async complete(request) {
    const sys = request.systemInstruction || '';
    const userMsg = request.messages.find((m) => m.role === 'user')?.content || '';

    // Explorer Agent
    if (sys.includes('Explorer Agent')) {
      return {
        requestId: request.requestId,
        provider: 'gemini',
        model: request.model,
        content: 'Explored workspace topology and file structures.',
        toolCalls: [
          {
            id: 'call_exp_list',
            name: 'list_files',
            arguments: { directoryPath: '.' },
          },
        ],
        usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
        finishReason: 'tool_calls',
        durationMs: 15,
      };
    }

    // Planner Agent
    if (sys.includes('Planner Agent')) {
      const isCreateTest = userMsg.includes('nexus_test.txt');
      const isDebuggerTest = userMsg.includes('deliberate') || userMsg.includes('power');

      return {
        requestId: request.requestId,
        provider: 'gemini',
        model: request.model,
        content: JSON.stringify({
          summary: isCreateTest
            ? 'Plan to create nexus_test.txt with required integration test message'
            : 'Plan to repair deliberate bug and verify math tests',
          steps: [
            {
              id: 'step_1',
              description: isCreateTest
                ? 'Create nexus_test.txt file with exact required text'
                : 'Fix power function in src/math.js',
              targetFiles: [isCreateTest ? 'nexus_test.txt' : 'src/math.js'],
              verificationCommand: isDebuggerTest ? 'node --test test/math.test.js' : undefined,
            },
          ],
          risks: [],
        }),
        usage: { inputTokens: 60, outputTokens: 40, totalTokens: 100 },
        finishReason: 'stop',
        durationMs: 15,
      };
    }

    // Coder Agent
    if (sys.includes('Coder Agent')) {
      const hasWritten = request.messages.some((m) => m.role === 'tool' && m.name === 'write_file');
      const hasEdited = request.messages.some((m) => m.role === 'tool' && m.name === 'edit_file');

      if (userMsg.includes('nexus_test.txt')) {
        if (!hasWritten) {
          return {
            requestId: request.requestId,
            provider: 'gemini',
            model: request.model,
            content: 'Writing nexus_test.txt file.',
            toolCalls: [
              {
                id: 'call_write_test',
                name: 'write_file',
                arguments: {
                  filePath: 'nexus_test.txt',
                  content: 'NEXUS.AI integration test successful.\n',
                  overwrite: true,
                },
              },
            ],
            usage: { inputTokens: 45, outputTokens: 35, totalTokens: 80 },
            finishReason: 'tool_calls',
            durationMs: 20,
          };
        } else {
          return {
            requestId: request.requestId,
            provider: 'gemini',
            model: request.model,
            content: 'Successfully created nexus_test.txt with required content.',
            usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60 },
            finishReason: 'stop',
            durationMs: 10,
          };
        }
      }

      if (userMsg.includes('power')) {
        if (!hasEdited) {
          return {
            requestId: request.requestId,
            provider: 'gemini',
            model: request.model,
            content: 'Fixing deliberate bug in power function.',
            toolCalls: [
              {
                id: 'call_edit_math',
                name: 'edit_file',
                arguments: {
                  filePath: 'src/math.js',
                  targetContent: 'return base + exp; // deliberate bug',
                  replacementContent: 'return base ** exp;',
                },
              },
            ],
            usage: { inputTokens: 50, outputTokens: 30, totalTokens: 80 },
            finishReason: 'tool_calls',
            durationMs: 15,
          };
        } else {
          return {
            requestId: request.requestId,
            provider: 'gemini',
            model: request.model,
            content: 'Power function repaired.',
            usage: { inputTokens: 35, outputTokens: 15, totalTokens: 50 },
            finishReason: 'stop',
            durationMs: 10,
          };
        }
      }
    }

    // Debugger Agent
    if (sys.includes('Debugger Agent')) {
      const hasEditedInDebug = request.messages.some((m) => m.role === 'tool' && m.name === 'edit_file');
      if (!hasEditedInDebug) {
        return {
          requestId: request.requestId,
          provider: 'gemini',
          model: request.model,
          content: 'Diagnosed failure in power function. Applying fix in src/math.js.',
          toolCalls: [
            {
              id: 'call_debug_edit',
              name: 'edit_file',
              arguments: {
                filePath: 'src/math.js',
                targetContent: 'return base + exp; // deliberate bug',
                replacementContent: 'return base ** exp;',
              },
            },
          ],
          usage: { inputTokens: 55, outputTokens: 35, totalTokens: 90 },
          finishReason: 'tool_calls',
          durationMs: 20,
        };
      } else {
        return {
          requestId: request.requestId,
          provider: 'gemini',
          model: request.model,
          content: 'Deliberate bug fixed and verified.',
          usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60 },
          finishReason: 'stop',
          durationMs: 10,
        };
      }
    }

    // Reviewer Agent
    if (sys.includes('Reviewer Agent')) {
      return {
        requestId: request.requestId,
        provider: 'gemini',
        model: request.model,
        content: 'Review verified: All changes conform to specification and unit tests pass.',
        usage: { inputTokens: 45, outputTokens: 25, totalTokens: 70 },
        finishReason: 'stop',
        durationMs: 15,
      };
    }

    return {
      requestId: request.requestId,
      provider: 'gemini',
      model: request.model,
      content: 'Execution completed.',
      usage: { inputTokens: 30, outputTokens: 15, totalTokens: 45 },
      finishReason: 'stop',
      durationMs: 10,
    };
  }

  async stream(request, onChunk) {
    const res = await this.complete(request);
    onChunk({ requestId: request.requestId, deltaText: res.content });
    return res;
  }
}

async function runTest() {
  try {
    // Setup git in workspace
    cp.execSync('git init', { cwd: testWsDir, stdio: 'ignore' });
    cp.execSync('git config user.email "agent-qa@nexus.ai"', { cwd: testWsDir, stdio: 'ignore' });
    cp.execSync('git config user.name "Agent QA"', { cwd: testWsDir, stdio: 'ignore' });

    fs.mkdirSync(path.join(testWsDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(testWsDir, 'test'), { recursive: true });

    // Initial files
    fs.writeFileSync(
      path.join(testWsDir, 'src/math.js'),
      'export function add(a, b) {\n  return a + b;\n}\n\nexport function power(base, exp) {\n  return base + exp; // deliberate bug\n}\n'
    );
    fs.writeFileSync(
      path.join(testWsDir, 'test/math.test.js'),
      'import { describe, it } from "node:test";\nimport assert from "node:assert/strict";\nimport { add, power } from "../src/math.js";\n\ndescribe("Math Tests", () => {\n  it("adds numbers", () => assert.equal(add(2, 3), 5));\n  it("calculates power", () => assert.equal(power(2, 4), 16));\n});\n'
    );

    cp.execSync('git add -A && git commit -m "initial math files"', { cwd: testWsDir, stdio: 'ignore' });

    // Initialize dependencies
    const storage = new StorageEngine(testDataDir);
    const eventBus = new NexusEventBus();
    const router = new ModelRouter();
    router.registerProvider(new AutonomousTestProvider());

    const tools = new ToolRegistry();
    registerDefaultTools(tools);

    const workspaceService = new WorkspaceService(storage);
    const contextEngine = new ContextEngine(workspaceService);

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

    // Track emitted events
    const emittedEvents = [];
    eventBus.onAll((evt) => emittedEvents.push(evt));

    // ========================================================
    // PHASE 5: Real Agent Orchestration Test
    // Task: "Create a file named nexus_test.txt containing: NEXUS.AI integration test successful."
    // ========================================================
    console.log('--- Executing Phase 5: Controlled Real Coding Task ---');
    const phase5Prompt = 'Create a file named nexus_test.txt containing: NEXUS.AI integration test successful.';
    const taskId1 = `task_${Date.now()}_phase5`;
    const res1 = await coordinator.run(phase5Prompt, {
      sessionId: `session_${Date.now()}`,
      taskId: taskId1,
      workspaceRoot: testWsDir,
    });

    if (!res1.success) {
      console.error('res1 error:', res1.summary, res1.data);
    }
    assert.equal(res1.success, true);
    assert.equal(res1.data.status, 'completed');

    // 1. Verify file exists on disk
    const targetFilePath = path.join(testWsDir, 'nexus_test.txt');
    assert.ok(fs.existsSync(targetFilePath), 'File nexus_test.txt must exist on disk');

    // 2. Verify exact content
    const fileContent = fs.readFileSync(targetFilePath, 'utf-8').trim();
    assert.equal(fileContent, 'NEXUS.AI integration test successful.');
    console.log('✔ [PHASE 5] File created and verified on disk with exact content:', fileContent);

    // 3. Verify agent statuses & tool activity
    assert.ok(emittedEvents.some((e) => e.type === 'agent_started' && e.agentRole === 'coordinator'));
    assert.ok(emittedEvents.some((e) => e.type === 'agent_started' && e.agentRole === 'coder'));
    assert.ok(emittedEvents.some((e) => e.type === 'tool_completed' && e.toolName === 'write_file'));
    assert.ok(emittedEvents.some((e) => e.type === 'task_completed'));
    console.log('✔ [PHASE 5] Complete orchestration chain verified: Coordinator → Planner → Coder → Filesystem → Reviewer');

    // ========================================================
    // PHASE 14: Debugger Test
    // ========================================================
    console.log('\n--- Executing Phase 14: Debugger Automated Failure Repair ---');
    // Verify math.test.js currently fails due to deliberate bug
    let testFailedFirst = false;
    try {
      cp.execSync('node --test test/math.test.js', { cwd: testWsDir, stdio: 'pipe' });
    } catch {
      testFailedFirst = true;
    }
    assert.ok(testFailedFirst, 'Math test must fail before debugger is invoked');
    console.log('✔ [PHASE 14] Test failed as expected on deliberate bug in power()');

    const debugPrompt = 'Fix the deliberate bug in the power function so tests pass.';
    const taskId2 = `task_${Date.now()}_debug`;
    const res2 = await coordinator.run(debugPrompt, {
      sessionId: `session_${Date.now()}`,
      taskId: taskId2,
      workspaceRoot: testWsDir,
    });

    assert.equal(res2.success, true);

    // Verify file was repaired
    const repairedMath = fs.readFileSync(path.join(testWsDir, 'src/math.js'), 'utf-8');
    assert.ok(repairedMath.includes('base ** exp'), 'Debugger must replace bug with base ** exp');

    // Verify test now passes!
    const testOutAfter = cp.execSync('node --test test/math.test.js', { cwd: testWsDir, encoding: 'utf-8' });
    assert.ok(testOutAfter.includes('pass 2'), 'All 2 tests must pass after fix');
    console.log('✔ [PHASE 14] Debugger diagnosed failure, corrected code, and reran tests to pass 2/2');

    // ========================================================
    // PHASE 15: Reviewer Test
    // ========================================================
    console.log('\n--- Executing Phase 15: Reviewer Verification ---');
    const reviewer = new ReviewerAgent(router, tools, eventBus, storage);
    const reviewRes = await reviewer.run('Review recent bug fix', {
      sessionId: `session_${Date.now()}`,
      taskId: `task_${Date.now()}_review`,
      workspaceRoot: testWsDir,
    });

    assert.equal(reviewRes.success, true);
    assert.equal(reviewRes.data.approved, true);
    assert.ok(reviewRes.data.changedFiles.includes('src/math.js'));
    assert.ok(reviewRes.data.diffSummary.includes('+  return base ** exp;'));
    console.log('✔ [PHASE 15] Reviewer inspected git diff, verified modified files, and reported approval');

    console.log('\n====================================================');
    console.log('  ALL ORCHESTRATION, DEBUGGER & REVIEWER TESTS PASSED!');
    console.log('====================================================\n');
  } finally {
    try {
      fs.rmSync(testWsDir, { recursive: true, force: true });
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
  }
}

runTest().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
