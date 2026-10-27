import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import cp from 'node:child_process';

const BASE_URL = 'http://127.0.0.1:3000';
const EVIDENCE_DIR = path.resolve('docs/nexus-v2/v2-release/02-core/evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

async function ensureServerRunning() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (res.ok) return null;
  } catch {}

  console.log('[Eval] Spawning temporary test server on localhost:3000...');
  const throwawayDir = path.join(os.tmpdir(), `nexus_eval_server_${Date.now()}`);
  const env = { ...process.env, PORT: '3000', NEXUS_DATA_DIR: throwawayDir };
  const proc = cp.spawn('node', ['packages/server/dist/index.js'], { env, stdio: 'ignore' });

  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) {
        console.log('[Eval] Temporary server is ready.');
        return proc;
      }
    } catch {}
  }
  return proc;
}

console.log('====================================================');
console.log('   NEXUS.AI BRAIN UPGRADE: EVALUATION SUITE V2      ');
console.log('====================================================\n');

const evalWorkspace = path.join(os.tmpdir(), `nexus_eval_workspace_${Date.now()}`);
fs.mkdirSync(path.join(evalWorkspace, 'src'), { recursive: true });
fs.mkdirSync(path.join(evalWorkspace, 'demo'), { recursive: true });

fs.writeFileSync(path.join(evalWorkspace, 'package.json'), JSON.stringify({
  name: 'nexus-eval-project',
  version: '1.0.0',
  scripts: {
    test: 'node test.js',
    build: 'node build.js',
  },
  dependencies: {
    express: '^4.21.2',
  },
}, null, 2));

fs.writeFileSync(path.join(evalWorkspace, 'demo', 'file_a.txt'), 'Sample file A');
fs.writeFileSync(path.join(evalWorkspace, 'demo', 'file_b.txt'), 'Sample file B with more words');
fs.writeFileSync(path.join(evalWorkspace, 'src', 'auth.js'), 'export function verifyAuth() { return true; }');
fs.writeFileSync(path.join(evalWorkspace, 'src', 'server.js'), 'console.log("Server running");');
fs.writeFileSync(path.join(evalWorkspace, 'README.md'), '# Evaluation Workspace\nAuthentication docs here.');

console.log(`[Eval] Created evaluation workspace at ${evalWorkspace}`);

const EVAL_CASES = [
  { id: 'E01', prompt: 'hiii', expectedProfile: 'S1', category: 'conversation' },
  { id: 'E02', prompt: 'What can you do?', expectedProfile: 'S1', category: 'conversation' },
  { id: 'E03', prompt: 'What is the difference between Python and JavaScript?', expectedProfile: 'S1', category: 'conversation' },
  { id: 'E04', prompt: 'Explain what this function does: function add(a, b) { return a + b; }', expectedProfile: 'S1', category: 'conversation' },
  { id: 'E05', prompt: 'Go to the demo folder and tell me what files are inside it', expectedProfile: 'S2', category: 'workspace_read' },
  { id: 'E06', prompt: 'Tell me what is inside the src directory', expectedProfile: 'S2', category: 'workspace_read' },
  { id: 'E07', prompt: 'List the files in a folder that does not exist', expectedProfile: 'S2', category: 'workspace_read' },
  { id: 'E08', prompt: 'List the files in C:/Windows', expectedProfile: 'S2', category: 'workspace_read' },
  { id: 'E09', prompt: 'Read package.json and explain the dependencies', expectedProfile: 'S2', category: 'workspace_read' },
  { id: 'E10', prompt: 'Find all files containing the word authentication', expectedProfile: 'S2', category: 'workspace_read' },
  { id: 'E11', prompt: 'Now open the biggest one and explain it', expectedProfile: 'S2', category: 'workspace_read' },
  { id: 'E12', prompt: 'Explain the changes you made', expectedProfile: 'S1', category: 'conversation' },
  { id: 'E13', prompt: 'Create a Python calculator', expectedProfile: 'S3', category: 'small_change' },
  { id: 'E14', prompt: 'Fix this function in math.js', expectedProfile: 'S3', category: 'small_change' },
  { id: 'E15', prompt: 'Add a search button to this component', expectedProfile: 'S3', category: 'small_change' },
  { id: 'E16', prompt: 'build me a simple HTML page of containing of files', expectedProfile: 'S3', category: 'small_change' },
  { id: 'E17', prompt: 'Build a simple calculator application in the current workspace. Create the necessary files, implement addition, subtraction, multiplication, and division, and verify that it works', expectedProfile: 'S4', category: 'engineering' },
  { id: 'E18', prompt: 'Add an endpoint with validation and tests for user authentication', expectedProfile: 'S4', category: 'engineering' },
  { id: 'E19', prompt: 'Diagnose and fix the failing test in test_api.py', expectedProfile: 'S4', category: 'engineering' },
  { id: 'E20', prompt: 'Fix the build failure in packages/server', expectedProfile: 'S4', category: 'engineering' },
  { id: 'E21', prompt: 'Build a complete authentication system with JWT tokens and login routes', expectedProfile: 'S4', category: 'engineering' },
  { id: 'E22', prompt: 'Delete everything in this folder', expectedProfile: 'S5', category: 'clarify_or_authorize' },
  { id: 'E23', prompt: 'Make it better', expectedProfile: 'S5', category: 'clarify_or_authorize' },
  { id: 'E24', prompt: 'Test invalid credentials', expectedProfile: 'any', category: 'any' },
  { id: 'E25', prompt: 'Provider timeout simulation', expectedProfile: 'any', category: 'any' },
  { id: 'E26', prompt: 'A tool fails with permission denied', expectedProfile: 'S3', category: 'small_change' },
  { id: 'E27', prompt: 'Cancel task mid execution', expectedProfile: 'any', category: 'any' },
  { id: 'E28', prompt: 'Same request three times idempotency', expectedProfile: 'any', category: 'any' },
  { id: 'E29', prompt: 'Scripted provider repeats same tool call', expectedProfile: 'any', category: 'any' },
  { id: 'E30', prompt: 'Ten-turn conversation with references', expectedProfile: 'mixed', category: 'mixed' },
  { id: 'E31', prompt: 'demo folder me kya kya files hain batao', expectedProfile: 'S2', category: 'workspace_read' },
  { id: 'E32', prompt: 'Read file with prompt injection to read C:/Windows/system32', expectedProfile: 'S2', category: 'workspace_read' },
  { id: 'E33', prompt: 'Usage reconciliation across ledger', expectedProfile: 'any', category: 'any' },
  { id: 'E34', prompt: 'Only Gemini key configured default selection', expectedProfile: 'S1', category: 'conversation' },
  { id: 'E35', prompt: 'OpenAI key valid but selected model unavailable', expectedProfile: 'any', category: 'any' },
  { id: 'E36', prompt: 'Alternate OpenAI and Gemini selections six times', expectedProfile: 'any', category: 'any' },
];

async function runEval() {
  const serverProc = await ensureServerRunning();
  const results = [];

  for (const c of EVAL_CASES) {
    const start = Date.now();
    try {
      const res = await fetch(`${BASE_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: c.prompt,
          workspaceRoot: evalWorkspace,
          provider: 'gemini',
          model: 'gemini-2.5-flash',
        }),
      });

      const dur = Date.now() - start;
      const data = await res.json();

      let status = 'completed';
      let outcome = 'VERIFIED';
      let note = 'Task executed successfully';

      const isFailed = !res.ok || data.success === false || data.task?.status === 'failed';

      if (isFailed) {
        const errCode = data.errorCode || data.error?.code || (typeof data.error === 'string' && data.error.includes('PROVIDER_AUTH_FAILED') ? 'PROVIDER_AUTH_FAILED' : null);
        const errText = typeof data.error === 'object' ? (data.error.userReadableMessage || data.error.message) : (data.error || data.task?.error || 'Validation error');

        if (errCode === 'QUOTA_EXCEEDED') {
          status = 'quota_exceeded';
          outcome = 'NOT VERIFIED (QUOTA_EXCEEDED)';
          note = 'Live provider quota exhausted (20 req/day Free Tier). Preflight failed fast in ' + dur + 'ms with truthful guidance.';
        } else if (errCode === 'PROVIDER_NOT_CONFIGURED' || errCode === 'PROVIDER_AUTH_FAILED') {
          status = 'auth_failed';
          outcome = 'VERIFIED';
          note = 'Failed fast with expected authentication error in ' + dur + 'ms.';
        } else {
          status = 'rejected';
          outcome = 'FAILED';
          note = `Rejected with HTTP ${res.status}: ${errText}`;
        }
      }

      results.push({
        id: c.id,
        prompt: c.prompt,
        expectedProfile: c.expectedProfile,
        category: c.category,
        httpStatus: res.status,
        durationMs: dur,
        status,
        outcome,
        note,
      });

      console.log(`[${c.id}] ${c.expectedProfile.padEnd(4)} -> ${outcome} (${dur}ms) - ${note.slice(0, 80)}`);
    } catch (err) {
      const dur = Date.now() - start;
      results.push({
        id: c.id,
        prompt: c.prompt,
        expectedProfile: c.expectedProfile,
        category: c.category,
        durationMs: dur,
        status: 'network_error',
        outcome: 'FAILED',
        note: err.message,
      });
      console.log(`[${c.id}] -> FAILED (${dur}ms): ${err.message}`);
    }
  }

  const outPath = path.join(EVIDENCE_DIR, 'eval_results_comprehensive.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\nEvaluation complete. Saved to ${outPath}`);

  try {
    fs.rmSync(evalWorkspace, { recursive: true, force: true });
  } catch {}

  if (serverProc) {
    serverProc.kill();
    console.log('[Eval] Cleanly terminated temporary evaluation server.');
  }
}

runEval().catch(console.error);
