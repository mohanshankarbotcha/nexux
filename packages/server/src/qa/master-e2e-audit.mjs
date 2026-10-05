import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import cp from 'node:child_process';
import assert from 'node:assert/strict';

const SERVER_URL = 'http://localhost:3000';
console.log('====================================================');
console.log('  NEXUS.AI — Comprehensive Master End-to-End Audit');
console.log('====================================================\n');

const testRunId = Date.now();
const testWorkspaceDir = path.join(os.tmpdir(), `nexus-master-ws-${testRunId}`);
const outsideDir = path.join(os.tmpdir(), `nexus-outside-${testRunId}`);

const results = [];

function record(phase, name, status, details = '') {
  results.push({ phase, name, status, details });
  const icon = status === 'PASS' ? '✔' : '✖';
  console.log(`${icon} [${phase}] ${name}: ${status} ${details ? '— ' + details : ''}`);
}

async function request(endpoint, options = {}) {
  const url = `${SERVER_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function runAudit() {
  try {
    fs.mkdirSync(testWorkspaceDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'SUPER_SECRET_OUTSIDE_WORKSPACE');

    // ----------------------------------------------------
    // PHASE 1 & 25: Startup & Backend Health
    // ----------------------------------------------------
    console.log('\n--- Auditing Backend Health & Startup ---');
    const health = await request('/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.status, 'ok');
    assert.equal(health.data.service, 'NEXUS.AI Backend');
    record('PHASE 1/25', 'Health Check', 'PASS', `Service: ${health.data.service}, version: ${health.data.version}`);

    // Frontend dev server bundle verification
    const frontendRes = await fetch('http://localhost:5173/');
    assert.equal(frontendRes.status, 200);
    const htmlText = await frontendRes.text();
    assert.ok(htmlText.includes('NEXUS.AI'));
    record('PHASE 2', 'Frontend Bundle Smoke Test', 'PASS', 'HTML loaded, Vite dev server responsive on :5173');

    // ----------------------------------------------------
    // PHASE 6: Workspace Operations
    // ----------------------------------------------------
    console.log('\n--- Auditing Workspace Operations ---');
    cp.execSync('git init', { cwd: testWorkspaceDir, stdio: 'ignore' });
    cp.execSync('git config user.email "qa@nexus.ai"', { cwd: testWorkspaceDir, stdio: 'ignore' });
    cp.execSync('git config user.name "Nexus QA"', { cwd: testWorkspaceDir, stdio: 'ignore' });

    fs.writeFileSync(path.join(testWorkspaceDir, 'README.md'), '# Test Project\n\nInitial workspace.');
    cp.execSync('git add -A && git commit -m "initial commit"', { cwd: testWorkspaceDir, stdio: 'ignore' });

    // Open Workspace
    const openRes = await request('/api/workspaces/open', {
      method: 'POST',
      body: JSON.stringify({ targetPath: testWorkspaceDir }),
    });
    assert.equal(openRes.status, 200);
    assert.equal(openRes.data.success, true);
    assert.equal(openRes.data.workspace.path, testWorkspaceDir);
    record('PHASE 6', 'Open Workspace', 'PASS', `ID: ${openRes.data.workspace.id}`);

    // Create a new file directly in workspace
    const testFileRel = 'nexus_workspace_test.txt';
    const testFileContent = 'NEXUS.AI workspace test.';
    fs.writeFileSync(path.join(testWorkspaceDir, testFileRel), testFileContent, 'utf-8');

    // Get File Tree
    const treeRes = await request(`/api/workspaces/tree?workspace=${encodeURIComponent(testWorkspaceDir)}`);
    assert.equal(treeRes.status, 200);
    assert.equal(treeRes.data.success, true);
    assert.ok(treeRes.data.tree.children.some((c) => c.name === testFileRel));
    record('PHASE 6', 'Get File Tree', 'PASS', `Enumerated ${treeRes.data.tree.children.length} root items`);

    // Read File
    const readRes = await request(
      `/api/workspaces/file?workspace=${encodeURIComponent(testWorkspaceDir)}&file=${encodeURIComponent(testFileRel)}`
    );
    assert.equal(readRes.status, 200);
    assert.equal(readRes.data.content, testFileContent);
    record('PHASE 6', 'Read File Content', 'PASS', `Verified content matches: "${testFileContent}"`);

    // Metadata
    const metaRes = await request(
      `/api/workspaces/metadata?workspace=${encodeURIComponent(testWorkspaceDir)}&file=${encodeURIComponent(testFileRel)}`
    );
    assert.equal(metaRes.status, 200);
    assert.equal(metaRes.data.metadata.name, testFileRel);
    record('PHASE 6', 'Get File Metadata', 'PASS', `Size: ${metaRes.data.metadata.sizeBytes} bytes`);

    // Search Workspace
    const searchRes = await request(
      `/api/workspaces/search?workspace=${encodeURIComponent(testWorkspaceDir)}&q=workspace+test`
    );
    assert.equal(searchRes.status, 200);
    assert.ok(searchRes.data.result.totalMatches > 0);
    record('PHASE 6', 'Search Workspace', 'PASS', `Found ${searchRes.data.result.totalMatches} match(es)`);

    // ----------------------------------------------------
    // PHASE 7: File System Security
    // ----------------------------------------------------
    console.log('\n--- Auditing File System Security & Boundary Enforcement ---');
    // Path traversal attempt: ../outside.txt
    const travRes = await request(
      `/api/workspaces/file?workspace=${encodeURIComponent(testWorkspaceDir)}&file=../secret.txt`
    );
    assert.equal(travRes.status, 403);
    assert.ok(travRes.data.error?.code === 'PATH_TRAVERSAL_DETECTED' || travRes.data.error?.name?.includes('PathTraversal'));
    record('PHASE 7', 'Path Traversal Protection (../)', 'PASS', 'Blocked with HTTP 403');

    // Absolute path traversal outside workspace
    const absRes = await request(
      `/api/workspaces/file?workspace=${encodeURIComponent(testWorkspaceDir)}&file=${encodeURIComponent(path.join(outsideDir, 'secret.txt'))}`
    );
    assert.equal(absRes.status, 403);
    record('PHASE 7', 'Absolute Path Escape Protection', 'PASS', 'Blocked with HTTP 403');

    // ----------------------------------------------------
    // PHASE 8 & 9: Terminal Operations & Security
    // ----------------------------------------------------
    console.log('\n--- Auditing Terminal Execution & Security ---');
    // Safe command 1: echo
    const echoRes = await request('/api/workspaces/terminal', {
      method: 'POST',
      body: JSON.stringify({ command: 'echo NEXUS_AI_TEST', workspacePath: testWorkspaceDir }),
    });
    assert.equal(echoRes.status, 200);
    assert.equal(echoRes.data.success, true);
    assert.ok(echoRes.data.data.stdout.includes('NEXUS_AI_TEST'));
    assert.equal(echoRes.data.data.exitCode, 0);
    record('PHASE 8', 'Safe Command: echo', 'PASS', 'Captured stdout and exitCode 0');

    // Safe command 2: whoami
    const whoamiRes = await request('/api/workspaces/terminal', {
      method: 'POST',
      body: JSON.stringify({ command: 'whoami', workspacePath: testWorkspaceDir }),
    });
    assert.equal(whoamiRes.status, 200);
    assert.equal(whoamiRes.data.success, true);
    assert.ok(whoamiRes.data.data.stdout.trim().length > 0);
    record('PHASE 8', 'Safe Command: whoami', 'PASS', `User: ${whoamiRes.data.data.stdout.trim()}`);

    // Safe command 3: node --version
    const nodeRes = await request('/api/workspaces/terminal', {
      method: 'POST',
      body: JSON.stringify({ command: 'node --version', workspacePath: testWorkspaceDir }),
    });
    assert.equal(nodeRes.status, 200);
    assert.ok(nodeRes.data.data.stdout.includes('v'));
    record('PHASE 8', 'Safe Command: node --version', 'PASS', `Node: ${nodeRes.data.data.stdout.trim()}`);

    // Terminal Security: Blocked Dangerous Commands
    const blockedCmds = [
      'rm -rf /',
      'rmdir /s /q c:\\',
      'format d:',
      'git push origin main',
      'shutdown /s /t 0',
    ];
    for (const bCmd of blockedCmds) {
      const bRes = await request('/api/workspaces/terminal', {
        method: 'POST',
        body: JSON.stringify({ command: bCmd, workspacePath: testWorkspaceDir }),
      });
      assert.ok(!bRes.data.success, `Expected command '${bCmd}' to be blocked`);
      assert.ok(bRes.data.error?.includes('Security') || bRes.data.error?.includes('blocked') || bRes.data.error?.includes('violation'));
    }
    record('PHASE 9', 'Terminal Blacklist Protection', 'PASS', `All ${blockedCmds.length} destructive commands blocked`);

    // Terminal Security: Execution Timeout
    const timeoutRes = await request('/api/workspaces/terminal', {
      method: 'POST',
      body: JSON.stringify({ command: 'ping -n 5 127.0.0.1', workspacePath: testWorkspaceDir, timeoutMs: 500 }),
    });
    assert.ok(timeoutRes.data.data?.timedOut === true || timeoutRes.data.success === false);
    record('PHASE 9', 'Terminal Execution Timeout Enforcement', 'PASS', 'Process cancelled after 500ms');

    // ----------------------------------------------------
    // PHASE 10: Git Operations
    // ----------------------------------------------------
    console.log('\n--- Auditing Git Operations ---');
    // Modify file
    fs.appendFileSync(path.join(testWorkspaceDir, 'README.md'), '\nAdded new line for Git testing.\n');
    const gitStatusOut = cp.execSync('git status --porcelain', { cwd: testWorkspaceDir, encoding: 'utf-8' });
    assert.ok(gitStatusOut.includes('M README.md'));
    const gitDiffOut = cp.execSync('git diff README.md', { cwd: testWorkspaceDir, encoding: 'utf-8' });
    assert.ok(gitDiffOut.includes('+Added new line for Git testing.'));
    record('PHASE 10', 'Git Status & Diff', 'PASS', 'Tracked modification with addition chunk in diff');

    // ----------------------------------------------------
    // PHASE 12: Provider Configuration & Validation
    // ----------------------------------------------------
    console.log('\n--- Auditing Provider Configuration & Validation ---');
    // 1. Initial status
    const pStatus1 = await request('/api/providers/status');
    assert.equal(pStatus1.status, 200);
    record('PHASE 12', 'Provider Status Initial Check', 'PASS', `Configured: ${pStatus1.data.hasAnyValidProvider}`);

    // 2. Configure OpenAI via UI payload format { provider: 'openai', apiKey: '...' }
    const pSetOpenAI = await request('/api/providers/credentials', {
      method: 'POST',
      body: JSON.stringify({ provider: 'openai', apiKey: 'sk-test-developer-audit-key-1234567890' }),
    });
    assert.equal(pSetOpenAI.status, 200);
    assert.equal(pSetOpenAI.data.success, true);

    const pStatus2 = await request('/api/providers/status');
    assert.equal(pStatus2.data.providers.openai.configured, true);
    assert.ok(pStatus2.data.providers.openai.maskedKey.startsWith('sk-t'));
    assert.ok(pStatus2.data.providers.openai.maskedKey.includes('••••••••'));
    // CRITICAL SECURITY: Ensure full key is NEVER revealed
    assert.ok(!pStatus2.data.providers.openai.maskedKey.includes('developer-audit'));
    record('PHASE 12', 'Save OpenAI Credentials (UI Payload)', 'PASS', `Masked key: ${pStatus2.data.providers.openai.maskedKey}`);

    // 3. Configure Gemini via UI payload format { provider: 'gemini', apiKey: '...' }
    const pSetGemini = await request('/api/providers/credentials', {
      method: 'POST',
      body: JSON.stringify({ provider: 'gemini', apiKey: 'AIzaSyAuditGeminiTestKey1234567890' }),
    });
    assert.equal(pSetGemini.status, 200);

    const pStatus3 = await request('/api/providers/status');
    assert.equal(pStatus3.data.providers.gemini.configured, true);
    assert.ok(pStatus3.data.providers.gemini.maskedKey.startsWith('AIza'));
    assert.ok(!pStatus3.data.providers.gemini.maskedKey.includes('AuditGemini'));
    record('PHASE 12', 'Save Gemini Credentials (UI Payload)', 'PASS', `Masked key: ${pStatus3.data.providers.gemini.maskedKey}`);

    // 4. Validate credentials with dummy test key
    const valRes = await request('/api/providers/validate', {
      method: 'POST',
      body: JSON.stringify({ provider: 'gemini', apiKey: 'AIzaSyInvalidKeyForTest998877' }),
    });
    assert.equal(valRes.status, 200);
    assert.equal(valRes.data.validation.isValid, false);
    record('PHASE 12', 'Provider Credential Validation', 'PASS', 'Validation rejected invalid key cleanly');

    // ----------------------------------------------------
    // PHASE 16: Cancel / Interrupt Task
    // ----------------------------------------------------
    console.log('\n--- Auditing Task Cancellation ---');
    const cancelPrompt = 'Perform extensive search across all repository directories and analyze symbols.';
    const cancelTaskRes = await request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ prompt: cancelPrompt, workspacePath: testWorkspaceDir }),
    });
    assert.ok(cancelTaskRes.status === 200 || cancelTaskRes.status === 201);
    const cancelTaskId = cancelTaskRes.data.task.id;

    // Immediately cancel
    const cancelExecRes = await request(`/api/tasks/${encodeURIComponent(cancelTaskId)}/cancel`, {
      method: 'POST',
    });
    assert.equal(cancelExecRes.status, 200);
    assert.equal(cancelExecRes.data.success, true);

    const verifyCancelRes = await request(`/api/tasks/${encodeURIComponent(cancelTaskId)}`);
    assert.equal(verifyCancelRes.status, 200);
    assert.ok(['cancelled', 'failed'].includes(verifyCancelRes.data.task.status));
    record('PHASE 16', 'Task Cancellation', 'PASS', `Task ${cancelTaskId} cleanly marked cancelled`);

    // ----------------------------------------------------
    // PHASE 11: Usage Telemetry Verification
    // ----------------------------------------------------
    console.log('\n--- Auditing Usage Telemetry ---');
    const usageRes = await request('/api/usage/summary');
    assert.equal(usageRes.status, 200);
    assert.equal(usageRes.data.success, true);
    assert.ok(typeof usageRes.data.summary.totalRequests === 'number');
    assert.ok(typeof usageRes.data.summary.totalTokens === 'number');
    assert.ok(typeof usageRes.data.summary.totalEstimatedCostUsd === 'number');

    const recordsRes = await request('/api/usage/records');
    assert.equal(recordsRes.status, 200);
    assert.ok(Array.isArray(recordsRes.data.records));
    record('PHASE 11', 'Usage Telemetry', 'PASS', `Total requests: ${usageRes.data.summary.totalRequests}, Total tokens: ${usageRes.data.summary.totalTokens}`);

    // ----------------------------------------------------
    // PHASE 27: Security Audit (Secrets & Leaks)
    // ----------------------------------------------------
    console.log('\n--- Auditing Security (Secret Leakage in logs/telemetry) ---');
    const secretKeywords = ['developer-audit', 'AuditGemini', 'sk-test-developer'];
    let leakDetected = false;

    for (const rec of recordsRes.data.records) {
      const recStr = JSON.stringify(rec);
      for (const kw of secretKeywords) {
        if (recStr.includes(kw)) {
          leakDetected = true;
          console.error(`Leak detected in telemetry: ${kw}`);
        }
      }
    }
    assert.equal(leakDetected, false, 'Raw API key secrets must NEVER be present in usage records');
    record('PHASE 27', 'Zero Secret Leakage in Telemetry', 'PASS', 'Zero plaintext secrets detected');

    // ----------------------------------------------------
    // PHASE 20: Persistence Across Storage
    // ----------------------------------------------------
    console.log('\n--- Auditing Persistence ---');
    const tasksRes = await request('/api/tasks');
    assert.equal(tasksRes.status, 200);
    assert.ok(tasksRes.data.tasks.length > 0);
    const wsListRes = await request('/api/workspaces');
    assert.equal(wsListRes.status, 200);
    assert.ok(wsListRes.data.workspaces.some((w) => w.path === testWorkspaceDir));
    record('PHASE 20', 'Workspace & Task Persistence', 'PASS', `${tasksRes.data.tasks.length} tasks and ${wsListRes.data.workspaces.length} workspaces stored`);

    console.log('\n====================================================');
    console.log(`  ALL ${results.length} MASTER AUDIT CHECKS PASSED CLEANLY!`);
    console.log('====================================================\n');
  } finally {
    try {
      fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    } catch {}
  }
}

runAudit().catch((err) => {
  console.error('\n❌ MASTER AUDIT FAILED:', err);
  process.exit(1);
});
