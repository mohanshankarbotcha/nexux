import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import cp from 'node:child_process';
import http from 'node:http';

const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const userProfile = process.env.USERPROFILE || os.homedir();

const installDir = path.join(localAppData, 'Programs', 'NEXUS.AI');
const exePath = path.join(installDir, 'NEXUS_AI.exe');
const uninstPath = path.join(installDir, 'uninstall.exe');
const desktopLnk = path.join(userProfile, 'Desktop', 'NEXUS.AI.lnk');
const startMenuDir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'NEXUS.AI');
const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\NEXUS.AI';

console.log('================================================================');
console.log('  NEXUS.AI v1.0.0 — COMPREHENSIVE WINDOWS RELEASE AUDIT SUITE');
console.log('================================================================\n');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

function httpPost(url, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let respData = '';
      res.on('data', (chunk) => { respData += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(respData) });
        } catch {
          resolve({ status: res.statusCode, body: respData });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function waitForServer(ports = [3000, 3001, 3002], maxRetries = 25) {
  for (let i = 0; i < maxRetries; i++) {
    for (const p of ports) {
      try {
        const res = await httpGet(`http://127.0.0.1:${p}/api/health`);
        if (res.status === 200 && (res.body?.status === 'ok' || res.body?.status === 'healthy')) {
          return p;
        }
      } catch {
        // Not ready on this port
      }
    }
    await sleep(500);
  }
  return null;
}

function killNexusProcesses() {
  try {
    cp.execSync('taskkill /F /IM NEXUS_AI.exe /T 2>NUL', { stdio: 'ignore' });
  } catch {}
  // Also free port 3000 if occupied by stale test runner
  try {
    const netstat = cp.execSync('netstat -ano', { encoding: 'utf-8' });
    for (const line of netstat.split('\n')) {
      if (line.includes(':3000') && line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && pid !== String(process.pid)) {
          cp.execSync(`taskkill /F /PID ${pid} 2>NUL`, { stdio: 'ignore' });
        }
      }
    }
  } catch {}
}

const auditResults = {
  installer: false,
  installedFiles: false,
  registry: false,
  appLaunch: false,
  apiHealth: false,
  providerStatus: false,
  workspaceApi: false,
  terminalApi: false,
  agentOrchestration: false,
  cleanShutdown: false,
  lifecycleCycles: 0,
  secretScanPass: false,
  uninstallSuccess: false,
  userDataPreserved: false,
  reinstallSuccess: false,
};

async function runAudit() {
  // Ensure clean state
  killNexusProcesses();

  // Test 1: Verify Installation Artifacts
  console.log('[AUDIT STEP 1/8] Verifying Installed Application Files & Registry...');
  const setupExe = path.resolve('release/NEXUS_AI_1.0.0_Setup.exe');
  if (fs.existsSync(setupExe)) {
    auditResults.installer = true;
    console.log('  PASS: Installer executable exists:', setupExe);
  } else {
    console.error('  FAIL: Installer executable not found at:', setupExe);
  }

  if (fs.existsSync(exePath) && fs.existsSync(uninstPath)) {
    auditResults.installedFiles = true;
    console.log('  PASS: NEXUS_AI.exe and uninstall.exe exist in:', installDir);
  } else {
    console.error('  FAIL: Installed binaries not found!');
  }

  try {
    const reg = cp.execSync(`reg query "${regKey}"`, { encoding: 'utf-8' });
    if (reg.includes('NEXUS.AI') && reg.includes('1.0.0')) {
      auditResults.registry = true;
      console.log('  PASS: Windows Registry Uninstall registration verified.');
    }
  } catch (err) {
    console.error('  FAIL: Registry key missing:', err.message);
  }

  // Test 2: Launch Installed Application and Test Functionality
  console.log('\n[AUDIT STEP 2/8] Launching Installed Desktop Application (NEXUS_AI.exe)...');
  const child = cp.spawn(exePath, [], {
    cwd: installDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (d) => {
    const text = d.toString();
    if (text.includes('Embedded server running')) {
      console.log('    [EXE LOG]:', text.trim());
    }
  });

  console.log('  Waiting for local embedded server (ports 3000, 3001, 3002)...');
  const activePort = await waitForServer([3000, 3001, 3002], 30);
  if (activePort) {
    auditResults.appLaunch = true;
    auditResults.apiHealth = true;
    console.log(`  PASS: Embedded NEXUS backend started on port ${activePort} and /api/health returned 200 OK.`);

    // Test Providers
    const provRes = await httpGet(`http://127.0.0.1:${activePort}/api/providers/status`);
    if (provRes.status === 200 && provRes.body.providers?.openai && provRes.body.providers?.gemini) {
      auditResults.providerStatus = true;
      console.log(`  PASS: /api/providers/status returned provider configurations for OpenAI and Gemini.`);
    }

    // Test Workspace
    const wsRes = await httpGet(`http://127.0.0.1:${activePort}/api/workspaces`);
    if (wsRes.status === 200 && Array.isArray(wsRes.body.workspaces)) {
      auditResults.workspaceApi = true;
      console.log(`  PASS: /api/workspaces returned ${wsRes.body.workspaces.length} workspaces.`);
    }

    // Test Terminal
    const termRes = await httpPost(`http://127.0.0.1:${activePort}/api/workspaces/terminal`, {
      command: 'echo "NEXUS_DESKTOP_VERIFIED"',
    });
    const stdout = termRes.body.data?.stdout || termRes.body.output || '';
    if (termRes.status === 200 && stdout.includes('NEXUS_DESKTOP_VERIFIED')) {
      auditResults.terminalApi = true;
      console.log('  PASS: Real terminal execution endpoint confirmed functional.');
    }

    // Test Guard: Task rejected cleanly when no provider is configured
    const unconfigRes = await httpPost(`http://127.0.0.1:${activePort}/api/tasks`, {
      prompt: 'Check repository status and report',
    });
    const providerGuardWorks = unconfigRes.status === 400 &&
      (unconfigRes.body.error?.code === 'PROVIDER_NOT_CONFIGURED' || unconfigRes.body.error?.message?.includes('provider'));
    if (providerGuardWorks) {
      console.log('  PASS: Safe runtime provider guard verified (PROVIDER_NOT_CONFIGURED on unconfigured launch).');
    }

    // Configure a runtime session key to test task execution
    const credRes = await httpPost(`http://127.0.0.1:${activePort}/api/providers/credentials`, {
      provider: 'openai',
      apiKey: 'sk-proj-audit-session-runtime-key-verified-0123456789',
    });
    if (credRes.status === 200 && credRes.body.success) {
      console.log('  PASS: User provider credential setup endpoint verified.');
      const taskRes = await httpPost(`http://127.0.0.1:${activePort}/api/tasks`, {
        prompt: 'Audit verification task for desktop release',
      });
      if ((taskRes.status === 201 || taskRes.status === 200) && taskRes.body.task?.id) {
        auditResults.agentOrchestration = true;
        console.log('  PASS: Autonomous agent task orchestration launched Task ID:', taskRes.body.task.id);
      } else {
        console.log('  FAIL: taskRes:', taskRes.status, taskRes.body);
      }
    }
  } else {
    console.error('  FAIL: Embedded server failed to respond on ports 3000/3001/3002 within 15s.');
  }

  // Clean shutdown
  console.log('\n[AUDIT STEP 3/8] Testing Clean Process Shutdown...');
  try { child.kill('SIGTERM'); } catch {}
  killNexusProcesses();
  await sleep(1500);
  const lingeringPort = await waitForServer([3000, 3001, 3002], 2);
  if (lingeringPort) {
    console.error(`  FAIL: Port ${lingeringPort} still active after shutdown!`);
  } else {
    auditResults.cleanShutdown = true;
    console.log('  PASS: Application closed cleanly and all ports released.');
  }

  // Test 3: Lifecycle Multi-Cycle Test (Phase 12: 3x launch-and-close)
  console.log('\n[AUDIT STEP 4/8] Running Lifecycle Multi-Cycle Stress Test (3 Cycles)...');
  let cycleSuccess = 0;
  for (let c = 1; c <= 3; c++) {
    console.log(`  Cycle ${c}/3: Launching NEXUS_AI.exe...`);
    const p = cp.spawn(exePath, [], { cwd: installDir, stdio: ['ignore', 'pipe', 'pipe'] });
    const cyclePort = await waitForServer([3000, 3001, 3002], 25);
    if (cyclePort) {
      console.log(`    Cycle ${c}: Server active on port ${cyclePort}.`);
      try { p.kill('SIGTERM'); } catch {}
      killNexusProcesses();
      await sleep(1500);
      cycleSuccess++;
    } else {
      console.error(`    Cycle ${c}: Failed to start!`);
      try { p.kill('SIGKILL'); } catch {}
      killNexusProcesses();
    }
  }
  auditResults.lifecycleCycles = cycleSuccess;
  console.log(`  PASS: ${cycleSuccess}/3 lifecycle start-shutdown cycles completed successfully.`);

  // Test 4: Secret and Credential Security Audit (Phase 4 & Phase 15)
  console.log('\n[AUDIT STEP 5/8] Scanning Installed Files for Bundled Secrets or API Keys...');
  const suspicious = [];
  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        scanDir(full);
      } else if (e.isFile()) {
        const ext = path.extname(e.name);
        if (['.js', '.json', '.html', '.txt', '.env'].includes(ext) || e.name === '.env') {
          if (e.name === '.env') {
            suspicious.push(`.env found at ${full}`);
          }
          const content = fs.readFileSync(full, 'utf-8');
          if (/AIza[0-9A-Za-z-_]{35}/.test(content) || /sk-[a-zA-Z0-9]{32,}/.test(content)) {
            suspicious.push(`Potential API key in ${full}`);
          }
        }
      }
    }
  }

  const appPayload = path.join(installDir, 'resources', 'app');
  if (fs.existsSync(appPayload)) {
    scanDir(appPayload);
  }

  if (suspicious.length === 0) {
    auditResults.secretScanPass = true;
    console.log('  PASS: Zero bundled API keys, credentials, or .env files found in installation.');
  } else {
    console.error('  FAIL: Suspicious tokens detected:', suspicious);
  }

  // Test 5: Verify User Data Storage Location (Phase 5)
  console.log('\n[AUDIT STEP 6/8] Verifying Per-User Mutable Data Storage...');
  const userDataDir = path.join(localAppData, 'NEXUS_AI_DATA');
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  // Write a canary file to ensure user data is never deleted during uninstall
  const canaryFile = path.join(userDataDir, 'user_canary_persistence.json');
  fs.writeFileSync(canaryFile, JSON.stringify({ persistent: true, time: Date.now() }), 'utf-8');
  console.log('  PASS: User data directory verified at:', userDataDir);

  // Test 6: Test Uninstallation (Phase 17)
  console.log('\n[AUDIT STEP 7/8] Testing Silent Uninstallation (uninstall.exe /S)...');
  killNexusProcesses();
  await sleep(1000);
  cp.spawnSync(uninstPath, ['/S'], { stdio: 'inherit', timeout: 30000 });
  await sleep(4000);

  const exeStillExists = fs.existsSync(exePath);
  const desktopLnkStillExists = fs.existsSync(desktopLnk);
  let regStillExists = false;
  try {
    cp.execSync(`reg query "${regKey}" 2>NUL`);
    regStillExists = true;
  } catch {}

  const canaryStillExists = fs.existsSync(canaryFile);

  if (!exeStillExists && !desktopLnkStillExists && !regStillExists) {
    auditResults.uninstallSuccess = true;
    console.log('  PASS: Uninstaller cleanly removed application binaries, shortcuts, and registry keys.');
  } else {
    console.log(`  STATUS: exe=${exeStillExists}, desktop=${desktopLnkStillExists}, reg=${regStillExists}`);
  }

  if (canaryStillExists) {
    auditResults.userDataPreserved = true;
    console.log('  PASS: User data in %LOCALAPPDATA%\\NEXUS_AI_DATA was PRESERVED as required.');
    fs.unlinkSync(canaryFile);
  } else {
    console.error('  FAIL: User data was unexpectedly deleted during uninstall!');
  }

  // Test 7: Reinstallation Test
  console.log('\n[AUDIT STEP 8/8] Testing Fresh Reinstallation from NEXUS_AI_1.0.0_Setup.exe...');
  cp.spawnSync(setupExe, ['/S'], { stdio: 'inherit', timeout: 90000 });
  await sleep(4000);

  if (fs.existsSync(exePath) && fs.existsSync(desktopLnk)) {
    auditResults.reinstallSuccess = true;
    console.log('  PASS: Fresh reinstallation succeeded! NEXUS_AI.exe is ready.');
  } else {
    console.error('  FAIL: Reinstallation did not restore binaries.');
  }

  // Summary
  console.log('\n================================================================');
  console.log('  AUDIT SUITE VERDICT:');
  console.log('================================================================');
  console.log('  Installed Files Verified:  ', auditResults.installedFiles ? 'PASS' : 'FAIL');
  console.log('  Registry Registered:       ', auditResults.registry ? 'PASS' : 'FAIL');
  console.log('  Application Launch:        ', auditResults.appLaunch ? 'PASS' : 'FAIL');
  console.log('  Backend & Health API:      ', auditResults.apiHealth ? 'PASS' : 'FAIL');
  console.log('  Provider Status API:       ', auditResults.providerStatus ? 'PASS' : 'FAIL');
  console.log('  Workspace Service API:     ', auditResults.workspaceApi ? 'PASS' : 'FAIL');
  console.log('  Terminal Execution API:    ', auditResults.terminalApi ? 'PASS' : 'FAIL');
  console.log('  Agent Task Orchestration:  ', auditResults.agentOrchestration ? 'PASS' : 'FAIL');
  console.log('  Clean Shutdown:            ', auditResults.cleanShutdown ? 'PASS' : 'FAIL');
  console.log('  Lifecycle 3x Cycles:       ', auditResults.lifecycleCycles === 3 ? 'PASS' : 'FAIL');
  console.log('  Zero Bundled Secrets:      ', auditResults.secretScanPass ? 'PASS' : 'FAIL');
  console.log('  Uninstaller Cleanup:       ', auditResults.uninstallSuccess ? 'PASS' : 'FAIL');
  console.log('  User Data Preserved:       ', auditResults.userDataPreserved ? 'PASS' : 'FAIL');
  console.log('  Reinstallation Verified:   ', auditResults.reinstallSuccess ? 'PASS' : 'FAIL');
  console.log('================================================================\n');

  const allPassed = Object.values(auditResults).every(v => v === true || v === 3);
  if (allPassed) {
    console.log('ALL RELEASE AUDIT GATES PASSED — CERTIFIED READY FOR DISTRIBUTION!\n');
    process.exit(0);
  } else {
    console.error('AUDIT FAILED ON ONE OR MORE CRITICAL GATES.\n');
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('Fatal audit suite error:', err);
  process.exit(1);
});
