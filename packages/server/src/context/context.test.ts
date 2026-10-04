import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { ContextEngine } from './context-engine.js';
import { WorkspaceService } from '../workspace/workspace-service.js';
import { StorageEngine } from '../storage/storage-engine.js';

function setupContextTestWorkspace() {
  const tempDir = path.join(os.tmpdir(), `nexus_ctx_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const srcDir = path.join(tempDir, 'src');
  const assetsDir = path.join(tempDir, 'assets');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  fs.writeFileSync(path.join(tempDir, 'README.md'), '# Architecture Guidelines\nAlways use TypeScript strict mode.\n');
  fs.writeFileSync(
    path.join(srcDir, 'auth.ts'),
    'export function verifyToken(token: string) {\n  // Token expiration logic\n  return token.length > 10;\n}\n'
  );
  fs.writeFileSync(
    path.join(srcDir, 'billing.ts'),
    'export function computeInvoice(amount: number) {\n  return amount * 1.2;\n}\n'
  );
  fs.writeFileSync(
    path.join(srcDir, 'unrelated_crypto.ts'),
    'export function calculateSha256(data: string) {\n  return "hash";\n}\n'
  );
  // Binary asset
  fs.writeFileSync(path.join(assetsDir, 'banner.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const storage = new StorageEngine(path.join(tempDir, '.nexus_data'));
  const workspaceService = new WorkspaceService(storage);
  const engine = new ContextEngine(workspaceService);

  return {
    tempDir,
    engine,
    cleanup: () => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    },
  };
}

test('ContextEngine - extracts domain keywords and strips stop words', () => {
  const engine = new ContextEngine();
  const keywords = engine.extractKeywords('Please update the token expiration logic and fix auth');
  assert.ok(keywords.includes('token'));
  assert.ok(keywords.includes('expiration'));
  assert.ok(keywords.includes('auth'));
  assert.ok(!keywords.includes('the'));
  assert.ok(!keywords.includes('please'));
  assert.ok(!keywords.includes('update'));
});

test('ContextEngine - selects relevant files and excludes irrelevant files', async () => {
  const { tempDir, engine, cleanup } = setupContextTestWorkspace();
  try {
    const pkg = await engine.buildTaskContext(
      tempDir,
      'Fix token expiration in auth module',
      'sess-1',
      'task-1'
    );

    // README instructions must be preserved
    assert.ok(pkg.projectInstructions?.includes('Architecture Guidelines'));

    const includedRelPaths = pkg.items.map((i) => i.relativePath);
    assert.ok(includedRelPaths.includes('src/auth.ts'), 'auth.ts should be included');
    assert.ok(!includedRelPaths.includes('src/unrelated_crypto.ts'), 'unrelated_crypto.ts should be excluded');
    assert.ok(!includedRelPaths.includes('assets/banner.png'), 'binary files should be excluded');

    // Context size metrics must be present
    assert.ok(pkg.totalBytes > 0);
    assert.ok(pkg.totalEstimatedTokens > 0);
  } finally {
    cleanup();
  }
});

test('ContextEngine - prioritizes explicitly mentioned files', async () => {
  const { tempDir, engine, cleanup } = setupContextTestWorkspace();
  try {
    const pkg = await engine.buildTaskContext(
      tempDir,
      'Inspect src/billing.ts and calculate invoice amount',
      'sess-1',
      'task-2'
    );

    const billingItem = pkg.items.find((i) => i.relativePath === 'src/billing.ts');
    assert.ok(billingItem);
    assert.equal(billingItem.reason, 'explicit_mention');
    assert.equal(billingItem.score, 100);
  } finally {
    cleanup();
  }
});

test('ContextEngine - enforces byte and token budget caps', async () => {
  const { tempDir, engine, cleanup } = setupContextTestWorkspace();
  try {
    // Very tight budget: max 50 bytes
    const pkg = await engine.buildTaskContext(
      tempDir,
      'Inspect src/auth.ts and src/billing.ts',
      'sess-1',
      'task-3',
      { maxBytes: 80 }
    );

    // Only one file should fit, second should be omitted
    assert.equal(pkg.items.length, 1);
    assert.ok(pkg.omittedFiles.length > 0);
    assert.ok(pkg.totalBytes <= 80);
  } finally {
    cleanup();
  }
});
