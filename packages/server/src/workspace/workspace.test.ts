import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { WorkspaceService } from './workspace-service.js';
import { StorageEngine } from '../storage/storage-engine.js';
import { PathTraversalError, WorkspaceError } from '@nexus/core';

function setupTestWorkspace() {
  const tempDir = path.join(os.tmpdir(), `nexus_ws_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(tempDir, { recursive: true });

  // Create workspace file structure
  // root/
  //   README.md
  //   src/
  //     index.ts
  //     utils/
  //       helper.ts
  //   assets/
  //     logo.png
  //   node_modules/
  //     ignored.js
  const srcDir = path.join(tempDir, 'src');
  const utilsDir = path.join(srcDir, 'utils');
  const assetsDir = path.join(tempDir, 'assets');
  const nodeModulesDir = path.join(tempDir, 'node_modules');

  fs.mkdirSync(srcDir, { recursive: true });
  fs.mkdirSync(utilsDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.mkdirSync(nodeModulesDir, { recursive: true });

  fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test Project\nWelcome to Nexus AI test workspace.\n');
  fs.writeFileSync(path.join(srcDir, 'index.ts'), 'export const greeting = "Hello World";\nconsole.log(greeting);\n');
  fs.writeFileSync(path.join(utilsDir, 'helper.ts'), 'export function add(a: number, b: number) {\n  return a + b;\n}\n');
  // Binary file dummy
  fs.writeFileSync(path.join(assetsDir, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  fs.writeFileSync(path.join(nodeModulesDir, 'ignored.js'), 'console.log("should be ignored");\n');

  const storageDir = path.join(tempDir, '.nexus_test_data');
  const storage = new StorageEngine(storageDir);
  const service = new WorkspaceService(storage);

  return {
    workspaceDir: tempDir,
    service,
    cleanup: () => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    },
  };
}

test('WorkspaceService - openWorkspace registers valid directory', () => {
  const { workspaceDir, service, cleanup } = setupTestWorkspace();
  try {
    const ws = service.openWorkspace(workspaceDir);
    assert.ok(ws.id.startsWith('ws_'));
    assert.equal(ws.path, path.resolve(workspaceDir));

    const recents = service.getRecentWorkspaces();
    assert.equal(recents.length, 1);
    assert.equal(recents[0].path, ws.path);
  } finally {
    cleanup();
  }
});

test('WorkspaceService - openWorkspace rejects non-existent directory', () => {
  const { service, cleanup } = setupTestWorkspace();
  try {
    assert.throws(
      () => service.openWorkspace('C:/non_existent_folder_xyz_12345'),
      (err: unknown) => err instanceof WorkspaceError && (err as WorkspaceError).code === 'WORKSPACE_NOT_FOUND'
    );
  } finally {
    cleanup();
  }
});

test('WorkspaceService - getFileTree generates correct tree and ignores node_modules', () => {
  const { workspaceDir, service, cleanup } = setupTestWorkspace();
  try {
    const tree = service.getFileTree(workspaceDir);
    assert.equal(tree.isDirectory, true);
    assert.ok(tree.children);

    const childNames = tree.children.map((c) => c.name);
    assert.ok(childNames.includes('README.md'));
    assert.ok(childNames.includes('src'));
    assert.ok(childNames.includes('assets'));
    assert.ok(!childNames.includes('node_modules')); // Ignored!

    const srcNode = tree.children.find((c) => c.name === 'src');
    assert.ok(srcNode?.isDirectory);
    const srcChildNames = srcNode.children?.map((c) => c.name);
    assert.ok(srcChildNames?.includes('index.ts'));
    assert.ok(srcChildNames?.includes('utils'));
  } finally {
    cleanup();
  }
});

test('WorkspaceService - getFileMetadata returns complete file information', () => {
  const { workspaceDir, service, cleanup } = setupTestWorkspace();
  try {
    const meta = service.getFileMetadata(workspaceDir, 'src/index.ts');
    assert.equal(meta.name, 'index.ts');
    assert.equal(meta.extension, '.ts');
    assert.equal(meta.isDirectory, false);
    assert.equal(meta.isBinary, false);
    assert.ok(meta.sizeBytes > 0);

    const binaryMeta = service.getFileMetadata(workspaceDir, 'assets/logo.png');
    assert.equal(binaryMeta.name, 'logo.png');
    assert.equal(binaryMeta.isBinary, true);
  } finally {
    cleanup();
  }
});

test('WorkspaceService - readFileContent reads normal and nested text files', () => {
  const { workspaceDir, service, cleanup } = setupTestWorkspace();
  try {
    // Normal root file
    const rootFile = service.readFileContent(workspaceDir, 'README.md');
    assert.ok(rootFile.content.includes('# Test Project'));
    assert.equal(rootFile.startLine, 1);

    // Nested path file
    const nestedFile = service.readFileContent(workspaceDir, 'src/utils/helper.ts');
    assert.ok(nestedFile.content.includes('function add'));

    // Sliced line reading
    const sliced = service.readFileContent(workspaceDir, 'src/index.ts', 2, 2);
    assert.equal(sliced.content, 'console.log(greeting);');
    assert.equal(sliced.startLine, 2);
    assert.equal(sliced.endLine, 2);
  } finally {
    cleanup();
  }
});

test('WorkspaceService - security: blocks traversal and unauthorized paths', () => {
  const { workspaceDir, service, cleanup } = setupTestWorkspace();
  try {
    // Relative traversal escape
    assert.throws(
      () => service.readFileContent(workspaceDir, '../outside_secret.env'),
      (err: unknown) => err instanceof PathTraversalError
    );

    assert.throws(
      () => service.readFileContent(workspaceDir, '../../../../windows/system32/cmd.exe'),
      (err: unknown) => err instanceof PathTraversalError
    );

    // Absolute path escape
    assert.throws(
      () => service.readFileContent(workspaceDir, 'C:/another_unauthorized_dir/secret.key'),
      (err: unknown) => err instanceof PathTraversalError
    );
  } finally {
    cleanup();
  }
});

test('WorkspaceService - handles missing and binary files gracefully', () => {
  const { workspaceDir, service, cleanup } = setupTestWorkspace();
  try {
    // Missing file
    assert.throws(
      () => service.readFileContent(workspaceDir, 'src/missing.ts'),
      (err: unknown) => err instanceof WorkspaceError
    );

    // Binary file rejection
    assert.throws(
      () => service.readFileContent(workspaceDir, 'assets/logo.png'),
      (err: unknown) => err instanceof WorkspaceError && (err as WorkspaceError).message.includes('binary')
    );
  } finally {
    cleanup();
  }
});

test('WorkspaceService - searchFiles locates matches accurately across workspace', () => {
  const { workspaceDir, service, cleanup } = setupTestWorkspace();
  try {
    const searchRes = service.searchFiles(workspaceDir, 'Hello World');
    assert.equal(searchRes.totalMatches, 1);
    assert.equal(searchRes.matches[0].filePath, 'src/index.ts');
    assert.equal(searchRes.matches[0].lineNumber, 1);
    assert.ok(searchRes.matches[0].lineContent.includes('Hello World'));

    // Pattern filtering
    const tsOnly = service.searchFiles(workspaceDir, 'export', '.ts');
    assert.equal(tsOnly.totalMatches, 2);

    // Should not search inside node_modules
    const ignoredSearch = service.searchFiles(workspaceDir, 'should be ignored');
    assert.equal(ignoredSearch.totalMatches, 0);
  } finally {
    cleanup();
  }
});
