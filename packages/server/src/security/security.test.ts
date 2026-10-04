import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  resolveSafePath,
  PathTraversalError,
  SecurityViolationError,
  sanitizeString,
  sanitizeObject,
} from '@nexus/core';
import { TerminalTool } from '../tools/terminal.js';
import { DeleteFileTool } from '../tools/delete-file.js';
import { ReadFileTool } from '../tools/read-file.js';
import { WriteFileTool } from '../tools/write-file.js';

function setupSecurityTestWorkspace() {
  const uniqueId = `nexus_sec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const tempDir = path.join(os.tmpdir(), uniqueId);
  const outsideDir = path.join(os.tmpdir(), `${uniqueId}_outside`);

  fs.mkdirSync(tempDir, { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });

  fs.writeFileSync(path.join(tempDir, 'safe.txt'), 'Safe file inside workspace');
  fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'CONFIDENTIAL_DATA_OUTSIDE');

  // Create mock .git directory
  const gitDir = path.join(tempDir, '.git');
  fs.mkdirSync(gitDir, { recursive: true });
  fs.writeFileSync(path.join(gitDir, 'config'), '[core]\nrepositoryformatversion = 0\n');

  const cleanup = () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
    try {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    } catch {}
  };

  return { tempDir, outsideDir, cleanup };
}

function createMockSecurityContext(workspaceRoot: string) {
  return {
    workspaceRoot,
    sessionId: 'sec_session',
    taskId: 'sec_task',
    agentRole: 'coder',
  };
}

test('Security Suite / Path Traversal & Boundary Protection', async (t) => {
  await t.test('rejects parent traversal escapes via ../', () => {
    const { tempDir, cleanup } = setupSecurityTestWorkspace();
    try {
      assert.throws(
        () => resolveSafePath(tempDir, '../outside.txt'),
        PathTraversalError
      );
      assert.throws(
        () => resolveSafePath(tempDir, 'sub/../../outside.txt'),
        PathTraversalError
      );
    } finally {
      cleanup();
    }
  });

  await t.test('rejects null byte injection in paths', () => {
    const { tempDir, cleanup } = setupSecurityTestWorkspace();
    try {
      assert.throws(
        () => resolveSafePath(tempDir, 'safe.txt\0.exe'),
        SecurityViolationError
      );
    } finally {
      cleanup();
    }
  });

  await t.test('rejects symlink / junction traversal pointing outside workspace', () => {
    const { tempDir, outsideDir, cleanup } = setupSecurityTestWorkspace();
    try {
      const linkPath = path.join(tempDir, 'external_link');
      // Create junction or symlink
      try {
        fs.symlinkSync(outsideDir, linkPath, 'junction');
      } catch {
        // If junction not supported, fallback to directory symlink
        fs.symlinkSync(outsideDir, linkPath, 'dir');
      }

      // Resolving target through link to outside file must fail
      assert.throws(
        () => resolveSafePath(tempDir, 'external_link/secret.txt'),
        PathTraversalError
      );

      // ReadFileTool must also fail through symlink
      const readTool = new ReadFileTool();
      const ctx = createMockSecurityContext(tempDir);

      // Tool handles error gracefully and returns success: false
      return readTool.execute({ filePath: 'external_link/secret.txt' }, ctx).then((res) => {
        assert.equal(res.success, false);
        assert.ok(res.error?.includes('outside workspace boundary'));
      });
    } finally {
      cleanup();
    }
  });
});

test('Security Suite / Terminal Execution & Dangerous Commands', async (t) => {
  const { tempDir, cleanup } = setupSecurityTestWorkspace();
  const terminalTool = new TerminalTool();
  const ctx = createMockSecurityContext(tempDir);

  try {
    await t.test('rejects remote git push operations', async () => {
      const res1 = await terminalTool.execute({ command: 'git push origin main' }, ctx);
      assert.equal(res1.success, false);
      assert.ok(res1.error?.includes('Remote Git push operations are restricted'));

      const res2 = await terminalTool.execute({ command: 'git   push --force' }, ctx);
      assert.equal(res2.success, false);
      assert.ok(res2.error?.includes('Remote Git push operations are restricted'));
    });

    await t.test('rejects destructive wipe and reboot commands', async () => {
      const wipe1 = await terminalTool.execute({ command: 'rm -rf /' }, ctx);
      assert.equal(wipe1.success, false);
      assert.ok(wipe1.error?.includes('prohibited'));

      const wipe2 = await terminalTool.execute({ command: 'del /s /q c:\\' }, ctx);
      assert.equal(wipe2.success, false);
      assert.ok(wipe2.error?.includes('prohibited'));

      const reboot = await terminalTool.execute({ command: 'shutdown -r -t 0' }, ctx);
      assert.equal(reboot.success, false);
      assert.ok(reboot.error?.includes('prohibited'));
    });

    await t.test('sanitizes environment variables to prevent API key leakage', async () => {
      // Temporarily inject dummy keys into process.env
      const prevOpenAI = process.env.OPENAI_API_KEY;
      const prevGemini = process.env.GEMINI_API_KEY;
      const prevSecret = process.env.INTERNAL_SUPER_SECRET;

      process.env.OPENAI_API_KEY = 'sk-mock-secret-key-1234567890abcdef';
      process.env.GEMINI_API_KEY = 'AIzaSyMockSecretKey9876543210abcdef';
      process.env.INTERNAL_SUPER_SECRET = 'super-secret-password-xyz';

      try {
        const isWindows = process.platform === 'win32';
        const cmd = isWindows ? 'set' : 'env';
        const res = await terminalTool.execute({ command: cmd }, ctx);

        assert.equal(res.success, true);
        const output = res.data?.stdout || '';

        // Verify keys do not appear in environment output
        assert.equal(output.includes('sk-mock-secret-key-1234567890abcdef'), false);
        assert.equal(output.includes('AIzaSyMockSecretKey9876543210abcdef'), false);
        assert.equal(output.includes('super-secret-password-xyz'), false);
      } finally {
        if (prevOpenAI) process.env.OPENAI_API_KEY = prevOpenAI; else delete process.env.OPENAI_API_KEY;
        if (prevGemini) process.env.GEMINI_API_KEY = prevGemini; else delete process.env.GEMINI_API_KEY;
        if (prevSecret) process.env.INTERNAL_SUPER_SECRET = prevSecret; else delete process.env.INTERNAL_SUPER_SECRET;
      }
    });
  } finally {
    cleanup();
  }
});

test('Security Suite / File System Protection & Git Guard', async (t) => {
  const { tempDir, cleanup } = setupSecurityTestWorkspace();
  const deleteTool = new DeleteFileTool();
  const ctx = createMockSecurityContext(tempDir);

  try {
    await t.test('blocks deletion of workspace root', async () => {
      const res = await deleteTool.execute({ filePath: '.' }, ctx);
      assert.equal(res.success, false);
      assert.ok(res.error?.includes('Refusing to delete the workspace root'));
    });

    await t.test('blocks deletion of .git folder and its files', async () => {
      const resDir = await deleteTool.execute({ filePath: '.git' }, ctx);
      assert.equal(resDir.success, false);
      assert.ok(resDir.error?.includes('Refusing to delete .git directory'));

      const resFile = await deleteTool.execute({ filePath: '.git/config' }, ctx);
      assert.equal(resFile.success, false);
      assert.ok(resFile.error?.includes('Refusing to delete .git directory'));
    });
  } finally {
    cleanup();
  }
});

test('Security Suite / Secret Redaction & Sanitization', () => {
  // OpenAI key
  const maskedOpenAI = sanitizeString('Failed with key sk-proj-1234567890abcdef1234567890 in request');
  assert.ok(!maskedOpenAI.includes('1234567890abcdef1234567890'));
  assert.ok(maskedOpenAI.includes('[REDACTED]'));

  // Google key
  const maskedGoogle = sanitizeString('AIzaSyD0123456789012345678901234567890 key error');
  assert.ok(!maskedGoogle.includes('SyD0123456789012345678901234567890'));
  assert.ok(maskedGoogle.includes('[REDACTED]'));

  // GitHub token
  const maskedGH = sanitizeString('Token ghp_123456789012345678901234567890123456 used');
  assert.ok(!maskedGH.includes('ghp_123456789012345678901234567890123456'));
  assert.ok(maskedGH.includes('[REDACTED]'));

  // Object deep sanitization
  const sensitiveObj = {
    apiKey: 'super-secret-api-key-string-long',
    nested: {
      password: 'mypassword12345',
      user: 'alice',
    },
  };
  const sanitized = sanitizeObject(sensitiveObj) as any;
  assert.notEqual(sanitized.apiKey, 'super-secret-api-key-string-long');
  assert.ok(sanitized.apiKey.includes('[REDACTED]'));
  assert.ok(sanitized.nested.password.includes('[REDACTED]'));
  assert.equal(sanitized.nested.user, 'alice');
});
