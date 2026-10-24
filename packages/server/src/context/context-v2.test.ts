import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  ProjectProfileManager,
  SessionWorkingSetManager,
  ReferenceResolver,
  ConversationManager,
  ContextPackBuilder,
} from './index.js';

test('Context V2 - Project Profile discovery and persistence in .nexus/project.json', async () => {
  const tempDir = path.join(os.tmpdir(), `nexus_profile_test_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // 1. Create a sample node project with package.json
    const pkgJson = {
      name: 'sample-project',
      scripts: {
        test: 'jest --ci',
        build: 'tsc -p tsconfig.json',
        dev: 'ts-node src/index.ts',
      },
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkgJson, null, 2), 'utf-8');
    fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}', 'utf-8');

    const profileManager = new ProjectProfileManager();
    const profile = await profileManager.getProfile(tempDir);

    assert.equal(profile.language, 'typescript');
    assert.equal(profile.packageManager, 'npm');
    assert.equal(profile.testCommand, 'npm test');
    assert.equal(profile.buildCommand, 'npm run build');

    // Verify .nexus/project.json was created
    const nexusProjectJsonPath = path.join(tempDir, '.nexus', 'project.json');
    assert.ok(fs.existsSync(nexusProjectJsonPath));

    const saved = JSON.parse(fs.readFileSync(nexusProjectJsonPath, 'utf-8'));
    assert.equal(saved.language, 'typescript');
    assert.equal(saved.testCommand, 'npm test');

    // 2. Modify project.json manually to simulate custom learned command
    saved.testCommand = 'npm test -- --coverage';
    fs.writeFileSync(nexusProjectJsonPath, JSON.stringify(saved, null, 2), 'utf-8');

    // Clear in-memory cache to force reading from disk .nexus/project.json
    profileManager.clearCache();
    const reloaded = await profileManager.getProfile(tempDir);
    assert.equal(reloaded.testCommand, 'npm test -- --coverage');
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});

test('Context V2 - Working Set tracking, largest file detection, and external edit stale detection', async () => {
  const tempDir = path.join(os.tmpdir(), `nexus_workingset_test_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const fileA = path.join(tempDir, 'small.txt');
    const fileB = path.join(tempDir, 'large.txt');
    fs.writeFileSync(fileA, 'hello', 'utf-8'); // 5 bytes
    fs.writeFileSync(fileB, 'hello world, this is a much larger file with lots of text', 'utf-8'); // 58 bytes

    const workingSet = new SessionWorkingSetManager();
    const sessionId = 'session_ws_1';

    // Add files to working set
    workingSet.addFile(sessionId, tempDir, 'small.txt', 'read');
    workingSet.addFile(sessionId, tempDir, 'large.txt', 'write');

    // 1. Largest file check
    const largest = workingSet.getLargestFile(sessionId, tempDir);
    assert.ok(largest);
    assert.equal(largest.relativePath, 'large.txt');
    assert.equal(largest.byteSize, 57);

    // 2. Stale file detection: initially not stale
    let stale = workingSet.checkStaleFiles(sessionId, tempDir);
    assert.equal(stale.length, 0);

    // 3. External edit to small.txt: simulate outside editor updating file
    // Wait slightly to guarantee mtime difference on Windows filesystems
    await new Promise((r) => setTimeout(r, 60));
    fs.writeFileSync(fileA, 'outside edit with new modified contents', 'utf-8');

    stale = workingSet.checkStaleFiles(sessionId, tempDir);
    assert.equal(stale.length, 1);
    assert.equal(stale[0], 'small.txt');

    // 4. Revalidate stale file
    const revalidated = workingSet.revalidateFile(sessionId, tempDir, 'small.txt');
    assert.ok(revalidated);
    assert.ok(revalidated.byteSize > 5);

    stale = workingSet.checkStaleFiles(sessionId, tempDir);
    assert.equal(stale.length, 0);
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});

test('Context V2 - Reference Resolver: resolves "the biggest one", "the error", "tests again", "the changes"', async () => {
  const tempDir = path.join(os.tmpdir(), `nexus_resolver_test_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    fs.writeFileSync(path.join(tempDir, 'file1.js'), 'const a = 1;', 'utf-8');
    fs.writeFileSync(path.join(tempDir, 'file2.js'), 'const a = 1; const b = 2; const c = 3; const d = 4;', 'utf-8');

    const workingSet = new SessionWorkingSetManager();
    const profileManager = new ProjectProfileManager();
    const resolver = new ReferenceResolver(workingSet, profileManager);
    const sessionId = 'session_ref_1';

    workingSet.addFile(sessionId, tempDir, 'file1.js', 'read');
    workingSet.addFile(sessionId, tempDir, 'file2.js', 'read');

    // Scenario 1: "now open the biggest one and explain it"
    const res1 = await resolver.resolveReference('now open the biggest one and explain it', sessionId, tempDir);
    assert.equal(res1.resolved, true);
    assert.equal(res1.type, 'file');
    assert.equal(res1.target, 'file2.js');

    // Scenario 2: "No, the other one" -> switches to alternative!
    const res2 = await resolver.resolveReference('No, the other one', sessionId, tempDir);
    assert.equal(res2.resolved, true);
    assert.equal(res2.type, 'file');
    assert.equal(res2.target, 'file1.js');

    // Scenario 3: "fix the error you just found"
    workingSet.recordLastError(sessionId, 'TypeError: cannot read property of undefined at index.js:14', 'node index.js');
    const res3 = await resolver.resolveReference('fix the error you just found', sessionId, tempDir);
    assert.equal(res3.resolved, true);
    assert.equal(res3.type, 'error');
    assert.ok(res3.target?.includes('TypeError'));

    // Scenario 4: "run the tests again"
    await profileManager.updateProfile(tempDir, { testCommand: 'npm test' });
    const res4 = await resolver.resolveReference('run the tests again', sessionId, tempDir);
    assert.equal(res4.resolved, true);
    assert.equal(res4.type, 'command');
    assert.equal(res4.target, 'npm test');

    // Scenario 5: "explain the changes you made"
    workingSet.recordChangeSet(sessionId, {
      createdFiles: ['src/new.ts'],
      modifiedFiles: ['src/index.ts'],
      deletedFiles: [],
      totalFilesChanged: 2,
    });
    const res5 = await resolver.resolveReference('explain the changes you made', sessionId, tempDir);
    assert.equal(res5.resolved, true);
    assert.equal(res5.type, 'changeset');
    assert.ok(res5.target?.includes('src/new.ts'));

    // Scenario 6: Ambiguous choice when multiple files exist with equal salience and no distinct recent
    const ambiguousState = workingSet.getOrCreateSession('session_ambiguous', tempDir);
    const now = Date.now();
    ambiguousState.items = [
      { filePath: path.join(tempDir, 'file1.js'), relativePath: 'file1.js', sha256: 'h1', mtimeMs: now, byteSize: 10, lastAccessedAt: now, lastOperation: 'read' },
      { filePath: path.join(tempDir, 'file2.js'), relativePath: 'file2.js', sha256: 'h2', mtimeMs: now, byteSize: 20, lastAccessedAt: now, lastOperation: 'read' },
    ];
    const res6 = await resolver.resolveReference('open that file', 'session_ambiguous', tempDir);
    assert.equal(res6.resolved, false);
    assert.equal(res6.type, 'clarification');
    assert.ok(res6.clarificationQuestion?.includes('Did you mean'));
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});

test('Context V2 - Conversation Manager: token budgeting and compaction keeping verbatim corrections', () => {
  const convManager = new ConversationManager();
  const sessionId = 'session_compaction_1';

  // Add turns
  convManager.addTurn(sessionId, { role: 'user', content: 'Create a web server' });
  convManager.addTurn(sessionId, { role: 'assistant', content: 'Creating web server using Express on port 3000' });
  convManager.addTurn(sessionId, { role: 'user', content: 'No, use port 8080 and do not use Express, use fastify' }); // Correction!
  convManager.addTurn(sessionId, { role: 'assistant', content: 'Switching to Fastify on port 8080' });

  // Add large volume of text to exceed token budget
  const largeTurn = 'A'.repeat(16_000); // ~4000 tokens
  convManager.addTurn(sessionId, { role: 'assistant', content: largeTurn });
  convManager.addTurn(sessionId, { role: 'user', content: 'Now add healthcheck endpoint' });
  convManager.addTurn(sessionId, { role: 'assistant', content: 'Adding /health endpoint' });

  // Check that compaction ran
  const summary = convManager.getSummary(sessionId);
  assert.ok(summary);
  assert.ok(summary.compactedTurnsCount > 0);

  // Verbatim correction MUST be preserved
  assert.ok(
    summary.verbatimCorrections.some((c) =>
      c.includes('No, use port 8080 and do not use Express, use fastify')
    )
  );

  // Recent turns are preserved
  const turns = convManager.getTurns(sessionId);
  assert.ok(turns.some((t) => t.content === 'Now add healthcheck endpoint'));
});

test('Context V2 - ContextPackBuilder: formats layered prompt and isolates workspaces', async () => {
  const tempDirA = path.join(os.tmpdir(), `nexus_pack_test_A_${Date.now()}`);
  const tempDirB = path.join(os.tmpdir(), `nexus_pack_test_B_${Date.now()}`);
  fs.mkdirSync(tempDirA, { recursive: true });
  fs.mkdirSync(tempDirB, { recursive: true });

  try {
    fs.writeFileSync(path.join(tempDirA, 'appA.py'), 'print("App A")', 'utf-8');
    fs.writeFileSync(path.join(tempDirB, 'appB.js'), 'console.log("App B")', 'utf-8');

    const workingSet = new SessionWorkingSetManager();
    const profileManager = new ProjectProfileManager();
    const convManager = new ConversationManager();
    const packBuilder = new ContextPackBuilder(profileManager, workingSet, convManager);

    workingSet.addFile('session_A', tempDirA, 'appA.py', 'read');
    workingSet.addFile('session_B', tempDirB, 'appB.js', 'read');

    const packA = await packBuilder.buildLayeredContext('session_A', 'task_A', tempDirA);
    const packB = await packBuilder.buildLayeredContext('session_B', 'task_B', tempDirB);

    // Workspace Isolation: Workspace A has appA.py, not appB.js
    assert.ok(packA.workingSet.some((f) => f.relativePath === 'appA.py'));
    assert.ok(!packA.workingSet.some((f) => f.relativePath === 'appB.js'));

    assert.ok(packB.workingSet.some((f) => f.relativePath === 'appB.js'));
    assert.ok(!packB.workingSet.some((f) => f.relativePath === 'appA.py'));

    // Formatted prompt contains verified hashes
    const promptText = packBuilder.formatContextPrompt(packA);
    assert.ok(promptText.includes('--- ACTIVE WORKING SET ---'));
    assert.ok(promptText.includes('appA.py'));
    assert.ok(promptText.includes('sha256:'));
  } finally {
    try {
      fs.rmSync(tempDirA, { recursive: true, force: true });
      fs.rmSync(tempDirB, { recursive: true, force: true });
    } catch {}
  }
});
