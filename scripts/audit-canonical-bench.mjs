import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE_URL = 'http://127.0.0.1:3000';
const EVIDENCE_DIR = path.resolve('docs/nexus-v2/brain/01-audit/evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

// Setup a realistic 'demo' workspace
const demoWorkspace = path.join(os.tmpdir(), 'nexus_audit_demo_workspace');
fs.mkdirSync(path.join(demoWorkspace, 'src'), { recursive: true });
fs.writeFileSync(path.join(demoWorkspace, 'package.json'), JSON.stringify({
  name: 'audit-demo',
  version: '1.0.0',
  dependencies: {
    express: '^4.21.2',
    dotenv: '^16.4.7',
  },
  devDependencies: {
    jest: '^29.7.0',
  },
}, null, 2));
fs.writeFileSync(path.join(demoWorkspace, 'README.md'), '# Audit Demo\nThis is a sample project for measuring NEXUS agent execution.\nContains authentication modules and express routes.');
fs.writeFileSync(path.join(demoWorkspace, 'src/auth.js'), '// authentication service\nexport function verifyToken(token) {\n  if (!token) throw new Error("Invalid token");\n  return { user: "test_user" };\n}');
fs.writeFileSync(path.join(demoWorkspace, 'src/server.js'), '// main application server\nconst express = require("express");\nconst app = express();\napp.get("/login", (req, res) => res.json({ status: "authentication required" }));\n');
fs.writeFileSync(path.join(demoWorkspace, 'big_file.txt'), 'A'.repeat(50000)); // largest file for C8

console.log(`[Audit] Demo workspace prepared at ${demoWorkspace}`);

const CANONICAL_REQUESTS = [
  { id: 'C1', prompt: 'hiii' },
  { id: 'C2', prompt: 'What can you do?' },
  { id: 'C3', prompt: 'Go to the demo folder and tell me what files are inside it' },
  { id: 'C4', prompt: 'Read package.json and explain the dependencies' },
  { id: 'C5', prompt: 'Find all files containing the word authentication' },
  { id: 'C6', prompt: 'Create a Python calculator' },
  { id: 'C7', prompt: 'build me a simple HTML page of containing of files' },
  { id: 'C8', prompt: 'now open the biggest one and explain it', followUpAfter: 'C3' },
];

async function runTask(prompt, provider, model) {
  const start = Date.now();
  let firstProgressTime = null;
  let firstOutputTime = null;

  try {
    const createRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        provider,
        model,
        workspaceRoot: demoWorkspace,
      }),
    });

    const createData = await createRes.json();
    if (!createRes.ok || !createData.success) {
      return {
        status: 'failed',
        errorCode: createData.errorCode || 'HTTP_' + createRes.status,
        error: createData.error || 'Failed to create task',
        durationMs: Date.now() - start,
        firstProgressMs: Date.now() - start,
        firstOutputMs: Date.now() - start,
        modelCalls: 0,
        toolCalls: 0,
      };
    }

    const taskId = createData.task.id;
    firstProgressTime = Date.now();

    // Poll until completion or timeout (max 45s for audit benchmark)
    const deadline = Date.now() + 45000;
    let finalTask = createData.task;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 600));
      const pollRes = await fetch(`${BASE_URL}/api/tasks/${taskId}`);
      if (pollRes.ok) {
        const pollData = await pollRes.json();
        finalTask = pollData.task;
        if (!firstOutputTime && (finalTask.resultSummary || finalTask.events?.length > 1)) {
          firstOutputTime = Date.now();
        }
        if (finalTask.status === 'completed' || finalTask.status === 'failed') {
          break;
        }
      }
    }

    const timelineRes = await fetch(`${BASE_URL}/api/tasks/${taskId}/timeline`);
    const timelineData = timelineRes.ok ? await timelineRes.json() : null;

    const spans = timelineData?.timeline?.spans || [];
    const modelCalls = spans.filter((s) => s.type === 'model_request').length;
    const toolCalls = spans.filter((s) => s.type === 'tool').length;

    return {
      taskId,
      status: finalTask.status,
      durationMs: Date.now() - start,
      firstProgressMs: (firstProgressTime || Date.now()) - start,
      firstOutputMs: (firstOutputTime || Date.now()) - start,
      stage: finalTask.stage,
      summary: finalTask.resultSummary?.slice(0, 100),
      modelCalls,
      toolCalls,
      spans,
      changedFiles: finalTask.changedFiles || [],
    };
  } catch (err) {
    return {
      status: 'error',
      error: err.message,
      durationMs: Date.now() - start,
      firstProgressMs: Date.now() - start,
      firstOutputMs: Date.now() - start,
      modelCalls: 0,
      toolCalls: 0,
    };
  }
}

async function main() {
  console.log('[Audit] Starting canonical benchmark run across providers...');
  const providers = [
    { provider: 'gemini', model: 'gemini-2.5-flash' },
    { provider: 'openai', model: 'gpt-4o' },
  ];

  const results = {};

  for (const p of providers) {
    console.log(`\n=== Benchmarking Provider: ${p.provider} (${p.model}) ===`);
    results[p.provider] = {};

    for (const req of CANONICAL_REQUESTS) {
      console.log(`Testing ${req.id}: "${req.prompt}"...`);
      const runs = [];
      for (let runIndex = 1; runIndex <= 3; runIndex++) {
        process.stdout.write(`  Run ${runIndex}/3: `);
        const res = await runTask(req.prompt, p.provider, p.model);
        runs.push(res);
        console.log(`${res.status} in ${res.durationMs}ms (first progress: ${res.firstProgressMs}ms, modelCalls: ${res.modelCalls}, toolCalls: ${res.toolCalls})`);
        await new Promise((r) => setTimeout(r, 1000));
      }
      results[p.provider][req.id] = runs;
    }
  }

  const outputPath = path.join(EVIDENCE_DIR, 'canonical_baseline.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n[Audit] Benchmark completed! Results written to ${outputPath}`);
}

main().catch((err) => {
  console.error('[Audit Error]', err);
  process.exit(1);
});
