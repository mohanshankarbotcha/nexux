import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {
  globalToolRegistry,
  ReadFileTool,
  WriteFileTool,
  EditFileTool,
  DeleteFileTool,
  ListFilesTool,
  SearchFilesTool,
  TerminalTool,
  GitStatusTool,
  GitDiffTool,
} from './index.js';
import { ToolCallContext, PathTraversalError } from '@nexus/core';

function createMockToolContext(dir: string, abortSignal?: AbortSignal): ToolCallContext {
  return {
    workspaceRoot: dir,
    sessionId: 'test_session',
    taskId: 'test_task',
    agentRole: 'coder',
    abortSignal,
  };
}

function setupTestEnvironment() {
  const tempDir = path.join(os.tmpdir(), `nexus_tool_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const initialFile = path.join(tempDir, 'sample.txt');
  fs.writeFileSync(initialFile, 'Line 1\nLine 2\nLine 3\n');

  return {
    tempDir,
    cleanup: () => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    },
  };
}

test('Tools / Registry - all 9 tools registered with parameter definitions', () => {
  assert.ok(globalToolRegistry.has('read_file'));
  assert.ok(globalToolRegistry.has('write_file'));
  assert.ok(globalToolRegistry.has('edit_file'));
  assert.ok(globalToolRegistry.has('delete_file'));
  assert.ok(globalToolRegistry.has('list_files'));
  assert.ok(globalToolRegistry.has('search_files'));
  assert.ok(globalToolRegistry.has('terminal'));
  assert.ok(globalToolRegistry.has('git_status'));
  assert.ok(globalToolRegistry.has('git_diff'));

  const defs = globalToolRegistry.getAllDefinitions();
  assert.equal(defs.length, 9);
  for (const def of defs) {
    assert.ok(def.name);
    assert.ok(def.description);
    assert.equal(def.parameters.type, 'object');
  }
});

test('Tools / read_file - reads file and enforces boundaries', async () => {
  const { tempDir, cleanup } = setupTestEnvironment();
  try {
    const tool = new ReadFileTool();
    const ctx = createMockToolContext(tempDir);

    // Normal read
    const res = await tool.execute({ filePath: 'sample.txt' }, ctx);
    assert.equal(res.success, true);
    assert.equal(res.data?.content, 'Line 1\nLine 2\nLine 3\n');
    assert.equal(res.data?.totalLines, 4);

    // Line range slicing
    const sliceRes = await tool.execute({ filePath: 'sample.txt', startLine: 2, endLine: 3 }, ctx);
    assert.equal(sliceRes.success, true);
    assert.equal(sliceRes.data?.content, 'Line 2\nLine 3');

    // Security: path traversal blocked
    const traversalRes = await tool.execute({ filePath: '../escape.txt' }, ctx);
    assert.equal(traversalRes.success, false);
    assert.ok(traversalRes.error?.includes('traversal'));
  } finally {
    cleanup();
  }
});

test('Tools / write_file - creates new file and guards existing file overwrite', async () => {
  const { tempDir, cleanup } = setupTestEnvironment();
  try {
    const tool = new WriteFileTool();
    const ctx = createMockToolContext(tempDir);

    // Create nested new file
    const createRes = await tool.execute({ filePath: 'src/config/app.json', content: '{"port": 8080}' }, ctx);
    assert.equal(createRes.success, true);
    assert.equal(createRes.data?.isCreated, true);
    assert.equal(fs.readFileSync(path.join(tempDir, 'src/config/app.json'), 'utf-8'), '{"port": 8080}');

    // Overwrite without flag must fail
    const overwriteFail = await tool.execute({ filePath: 'src/config/app.json', content: '{"port": 9000}' }, ctx);
    assert.equal(overwriteFail.success, false);
    assert.ok(overwriteFail.error?.includes('already exists'));

    // Overwrite with flag
    const overwriteSuccess = await tool.execute(
      { filePath: 'src/config/app.json', content: '{"port": 9000}', overwrite: true },
      ctx
    );
    assert.equal(overwriteSuccess.success, true);
    assert.equal(overwriteSuccess.data?.isCreated, false);
    assert.equal(fs.readFileSync(path.join(tempDir, 'src/config/app.json'), 'utf-8'), '{"port": 9000}');
  } finally {
    cleanup();
  }
});

test('Tools / edit_file - precise target replacement', async () => {
  const { tempDir, cleanup } = setupTestEnvironment();
  try {
    const tool = new EditFileTool();
    const ctx = createMockToolContext(tempDir);

    // Successful edit
    const editRes = await tool.execute(
      { filePath: 'sample.txt', targetContent: 'Line 2', replacementContent: 'Replaced Line 2' },
      ctx
    );
    assert.equal(editRes.success, true);
    assert.equal(editRes.data?.replacementsApplied, 1);
    assert.ok(fs.readFileSync(path.join(tempDir, 'sample.txt'), 'utf-8').includes('Replaced Line 2'));

    // Non-existent targetContent
    const notFoundRes = await tool.execute(
      { filePath: 'sample.txt', targetContent: 'NonExistentString', replacementContent: 'New' },
      ctx
    );
    assert.equal(notFoundRes.success, false);
    assert.ok(notFoundRes.error?.includes('not found'));
  } finally {
    cleanup();
  }
});

test('Tools / delete_file - deletes file and blocks deleting root', async () => {
  const { tempDir, cleanup } = setupTestEnvironment();
  try {
    const tool = new DeleteFileTool();
    const ctx = createMockToolContext(tempDir);

    // Delete normal file
    const delRes = await tool.execute({ filePath: 'sample.txt' }, ctx);
    assert.equal(delRes.success, true);
    assert.equal(fs.existsSync(path.join(tempDir, 'sample.txt')), false);

    // Reject deleting workspace root
    const delRootRes = await tool.execute({ filePath: '.' }, ctx);
    assert.equal(delRootRes.success, false);
    assert.ok(delRootRes.error?.includes('Refusing to delete the workspace root'));
  } finally {
    cleanup();
  }
});

test('Tools / list_files & search_files - lists and searches within workspace', async () => {
  const { tempDir, cleanup } = setupTestEnvironment();
  try {
    const listTool = new ListFilesTool();
    const searchTool = new SearchFilesTool();
    const ctx = createMockToolContext(tempDir);

    const listRes = await listTool.execute({}, ctx);
    assert.equal(listRes.success, true);
    assert.ok(listRes.data?.files.some((f) => f.name === 'sample.txt'));

    const searchRes = await searchTool.execute({ query: 'Line 2' }, ctx);
    assert.equal(searchRes.success, true);
    assert.equal(searchRes.data?.totalMatches, 1);
    assert.equal(searchRes.data?.matches[0].lineNumber, 2);
  } finally {
    cleanup();
  }
});

test('Tools / terminal - executes command, captures exit status and enforces timeout/output limits', async () => {
  const { tempDir, cleanup } = setupTestEnvironment();
  try {
    const tool = new TerminalTool();
    const ctx = createMockToolContext(tempDir);

    // Echo test
    const echoRes = await tool.execute({ command: 'echo NEXUS_TERMINAL_SUCCESS' }, ctx);
    assert.equal(echoRes.success, true);
    assert.equal(echoRes.data?.exitCode, 0);
    assert.ok(echoRes.data?.stdout.includes('NEXUS_TERMINAL_SUCCESS'));
    assert.equal(echoRes.data?.timedOut, false);

    // Output limit test
    const longRes = await tool.execute({ command: 'echo LongOutputHere', maxOutputBytes: 8 }, ctx);
    assert.equal(longRes.success, true);
    assert.ok(longRes.data?.stdout.includes('[OUTPUT TRUNCATED]'));

    // Fast timeout test
    const timeoutRes = await tool.execute({ command: 'ping -n 5 127.0.0.1', timeoutMs: 500 }, ctx);
    assert.equal(timeoutRes.data?.timedOut, true);
    assert.equal(timeoutRes.data?.exitCode, -1);
  } finally {
    cleanup();
  }
});

test('Tools / git_status & git_diff - inspects git status and diff', async () => {
  const { tempDir, cleanup } = setupTestEnvironment();
  try {
    const statusTool = new GitStatusTool();
    const diffTool = new GitDiffTool();
    const ctx = createMockToolContext(tempDir);

    // Non-git directory returns clean non-crashing status
    const statusRes = await statusTool.execute({}, ctx);
    assert.equal(statusRes.success, true);

    const diffRes = await diffTool.execute({}, ctx);
    assert.equal(diffRes.success, true);
    assert.equal(diffRes.data?.diff, '');
  } finally {
    cleanup();
  }
});
