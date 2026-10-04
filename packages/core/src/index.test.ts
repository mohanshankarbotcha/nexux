import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  resolveSafePath,
  getSafeRelativePath,
  PathTraversalError,
  SecurityViolationError,
  sanitizeString,
  sanitizeObject,
  calculateEstimatedCost,
  NexusError,
  NexusEventBus,
  TaskStartedEvent,
} from './index.js';

test('Security / Path Guard - validates safe workspace paths and blocks traversal', () => {
  const root = path.resolve('C:/test_workspace');

  // Valid subpaths
  const validFile = resolveSafePath(root, 'src/index.ts');
  assert.ok(validFile.toLowerCase().startsWith(root.toLowerCase()));

  const validNested = resolveSafePath(root, './deep/nested/file.txt');
  assert.ok(validNested.toLowerCase().startsWith(root.toLowerCase()));

  // Path traversal attempts must throw PathTraversalError
  assert.throws(() => {
    resolveSafePath(root, '../outside.txt');
  }, (err: unknown) => err instanceof PathTraversalError);

  assert.throws(() => {
    resolveSafePath(root, '../../../../windows/system32/cmd.exe');
  }, (err: unknown) => err instanceof PathTraversalError);

  // Absolute path outside root must throw PathTraversalError
  assert.throws(() => {
    resolveSafePath(root, 'C:/another_folder/secret.env');
  }, (err: unknown) => err instanceof PathTraversalError);

  // Null byte injection must throw SecurityViolationError
  assert.throws(() => {
    resolveSafePath(root, 'file.txt\0.js');
  }, (err: unknown) => err instanceof SecurityViolationError);
});

test('Security / Path Guard - computes safe relative path', () => {
  const root = path.resolve('C:/test_workspace');
  const file = resolveSafePath(root, 'src/components/Editor.tsx');
  const rel = getSafeRelativePath(root, file);
  assert.equal(rel, 'src/components/Editor.tsx');
});

test('Security / Sanitizer - redacts API keys and secrets', () => {
  const sensitiveOpenAI = 'Sending to api with key sk-abcdef1234567890abcdef123456789012 in header';
  const sanitizedOpenAI = sanitizeString(sensitiveOpenAI);
  assert.ok(!sanitizedOpenAI.includes('sk-abcdef1234567890abcdef123456789012'));
  assert.ok(sanitizedOpenAI.includes('[REDACTED]'));

  const sensitiveGemini = 'Gemini key AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6';
  const sanitizedGemini = sanitizeString(sensitiveGemini);
  assert.ok(!sanitizedGemini.includes('AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6'));
  assert.ok(sanitizedGemini.includes('[REDACTED]'));

  // Object sanitization
  const obj = {
    apiKey: 'sk-abcdef1234567890abcdef123456789012',
    user: 'developer',
    nested: {
      password: 'super_secret_password',
      count: 42,
    },
  };
  const sanitizedObj = sanitizeObject(obj);
  assert.ok(sanitizedObj.apiKey.includes('[REDACTED]'));
  assert.ok(sanitizedObj.nested.password.includes('[REDACTED]'));
  assert.equal(sanitizedObj.user, 'developer');
  assert.equal(sanitizedObj.nested.count, 42);
});

test('Config / Pricing - calculates cost correctly', () => {
  // gemini-2.5-flash: $0.075 / 1M in, $0.30 / 1M out
  const cost = calculateEstimatedCost('gemini-2.5-flash', 100_000, 20_000);
  // (100000 / 1M) * 0.075 = 0.0075
  // (20000 / 1M) * 0.30 = 0.006
  // total = 0.0135
  assert.equal(cost, 0.0135);
});

test('Errors / NexusError - standard error serialization', () => {
  const err = new NexusError('Test error message', 'WORKSPACE_ERROR', 400, { file: 'foo.ts' });
  const json = err.toJSON();
  assert.equal(json.name, 'NexusError');
  assert.equal(json.message, 'Test error message');
  assert.equal(json.code, 'WORKSPACE_ERROR');
  assert.equal(json.statusCode, 400);
  assert.deepEqual(json.details, { file: 'foo.ts' });
});

test('Events / EventBus - emits events and formats SSE correctly', (t, done) => {
  const bus = new NexusEventBus();
  const event: TaskStartedEvent = {
    id: 'evt-1',
    type: 'task_started',
    sessionId: 'sess-1',
    taskId: 'task-1',
    timestamp: 1700000000000,
    prompt: 'Create a hello world function',
  };

  bus.onTask('task-1', (e) => {
    assert.equal(e.id, 'evt-1');
    assert.equal(e.type, 'task_started');
    const sse = NexusEventBus.formatSSE(e);
    assert.ok(sse.startsWith('event: task_started\n'));
    assert.ok(sse.includes('"prompt":"Create a hello world function"'));
    done();
  });

  bus.emit(event);
});
