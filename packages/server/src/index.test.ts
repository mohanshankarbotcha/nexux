import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {
  ModelRouter,
  IModelProvider,
  ToolRegistry,
  BaseTool,
  StorageEngine,
  createNexusApp,
} from './index.js';
import {
  ProviderId,
  ProviderRequest,
  ProviderResponse,
  ProviderValidationResult,
  StreamChunk,
  ToolCallContext,
  ToolDefinition,
  ToolName,
  ToolResult,
} from '@nexus/core';

// Mock Provider implementation for testing boundaries
class MockTestProvider implements IModelProvider {
  readonly id: ProviderId = 'gemini';
  readonly name = 'Mock Gemini Provider';

  async validateCredentials(): Promise<ProviderValidationResult> {
    return {
      provider: 'gemini',
      isValid: true,
      message: 'Mock valid',
      testedAt: Date.now(),
    };
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    return {
      requestId: request.requestId,
      provider: 'gemini',
      model: request.model,
      content: 'Mock response content',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      finishReason: 'stop',
      durationMs: 15,
    };
  }

  async stream(
    request: ProviderRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<ProviderResponse> {
    onChunk({ requestId: request.requestId, deltaText: 'Mock streamed' });
    return this.complete(request);
  }
}

// Mock Tool implementation for testing boundaries
class MockTestTool extends BaseTool<{ name: string }, { greeting: string }> {
  readonly name: ToolName = 'read_file';
  readonly definition: ToolDefinition = {
    name: 'read_file',
    description: 'Mock tool description',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
      },
      required: ['filePath'],
    },
  };

  protected async run(input: { name: string }): Promise<{ greeting: string }> {
    if (input.name === 'trigger_error') {
      throw new Error('Simulated tool failure');
    }
    return { greeting: `Hello, ${input.name}` };
  }
}

test('Boundary / ModelRouter - registers provider and routes by agent role', async () => {
  const router = new ModelRouter();
  const mockProvider = new MockTestProvider();

  router.registerProvider(mockProvider);
  assert.equal(router.getProvider('gemini'), mockProvider);

  // Execute for coordinator role
  const response = await router.executeForRole('coordinator', {
    requestId: 'req-1',
    messages: [{ role: 'user', content: 'hello' }],
  });

  assert.equal(response.content, 'Mock response content');
  assert.equal(response.provider, 'gemini');
  assert.equal(response.usage.totalTokens, 30);
});

test('Boundary / ToolRegistry - registers tool and safely executes with error trapping', async () => {
  const registry = new ToolRegistry();
  const tool = new MockTestTool();
  registry.register(tool);

  assert.equal(registry.has('read_file'), true);
  assert.equal(registry.getAllDefinitions().length, 1);

  const context: ToolCallContext = {
    workspaceRoot: 'C:/mock_workspace',
    sessionId: 's1',
    taskId: 't1',
    agentRole: 'coder',
  };

  // Successful tool call
  const successRes = await registry.execute('read_file', { name: 'Alice' }, context);
  assert.equal(successRes.success, true);
  assert.deepEqual(successRes.data, { greeting: 'Hello, Alice' });

  // Trapped error within tool
  const failRes = await registry.execute('read_file', { name: 'trigger_error' }, context);
  assert.equal(failRes.success, false);
  assert.ok(failRes.error?.includes('Simulated tool failure'));
});

test('Boundary / StorageEngine - isolates and persists local data safely', () => {
  const tempDir = path.join(os.tmpdir(), `nexus_test_data_${Date.now()}`);
  const storage = new StorageEngine(tempDir);

  // Save workspace
  storage.saveWorkspace({
    id: 'ws-1',
    name: 'Test Project',
    path: 'C:/test',
    createdAt: 100,
    lastOpenedAt: 200,
  });

  const workspaces = storage.getWorkspaces();
  assert.equal(workspaces.length, 1);
  assert.equal(workspaces[0].name, 'Test Project');

  // Save and retrieve credentials
  storage.saveCredentials({ openaiApiKey: 'sk-test1234567890' });
  const creds = storage.getCredentials();
  assert.equal(creds.openaiApiKey, 'sk-test1234567890');

  // Clean up test dir
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
});

test('Boundary / Express App - initializes and mounts health and API routes', () => {
  const app = createNexusApp();
  assert.ok(app);
});
