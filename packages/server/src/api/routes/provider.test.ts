import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createNexusApp } from '../app.js';
import { StorageEngine, globalStorage } from '../../storage/storage-engine.js';
import { globalModelRouter } from '../../providers/model-router.js';
import { maskKey } from '@nexus/core';

// Helper to make mock requests against Express app
async function makeRequest(app: any, method: string, pathUrl: string, body?: any) {
  // Use http server on random port
  const server = app.listen(0);
  const port = server.address().port;
  const url = `http://localhost:${port}${pathUrl}`;

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    return { status: res.status, body: json };
  } finally {
    server.close();
  }
}

test('Phase 3 / Provider Suite', { concurrency: 1 }, async (t) => {
  await t.test('Masking - maskKey safely masks secrets without full disclosure', () => {
    assert.equal(maskKey(undefined), null);
    assert.equal(maskKey(''), null);
    assert.equal(maskKey('short'), '••••••••');
    assert.equal(maskKey('sk-1234567890abcdef'), 'sk-1••••••••cdef');
    assert.equal(maskKey('AIzaSyA1B2C3D4E5F6G7H8I9'), 'AIza••••••••H8I9');
  });

  await t.test('Onboarding - status returns correctly when no provider is configured', async () => {
    // Reset credentials in storage
    globalStorage.saveCredentials({ openaiApiKey: '', geminiApiKey: '' });
    globalModelRouter.updateCredential('openai', '');
    globalModelRouter.updateCredential('gemini', '');

    const app = createNexusApp();
    const res = await makeRequest(app, 'GET', '/api/providers/status');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.hasAnyValidProvider, false);
    assert.equal(res.body.providers.openai.configured, false);
    assert.equal(res.body.providers.openai.maskedKey, null);
    assert.equal(res.body.providers.gemini.configured, false);
    assert.equal(res.body.providers.gemini.maskedKey, null);
  });

  await t.test('Safety - blocks AI task execution when no provider is configured', async () => {
    globalStorage.saveCredentials({ openaiApiKey: '', geminiApiKey: '' });
    globalModelRouter.updateCredential('openai', '');
    globalModelRouter.updateCredential('gemini', '');

    const app = createNexusApp();
    const res = await makeRequest(app, 'POST', '/api/tasks', {
      prompt: 'Implement a feature',
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'PROVIDER_NOT_CONFIGURED');
  });

  await t.test('Onboarding - configuring OpenAI only', async () => {
    const app = createNexusApp();
    const updateRes = await makeRequest(app, 'POST', '/api/providers/credentials', {
      openaiApiKey: 'sk-testkey123456789012345678',
      geminiApiKey: '',
    });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.hasAnyValidProvider, true);

    const statusRes = await makeRequest(app, 'GET', '/api/providers/status');
    assert.equal(statusRes.body.hasAnyValidProvider, true);
    assert.equal(statusRes.body.providers.openai.configured, true);
    assert.ok(statusRes.body.providers.openai.maskedKey.startsWith('sk-t'));
    assert.equal(statusRes.body.providers.gemini.configured, false);
  });

  await t.test('Onboarding - configuring Gemini only', async () => {
    const app = createNexusApp();
    const updateRes = await makeRequest(app, 'POST', '/api/providers/credentials', {
      openaiApiKey: '',
      geminiApiKey: 'AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3',
    });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.hasAnyValidProvider, true);

    const statusRes = await makeRequest(app, 'GET', '/api/providers/status');
    assert.equal(statusRes.body.hasAnyValidProvider, true);
    assert.equal(statusRes.body.providers.gemini.configured, true);
    assert.ok(statusRes.body.providers.gemini.maskedKey.startsWith('AIza'));
    assert.equal(statusRes.body.providers.openai.configured, false);
  });

  await t.test('Onboarding - configuring both providers', async () => {
    const app = createNexusApp();
    const updateRes = await makeRequest(app, 'POST', '/api/providers/credentials', {
      openaiApiKey: 'sk-testopenai1234567890abcdef',
      geminiApiKey: 'AIzaSyGemini1234567890abcdef',
    });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.hasAnyValidProvider, true);

    const statusRes = await makeRequest(app, 'GET', '/api/providers/status');
    assert.equal(statusRes.body.hasAnyValidProvider, true);
    assert.equal(statusRes.body.providers.openai.configured, true);
    assert.equal(statusRes.body.providers.gemini.configured, true);
    assert.deepEqual(statusRes.body.activeProviders.sort(), ['gemini', 'openai']);
  });

  await t.test('Validation - validate rejects invalid credentials', async () => {
    const app = createNexusApp();
    const res = await makeRequest(app, 'POST', '/api/providers/validate', {
      provider: 'openai',
      apiKey: 'sk-intentionally-invalid-key',
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, false);
    assert.equal(res.body.result.isValid, false);
  });
});
