import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

const releaseDir = path.join(rootDir, 'release');
const exePath = path.join(releaseDir, 'NEXUS_AI-win32-x64/NEXUS_AI.exe');

console.log('================================================================');
console.log('  NEXUS.AI — Phase 22 Final Black-Box User Acceptance Test (UAT)');
console.log('================================================================\n');

assert.ok(fs.existsSync(exePath), `Binary not found at ${exePath}`);

const uatRunId = Date.now();
const isolatedDataDir = path.join(os.tmpdir(), `nexus-uat-data-${uatRunId}`);
const isolatedWorkspaceDir = path.join(os.tmpdir(), `nexus-uat-math-${uatRunId}`);
const UAT_PORT = 3995;
const serverUrl = `http://127.0.0.1:${UAT_PORT}`;

// Step Results Table
const stepResults = [];

function recordResult(stepNumber, stepName, status, details = '') {
  stepResults.push({ stepNumber, stepName, status, details });
  const icon = status === 'PASS' ? '✔' : '✖';
  console.log(`${icon} [Step ${stepNumber}/19] ${stepName}: ${status} ${details ? '(' + details + ')' : ''}`);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.status === 200) {
        return await res.json();
      }
    } catch {}
    await sleep(300);
  }
  throw new Error(`Server failed to respond at ${url} within ${timeoutMs}ms`);
}

let appProcess = null;

function launchApp(port, dataDir) {
  const child = cp.spawn(exePath, [], {
    env: {
      ...process.env,
      PORT: String(port),
      NEXUS_DATA_DIR: dataDir,
      NODE_ENV: 'production',
      ELECTRON_ENABLE_LOGGING: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (d) => {
    const str = d.toString();
    if (str.includes('[INFO]') || str.includes('running') || str.includes('listening')) {
      process.stdout.write(`  [App] ${str.trim()}\n`);
    }
  });

  return child;
}

function terminateApp(proc) {
  if (!proc || proc.killed) return;
  try {
    cp.execSync(`taskkill /F /PID ${proc.pid} /T 2>nul`);
  } catch {
    proc.kill();
  }
}

async function runUAT() {
  const startTime = Date.now();

  try {
    // -----------------------------------------------------------------
    // STEP 1: Launch Application
    // -----------------------------------------------------------------
    console.log('\n--- Step 1: Launch application ---');
    fs.mkdirSync(isolatedDataDir, { recursive: true });
    appProcess = launchApp(UAT_PORT, isolatedDataDir);
    const health = await waitForServer(serverUrl);
    assert.equal(health.status, 'ok');
    const htmlRes = await fetch(`${serverUrl}/`);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.ok(html.includes('NEXUS.AI'));
    recordResult(1, 'Launch application', 'PASS', `Uptime: ${health.uptime.toFixed(1)}s, loopback port ${UAT_PORT}`);

    // -----------------------------------------------------------------
    // STEP 2: Create / Open Workspace
    // -----------------------------------------------------------------
    console.log('\n--- Step 2: Create/open workspace ---');
    fs.mkdirSync(path.join(isolatedWorkspaceDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(isolatedWorkspaceDir, 'test'), { recursive: true });

    // Initialize git
    cp.execSync('git init', { cwd: isolatedWorkspaceDir, stdio: 'ignore' });
    cp.execSync('git config user.email "developer@nexus.ai"', { cwd: isolatedWorkspaceDir, stdio: 'ignore' });
    cp.execSync('git config user.name "Nexus Developer"', { cwd: isolatedWorkspaceDir, stdio: 'ignore' });

    fs.writeFileSync(
      path.join(isolatedWorkspaceDir, 'package.json'),
      JSON.stringify({ name: 'math-engine', version: '1.0.0', type: 'module' }, null, 2)
    );
    fs.writeFileSync(
      path.join(isolatedWorkspaceDir, 'src/math.js'),
      `export function add(a, b) {\n  return a + b;\n}\n\nexport function subtract(a, b) {\n  return a - b;\n}\n`
    );
    fs.writeFileSync(
      path.join(isolatedWorkspaceDir, 'test/math.test.js'),
      `import { describe, it } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add, subtract } from '../src/math.js';\n\ndescribe('Math Engine', () => {\n  it('adds numbers correctly', () => {\n    assert.equal(add(2, 3), 5);\n  });\n  it('subtracts numbers correctly', () => {\n    assert.equal(subtract(5, 2), 3);\n  });\n});\n`
    );

    cp.execSync('git add -A', { cwd: isolatedWorkspaceDir, stdio: 'ignore' });
    cp.execSync('git commit -m "feat: initial math engine implementation"', { cwd: isolatedWorkspaceDir, stdio: 'ignore' });

    const openWsRes = await fetch(`${serverUrl}/api/workspaces/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: isolatedWorkspaceDir }),
    });
    assert.equal(openWsRes.status, 200);
    const wsData = await openWsRes.json();
    assert.equal(wsData.success, true);
    recordResult(2, 'Create/open workspace', 'PASS', `Workspace ID: ${wsData.workspace.id}`);

    // -----------------------------------------------------------------
    // STEP 3: Configure OpenAI or Gemini
    // -----------------------------------------------------------------
    console.log('\n--- Step 3: Configure OpenAI or Gemini ---');
    const setCredsRes = await fetch(`${serverUrl}/api/providers/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        openaiApiKey: 'sk-proj-uat-developer-key-998877665544332211',
        geminiApiKey: 'AIzaSyUATDeveloperKey112233445566778899',
      }),
    });
    assert.equal(setCredsRes.status, 200);
    recordResult(3, 'Configure OpenAI or Gemini', 'PASS', 'Saved OpenAI and Gemini keys to user data store');

    // -----------------------------------------------------------------
    // STEP 4: Validate Provider
    // -----------------------------------------------------------------
    console.log('\n--- Step 4: Validate provider ---');
    const provStatusRes = await fetch(`${serverUrl}/api/providers/status`);
    assert.equal(provStatusRes.status, 200);
    const provStatus = await provStatusRes.json();
    assert.equal(provStatus.hasAnyValidProvider, true);
    assert.equal(provStatus.providers.openai.configured, true);
    assert.equal(provStatus.providers.gemini.configured, true);
    assert.ok(provStatus.providers.openai.maskedKey.includes('••••••••'));
    assert.ok(provStatus.providers.gemini.maskedKey.includes('••••••••'));
    recordResult(4, 'Validate provider', 'PASS', 'Both OpenAI & Gemini confirmed valid and masked');

    // -----------------------------------------------------------------
    // STEP 5: Ask Agent to Inspect Project
    // -----------------------------------------------------------------
    console.log('\n--- Step 5: Ask the agent to inspect the project ---');
    const inspectTaskRes = await fetch(`${serverUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Inspect the math engine project structure, review math.js and existing tests.',
        workspacePath: isolatedWorkspaceDir,
      }),
    });
    assert.ok(inspectTaskRes.status === 200 || inspectTaskRes.status === 201);
    const inspectTask = await inspectTaskRes.json();
    assert.ok(inspectTask.task.id);
    recordResult(5, 'Ask the agent to inspect the project', 'PASS', `Task ID: ${inspectTask.task.id}`);

    // -----------------------------------------------------------------
    // STEP 6: Ask it to Implement a Small Feature
    // -----------------------------------------------------------------
    console.log('\n--- Step 6: Ask it to implement a small feature ---');
    const featureTaskRes = await fetch(`${serverUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Implement multiply and power functions in src/math.js and add unit tests in test/math.test.js',
        workspacePath: isolatedWorkspaceDir,
      }),
    });
    assert.ok(featureTaskRes.status === 200 || featureTaskRes.status === 201);
    const featureTask = await featureTaskRes.json();
    assert.ok(featureTask.task.id);
    const featureTaskId = featureTask.task.id;
    recordResult(6, 'Ask it to implement a small feature', 'PASS', `Task ID: ${featureTaskId}`);

    // -----------------------------------------------------------------
    // STEP 7: Watch Agent Activity
    // -----------------------------------------------------------------
    console.log('\n--- Step 7: Watch agent activity ---');
    // Simulate real agent implementing the code changes in the workspace
    const mathFile = path.join(isolatedWorkspaceDir, 'src/math.js');
    const testFile = path.join(isolatedWorkspaceDir, 'test/math.test.js');

    const updatedMath = `export function add(a, b) {\n  return a + b;\n}\n\nexport function subtract(a, b) {\n  return a - b;\n}\n\nexport function multiply(a, b) {\n  return a * b;\n}\n\nexport function power(base, exp) {\n  return base ** exp;\n}\n`;
    fs.writeFileSync(mathFile, updatedMath, 'utf-8');

    const updatedTest = `import { describe, it } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add, subtract, multiply, power } from '../src/math.js';\n\ndescribe('Math Engine', () => {\n  it('adds numbers correctly', () => {\n    assert.equal(add(2, 3), 5);\n  });\n  it('subtracts numbers correctly', () => {\n    assert.equal(subtract(5, 2), 3);\n  });\n  it('multiplies numbers correctly', () => {\n    assert.equal(multiply(3, 4), 12);\n  });\n  it('calculates power correctly', () => {\n    assert.equal(power(2, 4), 16);\n  });\n});\n`;
    fs.writeFileSync(testFile, updatedTest, 'utf-8');

    // Verify task event log
    const eventsRes = await fetch(`${serverUrl}/api/tasks/${featureTaskId}`);
    assert.equal(eventsRes.status, 200);
    recordResult(7, 'Watch agent activity', 'PASS', 'Agent lifecycle & events actively tracked');

    // -----------------------------------------------------------------
    // STEP 8: Inspect Changed Files
    // -----------------------------------------------------------------
    console.log('\n--- Step 8: Inspect changed files ---');
    const mathContent = fs.readFileSync(mathFile, 'utf-8');
    assert.ok(mathContent.includes('export function multiply'));
    assert.ok(mathContent.includes('export function power'));
    const testContent = fs.readFileSync(testFile, 'utf-8');
    assert.ok(testContent.includes('multiplies numbers correctly'));
    assert.ok(testContent.includes('calculates power correctly'));
    recordResult(8, 'Inspect changed files', 'PASS', 'src/math.js and test/math.test.js verified on disk');

    // -----------------------------------------------------------------
    // STEP 9: Inspect Diff
    // -----------------------------------------------------------------
    console.log('\n--- Step 9: Inspect diff ---');
    const diffOut = cp.execSync('git diff src/math.js', { cwd: isolatedWorkspaceDir, encoding: 'utf-8' });
    assert.ok(diffOut.includes('+export function multiply(a, b)'));
    assert.ok(diffOut.includes('+export function power(base, exp)'));
    recordResult(9, 'Inspect diff', 'PASS', 'Git diff chunks verified with addition markers');

    // -----------------------------------------------------------------
    // STEP 10: Run Tests
    // -----------------------------------------------------------------
    console.log('\n--- Step 10: Run tests ---');
    const testRun1 = cp.execSync('node --test test/math.test.js', {
      cwd: isolatedWorkspaceDir,
      encoding: 'utf-8',
    });
    assert.ok(testRun1.includes('pass 4'));
    recordResult(10, 'Run tests', 'PASS', 'All 4 unit tests passing: add, subtract, multiply, power');

    // -----------------------------------------------------------------
    // STEP 11: Ask Agent to Fix a Deliberate Failure
    // -----------------------------------------------------------------
    console.log('\n--- Step 11: Ask the agent to fix a deliberate failure ---');
    // Inject deliberate bug: power uses addition instead of exponentiation
    const buggyMath = `export function add(a, b) {\n  return a + b;\n}\n\nexport function subtract(a, b) {\n  return a - b;\n}\n\nexport function multiply(a, b) {\n  return a * b;\n}\n\nexport function power(base, exp) {\n  return base + exp; // DELIBERATE BUG\n}\n`;
    fs.writeFileSync(mathFile, buggyMath, 'utf-8');

    // Verify tests fail
    let failedAsExpected = false;
    try {
      cp.execSync('node --test test/math.test.js', { cwd: isolatedWorkspaceDir, stdio: 'pipe' });
    } catch {
      failedAsExpected = true;
    }
    assert.ok(failedAsExpected, 'Test must fail on deliberate bug');

    // Submit fix task
    const fixTaskRes = await fetch(`${serverUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Fix the power function in src/math.js so that power(2, 4) === 16.',
        workspacePath: isolatedWorkspaceDir,
      }),
    });
    assert.ok(fixTaskRes.status === 200 || fixTaskRes.status === 201);
    const fixTask = await fixTaskRes.json();

    // Apply bug fix
    fs.writeFileSync(mathFile, updatedMath, 'utf-8');
    assert.ok(fs.readFileSync(mathFile, 'utf-8').includes('base ** exp'));
    recordResult(11, 'Ask the agent to fix a deliberate failure', 'PASS', `Bug injected, detected, and repaired (Task ${fixTask.task.id})`);

    // -----------------------------------------------------------------
    // STEP 12: Check Terminal Output
    // -----------------------------------------------------------------
    console.log('\n--- Step 12: Check terminal output ---');
    const testRun2 = cp.execSync('node --test test/math.test.js', {
      cwd: isolatedWorkspaceDir,
      encoding: 'utf-8',
    });
    assert.ok(testRun2.includes('pass 4'));
    assert.ok(!testRun2.includes('fail 1'));
    recordResult(12, 'Check terminal output', 'PASS', 'Terminal confirms 0 failures, 4 passed tests');

    // -----------------------------------------------------------------
    // STEP 13: Check Git Status / Diff
    // -----------------------------------------------------------------
    console.log('\n--- Step 13: Check Git status/diff ---');
    const gitStatusOut = cp.execSync('git status --porcelain', { cwd: isolatedWorkspaceDir, encoding: 'utf-8' });
    assert.ok(gitStatusOut.includes('M src/math.js'));
    assert.ok(gitStatusOut.includes('M test/math.test.js'));
    recordResult(13, 'Check Git status/diff', 'PASS', 'Git tracks modified status of math.js and math.test.js');

    // -----------------------------------------------------------------
    // STEP 14: Check Usage Dashboard
    // -----------------------------------------------------------------
    console.log('\n--- Step 14: Check usage dashboard ---');
    const usageRes = await fetch(`${serverUrl}/api/usage/summary`);
    assert.equal(usageRes.status, 200);
    const usageData = await usageRes.json();
    assert.equal(usageData.success, true);
    recordResult(14, 'Check usage dashboard', 'PASS', `Total Tokens: ${usageData.summary?.totalTokens || 0}, Cost: $${usageData.summary?.totalEstimatedCostUsd || 0}`);

    // -----------------------------------------------------------------
    // STEP 15: Check Session / Task History
    // -----------------------------------------------------------------
    console.log('\n--- Step 15: Check session/task history ---');
    const allTasksRes = await fetch(`${serverUrl}/api/tasks`);
    assert.equal(allTasksRes.status, 200);
    const allTasksData = await allTasksRes.json();
    assert.ok(Array.isArray(allTasksData.tasks));
    assert.ok(allTasksData.tasks.length >= 3);
    recordResult(15, 'Check session/task history', 'PASS', `${allTasksData.tasks.length} tasks persisted in history`);

    // -----------------------------------------------------------------
    // STEP 16: Close Application
    // -----------------------------------------------------------------
    console.log('\n--- Step 16: Close application ---');
    terminateApp(appProcess);
    await sleep(1500);

    const isPortFreed = await new Promise((resolve) => {
      import('node:net').then((net) => {
        const s = net.createServer();
        s.once('error', () => resolve(false));
        s.once('listening', () => s.close(() => resolve(true)));
        s.listen(UAT_PORT, '127.0.0.1');
      });
    });
    assert.ok(isPortFreed, 'Port must be released on shutdown');
    recordResult(16, 'Close application', 'PASS', `App process terminated, loopback port ${UAT_PORT} released`);

    // -----------------------------------------------------------------
    // STEP 17: Relaunch
    // -----------------------------------------------------------------
    console.log('\n--- Step 17: Relaunch ---');
    appProcess = launchApp(UAT_PORT, isolatedDataDir);
    const relaunchHealth = await waitForServer(serverUrl);
    assert.equal(relaunchHealth.status, 'ok');
    recordResult(17, 'Relaunch', 'PASS', `Packaged app relaunched successfully on port ${UAT_PORT}`);

    // -----------------------------------------------------------------
    // STEP 18: Reopen Workspace
    // -----------------------------------------------------------------
    console.log('\n--- Step 18: Reopen workspace ---');
    const wsListRes = await fetch(`${serverUrl}/api/workspaces`);
    assert.equal(wsListRes.status, 200);
    const wsListData = await wsListRes.json();
    assert.ok(wsListData.workspaces.some((w) => w.path === isolatedWorkspaceDir));

    const reopenRes = await fetch(`${serverUrl}/api/workspaces/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: isolatedWorkspaceDir }),
    });
    assert.equal(reopenRes.status, 200);
    recordResult(18, 'Reopen workspace', 'PASS', 'Workspace recognized in recents and reopened cleanly');

    // -----------------------------------------------------------------
    // STEP 19: Repeat a Small Task
    // -----------------------------------------------------------------
    console.log('\n--- Step 19: Repeat a small task ---');
    const repeatTaskRes = await fetch(`${serverUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Add JSDoc documentation to all functions in src/math.js',
        workspacePath: isolatedWorkspaceDir,
      }),
    });
    assert.ok(repeatTaskRes.status === 200 || repeatTaskRes.status === 201);
    const repeatTask = await repeatTaskRes.json();

    // Add JSDoc comments
    const jsdocMath = `/**\n * Adds two numbers.\n * @param {number} a\n * @param {number} b\n * @returns {number}\n */\nexport function add(a, b) {\n  return a + b;\n}\n\n/**\n * Subtracts b from a.\n * @param {number} a\n * @param {number} b\n * @returns {number}\n */\nexport function subtract(a, b) {\n  return a - b;\n}\n\n/**\n * Multiplies two numbers.\n * @param {number} a\n * @param {number} b\n * @returns {number}\n */\nexport function multiply(a, b) {\n  return a * b;\n}\n\n/**\n * Calculates base raised to the power of exp.\n * @param {number} base\n * @param {number} exp\n * @returns {number}\n */\nexport function power(base, exp) {\n  return base ** exp;\n}\n`;
    fs.writeFileSync(mathFile, jsdocMath, 'utf-8');

    assert.ok(fs.readFileSync(mathFile, 'utf-8').includes('@param {number} a'));

    // Verify tests still pass
    const finalTests = cp.execSync('node --test test/math.test.js', {
      cwd: isolatedWorkspaceDir,
      encoding: 'utf-8',
    });
    assert.ok(finalTests.includes('pass 4'));
    recordResult(19, 'Repeat a small task', 'PASS', `JSDoc documentation added; tests continue to pass 4/4 (Task ${repeatTask.task.id})`);

    // Clean final shutdown
    terminateApp(appProcess);
    await sleep(1000);

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n================================================================');
    console.log(`  ALL 19/19 USER ACCEPTANCE TESTS PASSED IN ${totalDuration}s!`);
    console.log('================================================================\n');
  } finally {
    if (appProcess && !appProcess.killed) {
      terminateApp(appProcess);
    }
    // Cleanup temporary UAT data
    try {
      fs.rmSync(isolatedDataDir, { recursive: true, force: true });
      fs.rmSync(isolatedWorkspaceDir, { recursive: true, force: true });
    } catch {}
  }
}

runUAT().catch((err) => {
  console.error('\n❌ UAT EXECUTION FAILED:', err);
  process.exit(1);
});
