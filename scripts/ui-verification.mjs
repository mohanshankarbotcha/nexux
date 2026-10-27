/**
 * ui-verification.mjs
 * NEXUS.AI V2 - Prompt 04 Stitch V2 UI Verification Suite
 *
 * Verifies:
 * 1. Zero external CDN URLs across client source and dist
 * 2. Zero forbidden sample strings across client source and dist
 * 3. Typography token definition & system font offline fallbacks
 * 4. Technical Precision palette compliance and border/hairline tokens
 * 5. 48px Left Rail and TopBar layout metrics
 * 6. Live API contract verification against ephemeral authenticated backend
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const clientSrcDir = path.join(rootDir, 'packages', 'client', 'src');
const clientDistDir = path.join(rootDir, 'packages', 'client', 'dist');
const evidenceDir = path.join(rootDir, 'docs', 'nexus-v2', 'v2-release', '04-ui', 'evidence');

fs.mkdirSync(evidenceDir, { recursive: true });

const FORBIDDEN_STRINGS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'cdn.tailwindcss.com',
  'NEX-4091',
  'feat/agent-mesh',
  '84,612,940',
  '14,280 / $0.021',
  '92.4% hit rate',
  '142 threads',
  'p95 192ms',
  'Topology v4.12',
  'gemini-1.5-pro-exp'
];

function collectFiles(dir, extensions) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(collectFiles(full, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

const checkResults = [];

function recordCheck(id, description, passed, details) {
  checkResults.push({ id, description, passed, details });
  const statusStr = passed ? 'PASS' : 'FAIL';
  console.log(`[${statusStr}] ${id}: ${description}`);
  if (!passed && details) {
    console.error(`       Details: ${details}`);
  }
}

async function run() {
  console.log('=== NEXUS.AI V2 - Stitch V2 UI Verification Suite ===\n');

  // 1. Scan client source files
  const srcFiles = collectFiles(clientSrcDir, ['.ts', '.tsx', '.css', '.html']);
  srcFiles.push(path.join(rootDir, 'packages', 'client', 'index.html'));
  let srcViolations = [];
  for (const file of srcFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const token of FORBIDDEN_STRINGS) {
      if (content.includes(token)) {
        srcViolations.push({ file: path.relative(rootDir, file), token });
      }
    }
  }
  recordCheck(
    'UI-01',
    'Client source files free of CDN links and forbidden sample data',
    srcViolations.length === 0,
    srcViolations.length ? JSON.stringify(srcViolations) : 'Zero violations found across source tree'
  );

  // 2. Scan client dist files
  const distFiles = collectFiles(clientDistDir, ['.js', '.css', '.html']);
  let distViolations = [];
  for (const file of distFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const token of FORBIDDEN_STRINGS) {
      if (content.includes(token)) {
        distViolations.push({ file: path.relative(rootDir, file), token });
      }
    }
  }
  recordCheck(
    'UI-02',
    'Client built bundle (dist/) free of CDN links and forbidden sample data',
    distViolations.length === 0,
    distViolations.length ? JSON.stringify(distViolations) : 'Zero violations found in production bundle'
  );

  // 3. Verify Design System Tokens in tailwind.config.js
  const tailwindCfgPath = path.join(rootDir, 'packages', 'client', 'tailwind.config.js');
  const tailwindContent = fs.existsSync(tailwindCfgPath) ? fs.readFileSync(tailwindCfgPath, 'utf8') : '';
  const hasCanvasToken = tailwindContent.includes('#121316') || tailwindContent.includes('#0D0E11');
  const hasPanelToken = tailwindContent.includes('#16181D');
  const hasHairlineToken = tailwindContent.includes('#2D313A');
  const hasPrimaryToken = tailwindContent.includes('#106EBE');
  const hasMintToken = tailwindContent.includes('#0FF0CB');

  recordCheck(
    'UI-03',
    'Tailwind configuration contains Technical Precision V2 color tokens',
    hasCanvasToken && hasPanelToken && hasHairlineToken && hasPrimaryToken && hasMintToken,
    'Canvas, Panel, Hairline, Primary, and Mint tokens configured'
  );

  // 4. Verify Typography System & Offline Fallbacks in index.css
  const indexCssPath = path.join(clientSrcDir, 'index.css');
  const indexCssContent = fs.existsSync(indexCssPath) ? fs.readFileSync(indexCssPath, 'utf8') : '';
  const hasDisplayVar = indexCssContent.includes('--font-display') && indexCssContent.includes('Times New Roman');
  const hasMonoVar = indexCssContent.includes('--font-mono') && indexCssContent.includes('Courier');

  recordCheck(
    'UI-04',
    'CSS variable typography tokens default to Times New Roman and Courier offline system fonts',
    hasDisplayVar && hasMonoVar,
    'Configured --font-display and --font-mono with offline Windows system fallbacks'
  );

  // 5. Verify 48px Left Rail and TopBar implementation
  const sidebarPath = path.join(clientSrcDir, 'components', 'layout', 'Sidebar.tsx');
  const sidebarContent = fs.existsSync(sidebarPath) ? fs.readFileSync(sidebarPath, 'utf8') : '';
  const has48pxRail = sidebarContent.includes('w-12') || sidebarContent.includes('48px') || sidebarContent.includes('w-[48px]');

  const topbarPath = path.join(clientSrcDir, 'components', 'layout', 'TopBar.tsx');
  const topbarContent = fs.existsSync(topbarPath) ? fs.readFileSync(topbarPath, 'utf8') : '';
  const has48pxTopBar = topbarContent.includes('h-12') || topbarContent.includes('48px') || topbarContent.includes('h-[48px]');

  recordCheck(
    'UI-05',
    'Left Rail and TopBar adhere to 48px density grid specifications',
    has48pxRail && has48pxTopBar,
    'Sidebar w-12 (48px) and TopBar h-12 (48px) verified'
  );

  // 6. Test Backend Contract Endpoints with authenticated request
  console.log('\nBooting temporary backend for live API contract verification...');
  const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ui-verify-'));
  process.env.NEXUS_DATA_DIR = testDataDir;

  const { createNexusApp } = await import(pathToFileURL(path.join(rootDir, 'packages', 'server', 'dist', 'api', 'app.js')).href);
  const { globalStorage } = await import(pathToFileURL(path.join(rootDir, 'packages', 'server', 'dist', 'storage', 'storage-engine.js')).href);
  const { getOrCreateApiToken } = await import(pathToFileURL(path.join(rootDir, 'packages', 'server', 'dist', 'security', 'auth-token.js')).href);

  globalStorage.setDataDir(testDataDir);
  const app = createNexusApp();
  const testPort = 3698;
  const token = getOrCreateApiToken();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(testPort, '127.0.0.1', resolve));

  async function apiGet(route) {
    const res = await fetch(`http://127.0.0.1:${testPort}${route}`, {
      headers: {
        'X-Nexus-Token': token
      }
    });
    return { status: res.status, data: await res.json() };
  }

  // Health
  const healthRes = await apiGet('/api/health');
  recordCheck(
    'UI-06',
    'Health endpoint returns operational status for TopBar indicator',
    healthRes.status === 200 && healthRes.data.status === 'ok',
    `Status: ${healthRes.status}, version: ${healthRes.data.version}`
  );

  // Providers
  const provRes = await apiGet('/api/providers/status');
  const providerDict = provRes.data?.providers || {};
  const hasGemini = Boolean(providerDict.gemini);
  const hasOpenai = Boolean(providerDict.openai);
  recordCheck(
    'UI-07',
    'Providers endpoint returns active provider status for Setup screen',
    provRes.status === 200 && hasGemini && hasOpenai,
    `Providers returned: gemini (${providerDict.gemini?.status}), openai (${providerDict.openai?.status})`
  );

  // Usage summary
  const usageRes = await apiGet('/api/usage/summary');
  recordCheck(
    'UI-08',
    'Usage summary endpoint provides real telemetry for Usage screen',
    usageRes.status === 200 && typeof usageRes.data.summary.totalTokens === 'number',
    `Initial totalTokens: ${usageRes.data.summary.totalTokens}`
  );

  // Clean shutdown
  await new Promise((resolve) => server.close(resolve));
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch {}

  console.log('\n=== Summary ===');
  const allPassed = checkResults.every(c => c.passed);
  console.log(`Total checks: ${checkResults.length}, Passed: ${checkResults.filter(c => c.passed).length}, Failed: ${checkResults.filter(c => !c.passed).length}`);

  // Write evidence file
  const evidenceOutput = {
    timestamp: new Date().toISOString(),
    verdict: allPassed ? 'PASSED' : 'FAILED',
    totalChecks: checkResults.length,
    results: checkResults,
    metrics: {
      clientSrcFilesScanned: srcFiles.length,
      clientDistFilesScanned: distFiles.length,
      forbiddenStringsChecked: FORBIDDEN_STRINGS.length,
    }
  };

  fs.writeFileSync(
    path.join(evidenceDir, '01_ui_verification_summary.json'),
    JSON.stringify(evidenceOutput, null, 2)
  );

  console.log(`Saved evidence to ${path.join(evidenceDir, '01_ui_verification_summary.json')}`);

  if (!allPassed) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error during UI verification:', err);
  process.exit(1);
});
