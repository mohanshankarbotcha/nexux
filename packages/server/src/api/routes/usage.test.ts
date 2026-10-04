import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createNexusApp } from '../app.js';
import { StorageEngine, globalStorage } from '../../storage/storage-engine.js';
import { UsageRecord } from '@nexus/core';

async function makeRequest(app: any, method: string, pathUrl: string) {
  const server = app.listen(0);
  const port = server.address().port;
  const url = `http://localhost:${port}${pathUrl}`;

  try {
    const res = await fetch(url, { method });
    const json = await res.json();
    return { status: res.status, body: json };
  } finally {
    server.close();
  }
}

test('Phase 10 / Usage Intelligence Suite', { concurrency: 1 }, async (t) => {
  const tempDir = path.join(os.tmpdir(), `nexus_usage_test_${Date.now()}`);
  const storage = new StorageEngine(tempDir);

  await t.test('Aggregates telemetry correctly across provider, model, agent, task, and session', async () => {
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const taskId1 = `task_1_${uid}`;
    const taskId2 = `task_2_${uid}`;
    const sessId1 = `sess_1_${uid}`;
    const sessId2 = `sess_2_${uid}`;

    // Populate sample usage records
    const record1: UsageRecord = {
      requestId: `req_1_${uid}`,
      sessionId: sessId1,
      taskId: taskId1,
      agent: 'coder',
      provider: 'openai',
      model: 'gpt-4o',
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      isEstimated: false,
      estimatedCostUsd: 0.0075,
      timestamp: Date.now() - 10000,
      durationMs: 450,
      status: 'success',
    };

    const record2: UsageRecord = {
      requestId: `req_2_${uid}`,
      sessionId: sessId1,
      taskId: taskId1,
      agent: 'reviewer',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      inputTokens: 2000,
      outputTokens: 200,
      totalTokens: 2200,
      isEstimated: false,
      estimatedCostUsd: 0.00021,
      timestamp: Date.now() - 5000,
      durationMs: 250,
      status: 'success',
    };

    const record3: UsageRecord = {
      requestId: `req_3_${uid}`,
      sessionId: sessId2,
      taskId: taskId2,
      agent: 'planner',
      provider: 'openai',
      model: 'gpt-4o',
      inputTokens: 3000,
      outputTokens: 1000,
      totalTokens: 4000,
      isEstimated: false,
      estimatedCostUsd: 0.0175,
      timestamp: Date.now(),
      durationMs: 800,
      status: 'success',
    };

    // Save to globalStorage
    globalStorage.recordUsage(record1);
    globalStorage.recordUsage(record2);
    globalStorage.recordUsage(record3);

    const app = createNexusApp();

    // 1. Test /api/usage/summary
    const summaryRes = await makeRequest(app, 'GET', '/api/usage/summary');
    assert.equal(summaryRes.status, 200);
    assert.equal(summaryRes.body.success, true);

    const summary = summaryRes.body.summary;
    assert.ok(summary.totalRequests >= 3);
    assert.ok(summary.totalTokens >= 7700);

    // Verify Provider Aggregations
    assert.ok(summary.byProvider.openai);
    assert.ok(summary.byProvider.gemini);
    assert.ok(summary.byProvider.openai.tokens >= 5500);
    assert.ok(summary.byProvider.gemini.tokens >= 2200);
    assert.ok(summary.byProvider.openai.inputTokens >= 4000);
    assert.ok(summary.byProvider.openai.outputTokens >= 1500);

    // Verify Model Aggregations
    assert.ok(summary.byModel['gpt-4o']);
    assert.ok(summary.byModel['gemini-2.5-flash']);
    assert.ok(summary.byModel['gpt-4o'].requests >= 2);

    // Verify Agent Aggregations
    assert.ok(summary.byAgent.coder);
    assert.ok(summary.byAgent.reviewer);
    assert.ok(summary.byAgent.planner);

    // Verify Task Aggregations
    assert.ok(summary.byTask[taskId1]);
    assert.ok(summary.byTask[taskId2]);
    assert.equal(summary.byTask[taskId1].requests, 2);
    assert.equal(summary.byTask[taskId1].totalTokens, 3700);
    assert.equal(summary.byTask[taskId2].requests, 1);
    assert.equal(summary.byTask[taskId2].totalTokens, 4000);

    // Verify Session Aggregations
    assert.ok(summary.bySession[sessId1]);
    assert.ok(summary.bySession[sessId2]);
    assert.equal(summary.bySession[sessId1].requests, 2);
    assert.equal(summary.bySession[sessId2].requests, 1);

    // 2. Test /api/usage/records
    const recordsRes = await makeRequest(app, 'GET', '/api/usage/records');
    assert.equal(recordsRes.status, 200);
    assert.equal(recordsRes.body.success, true);
    assert.ok(Array.isArray(recordsRes.body.records));
    assert.ok(recordsRes.body.records.some((r: any) => r.requestId === `req_1_${uid}`));
    assert.ok(recordsRes.body.records.some((r: any) => r.requestId === `req_2_${uid}`));
    assert.ok(recordsRes.body.records.some((r: any) => r.requestId === `req_3_${uid}`));
  });

  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
});
