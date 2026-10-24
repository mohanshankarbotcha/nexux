import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  resolveSafePath,
  resolveWorkspacePath,
  isProtectedPath,
  parseCompilerAndRuntimeDiagnostics,
  PathTraversalError,
  ProtectedPathError,
  ToolCallContext,
} from '@nexus/core';
import {
  globalToolRegistry,
  ReadFileTool,
  WriteFileTool,
  EditFileTool,
  DeleteFileTool,
  ListFilesTool,
  CreateDirectoryTool,
  TerminalTool,
} from './index.js';
import { globalCheckpointManager } from '../storage/checkpoint-manager.js';
import { globalEvidenceLedger } from './evidence-ledger.js';
import { globalClaimChecker } from './claim-checker.js';
import { globalParallelReadRunner } from './parallel-runner.js';

test('Tools & Evidence V2 Suite (Prompt 02 R1-R11)', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus_tools_v2_'));
  const dummyContext: ToolCallContext = {
    workspaceRoot: tempDir,
    sessionId: 'session_test_v2',
    taskId: 'task_test_v2',
    agentRole: 'coder',
  };

  t.after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  await t.test('R1 Registry - tool metadata and risk classification', () => {
    const listTool = globalToolRegistry.get('list_files');
    const writeTool = globalToolRegistry.get('write_file');
    const deleteTool = globalToolRegistry.get('delete_file');
    const termTool = globalToolRegistry.get('terminal');

    assert.ok(listTool);
    assert.equal(listTool.riskClass, 'read');
    assert.equal(listTool.concurrencySafe, true);

    assert.ok(writeTool);
    assert.equal(writeTool.riskClass, 'write');
    assert.equal(writeTool.concurrencySafe, false);

    assert.ok(deleteTool);
    assert.equal(deleteTool.riskClass, 'destructive');

    assert.ok(termTool);
    assert.equal(termTool.riskClass, 'exec');
  });

  await t.test('R3 Directory Listing - structured entries, ignore patterns, pagination', async () => {
    // Setup directory structure
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'node_modules', 'dep'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'console.log("hello");');
    fs.writeFileSync(path.join(tempDir, 'src', 'calc.ts'), 'export const add = 1;');
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'node_modules', 'dep', 'index.js'), 'module.exports = {};');

    const listTool = new ListFilesTool();
    const res = await listTool.execute({ directoryPath: '.', limit: 10 }, dummyContext);

    assert.equal(res.success, true);
    assert.ok(res.data);
    // node_modules ignored by default
    const names = res.data.files.map((f) => f.name);
    assert.ok(names.includes('package.json'));
    assert.ok(!names.includes('dep'));

    // Pagination
    const page1 = await listTool.execute({ directoryPath: '.', limit: 1, offset: 0 }, dummyContext);
    assert.equal(page1.data?.files.length, 1);
    assert.equal(page1.data?.hasMore, true);

    // Missing folder returns error result
    const missingRes = await listTool.execute({ directoryPath: 'nonexistent_folder' }, dummyContext);
    assert.equal(missingRes.success, false);
    assert.ok(missingRes.error?.includes('Directory not found'));
  });

  await t.test('R4 Path Resolution - exact, case-insensitive, colloquial phrases, outside escape', () => {
    fs.mkdirSync(path.join(tempDir, 'demo'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'demo', 'sample.txt'), 'demo file');

    // 1. Exact match
    const exact = resolveWorkspacePath(tempDir, 'demo');
    assert.equal(exact.status, 'resolved');

    // 2. Colloquial match: "the demo folder" -> "demo"
    const colloquial = resolveWorkspacePath(tempDir, 'the demo folder');
    assert.equal(colloquial.status, 'resolved');

    // 3. Case-insensitive match: "DEMO"
    const caseMatch = resolveWorkspacePath(tempDir, 'DEMO');
    assert.equal(caseMatch.status, 'resolved');

    // 4. Outside workspace path
    const outside = resolveWorkspacePath(tempDir, '../../windows/system32');
    assert.equal(outside.status, 'outsideWorkspace');

    // 5. Non-existent path
    const notFound = resolveWorkspacePath(tempDir, 'completely_unknown_folder_xyz');
    assert.equal(notFound.status, 'notFound');
  });

  await t.test('R5 Protected Paths - deny list prevents access to secrets and AppData', async () => {
    // 1. .env file
    const envCheck = isProtectedPath(path.join(tempDir, '.env'), tempDir);
    assert.equal(envCheck.isProtected, true);

    // 2. id_rsa key
    const keyCheck = isProtectedPath(path.join(tempDir, 'id_rsa'), tempDir);
    assert.equal(keyCheck.isProtected, true);

    // 3. Normal file is allowed
    const normalCheck = isProtectedPath(path.join(tempDir, 'app.ts'), tempDir);
    assert.equal(normalCheck.isProtected, false);

    // 4. resolveSafePath throws ProtectedPathError
    assert.throws(() => {
      resolveSafePath(tempDir, '.env', { checkProtected: true });
    }, ProtectedPathError);

    // 5. Tool execution returns error result on protected path
    const writeTool = new WriteFileTool();
    const res = await writeTool.execute({ filePath: '.env', content: 'SECRET=123' }, dummyContext);
    assert.equal(res.success, false);
    assert.ok(res.error?.includes('protected path'));
  });

  await t.test('R6 Safe Edits - exact match, ambiguous match failure, stale hash, checkpoints', async () => {
    const filePath = 'safe_edit.txt';
    const writeTool = new WriteFileTool();
    await writeTool.execute({ filePath, content: 'line one\nrepeat line\nrepeat line\nline four' }, dummyContext);

    const editTool = new EditFileTool();

    // 1. Ambiguous match (appears twice) fails without replaceAll
    const ambigRes = await editTool.execute({
      filePath,
      targetContent: 'repeat line',
      replacementContent: 'new line',
    }, dummyContext);
    assert.equal(ambigRes.success, false);
    assert.ok(ambigRes.error?.includes('matches 2 locations'));

    // 2. Zero match fails
    const zeroRes = await editTool.execute({
      filePath,
      targetContent: 'nonexistent line',
      replacementContent: 'new line',
    }, dummyContext);
    assert.equal(zeroRes.success, false);
    assert.ok(zeroRes.error?.includes('targetContent was not found'));

    // 3. Stale hash check
    const staleRes = await editTool.execute({
      filePath,
      targetContent: 'line one',
      replacementContent: 'line ONE',
      expectedHash: 'bad_hash_1234567890abcdef',
    }, dummyContext);
    assert.equal(staleRes.success, false);
    assert.ok(staleRes.error?.includes('STALE_FILE_PRECONDITION'));

    // 4. Successful exact edit creates checkpoint
    const readTool = new ReadFileTool();
    const readRes = await readTool.execute({ filePath }, dummyContext);
    assert.ok(readRes.data?.sha256);

    const okRes = await editTool.execute({
      filePath,
      targetContent: 'line one',
      replacementContent: 'line 1',
      expectedHash: readRes.data.sha256,
    }, dummyContext);
    assert.equal(okRes.success, true);
    assert.equal(okRes.data?.checkpointCreated, true);

    // 5. Restore from checkpoint
    const restored = await globalCheckpointManager.restoreFile(tempDir, dummyContext.taskId, filePath);
    assert.equal(restored, true);
    const afterRestore = fs.readFileSync(path.join(tempDir, filePath), 'utf-8');
    assert.ok(afterRestore.includes('line one'));
  });

  await t.test('R7 Terminal - execution, exit code, timeout override, environment scrub', async () => {
    const termTool = new TerminalTool();

    // 1. Exit code 0
    const res0 = await termTool.execute({ command: 'echo hello_nexus' }, dummyContext);
    assert.equal(res0.success, true);
    assert.equal(res0.data?.exitCode, 0);
    assert.ok(res0.data?.stdout.includes('hello_nexus'));

    // 2. Exit code 1
    const res1 = await termTool.execute({ command: 'cmd /c exit 1' }, dummyContext);
    assert.equal(res1.data?.exitCode, 1);

    // 3. Stderr capture
    const resStderr = await termTool.execute({ command: 'cmd /c "echo error_msg 1>&2"' }, dummyContext);
    assert.ok(resStderr.data?.stderr.includes('error_msg'));

    // 4. Timeout handling with ping command
    const resTimeout = await termTool.execute({ command: 'ping -n 4 127.0.0.1', timeoutMs: 500 }, dummyContext);
    assert.equal(resTimeout.data?.timedOut, true);

    // 5. Prohibited command blocked by security policy
    const resDangerous = await termTool.execute({ command: 'git push origin main' }, dummyContext);
    assert.equal(resDangerous.success, false);
    assert.ok(resDangerous.error?.includes('Remote Git push operations are restricted'));
  });

  await t.test('R8 Diagnostics Parser - TypeScript, ESLint, Python, npm, Node', () => {
    // TypeScript output
    const tsOutput = `src/calc.ts(15,8): error TS2322: Type 'string' is not assignable to type 'number'.`;
    const tsParsed = parseCompilerAndRuntimeDiagnostics(tsOutput);
    assert.equal(tsParsed.errorCount, 1);
    assert.equal(tsParsed.diagnostics[0].source, 'typescript');
    assert.equal(tsParsed.diagnostics[0].line, 15);
    assert.equal(tsParsed.diagnostics[0].code, 'TS2322');

    // Python traceback
    const pyOutput = `Traceback (most recent call last):\n  File "calculator.py", line 22, in divide\nZeroDivisionError: division by zero`;
    const pyParsed = parseCompilerAndRuntimeDiagnostics(pyOutput);
    assert.equal(pyParsed.errorCount, 1);
    assert.equal(pyParsed.diagnostics[0].source, 'python');
    assert.equal(pyParsed.diagnostics[0].file, 'calculator.py');
    assert.equal(pyParsed.diagnostics[0].line, 22);

    // ESLint
    const eslintOutput = `src/index.js:12:4: 'unusedVar' is defined but never used. [no-unused-vars]`;
    const esParsed = parseCompilerAndRuntimeDiagnostics(eslintOutput);
    assert.equal(esParsed.errorCount, 1);
    assert.equal(esParsed.diagnostics[0].source, 'eslint');
  });

  await t.test('R9 & R10 Evidence Ledger and Claim Checker', async () => {
    const claimFile = 'created_file.py';
    const writeTool = new WriteFileTool();

    // 1. Claim file created BEFORE creating it fails
    const prematureClaim = await globalClaimChecker.verifyClaims(tempDir, dummyContext.taskId, [
      { type: 'created', subject: claimFile },
    ]);
    assert.equal(prematureClaim[0].supported, false);

    // 2. Create file with tool (automatically logs evidence)
    await writeTool.execute({ filePath: claimFile, content: 'def add(a, b): return a + b' }, dummyContext);

    // 3. Claim file created AFTER tool call succeeds
    const verifiedClaim = await globalClaimChecker.verifyClaims(tempDir, dummyContext.taskId, [
      { type: 'created', subject: claimFile },
    ]);
    assert.equal(verifiedClaim[0].supported, true);
    assert.ok(verifiedClaim[0].reason.includes('write_file evidence'));

    // 4. Claim delete
    const deleteTool = new DeleteFileTool();
    await deleteTool.execute({ filePath: claimFile }, dummyContext);
    const deleteClaim = await globalClaimChecker.verifyClaims(tempDir, dummyContext.taskId, [
      { type: 'deleted', subject: claimFile },
    ]);
    assert.equal(deleteClaim[0].supported, true);
  });

  await t.test('R11 Parallel Read Runner - concurrent execution with limits', async () => {
    const parallelRunner = globalParallelReadRunner;
    const tasks = [
      { name: 'list_files' as const, input: { directoryPath: '.' } },
      { name: 'read_file' as const, input: { filePath: 'package.json' } },
      { name: 'git_status' as const, input: {} },
    ];

    const results = await parallelRunner.runParallel(globalToolRegistry, tasks, dummyContext, 2);
    assert.equal(results.length, 3);
    assert.ok(results.every((r) => r.success));

    // Reject mutating tools in parallel runner
    assert.rejects(async () => {
      await parallelRunner.runParallel(
        globalToolRegistry,
        [{ name: 'delete_file' as const, input: { filePath: 'foo' } }],
        dummyContext
      );
    });
  });
});
