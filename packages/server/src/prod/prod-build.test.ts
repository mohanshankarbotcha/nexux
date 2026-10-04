import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createNexusApp } from '../api/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Phase 17 Production Web Build Verification Suite', async (t) => {
  const rootDir = path.resolve(__dirname, '../../../..');
  const clientDist = path.join(rootDir, 'packages', 'client', 'dist');

  // 1. Verify build output exists
  await t.test('Task 1 & 2: Client distribution artifacts exist', () => {
    assert.ok(fs.existsSync(clientDist), 'packages/client/dist must exist');
    const indexHtml = path.join(clientDist, 'index.html');
    assert.ok(fs.existsSync(indexHtml), 'packages/client/dist/index.html must exist');

    const htmlContent = fs.readFileSync(indexHtml, 'utf-8');
    assert.ok(htmlContent.includes('id="root"'), 'index.html must contain #root');
    assert.ok(htmlContent.includes('/assets/index-'), 'index.html must reference hashed assets');
  });

  // 2. Verify asset bundle integrity
  await t.test('Task 3: Asset bundle files exist and are non-empty', () => {
    const assetsDir = path.join(clientDist, 'assets');
    assert.ok(fs.existsSync(assetsDir), 'packages/client/dist/assets must exist');

    const files = fs.readdirSync(assetsDir);
    const jsFiles = files.filter((f) => f.endsWith('.js'));
    const cssFiles = files.filter((f) => f.endsWith('.css'));

    assert.ok(jsFiles.length > 0, 'Must have at least 1 compiled JS asset');
    assert.ok(cssFiles.length > 0, 'Must have at least 1 compiled CSS asset');

    for (const f of [...jsFiles, ...cssFiles]) {
      const stat = fs.statSync(path.join(assetsDir, f));
      assert.ok(stat.size > 1000, `Asset ${f} must be non-trivial size (>1KB), was ${stat.size}B`);
    }
  });

  // 3. Verify no secrets are bundled in client assets
  await t.test('Task 6: Client bundles contain zero secrets or hardcoded API keys', () => {
    const assetsDir = path.join(clientDist, 'assets');
    const files = fs.readdirSync(assetsDir);

    for (const f of files) {
      const content = fs.readFileSync(path.join(assetsDir, f), 'utf-8');
      const hasOpenAiKey = /sk-[a-zA-Z0-9]{20,}/.test(content);
      const hasGeminiKey = /AIzaSy[a-zA-Z0-9_-]{33}/.test(content);

      assert.equal(hasOpenAiKey, false, `Secret OpenAI API key pattern found in ${f}`);
      assert.equal(hasGeminiKey, false, `Secret Gemini API key pattern found in ${f}`);
    }
  });

  // 4. Test production Express server mounting client dist
  await t.test('Task 7 & 11: Production Express server serves HTML and static assets', async () => {
    const app = createNexusApp();
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const origin = `http://127.0.0.1:${port}`;

    try {
      // Test root HTML
      const rootRes = await fetch(origin + '/');
      assert.equal(rootRes.status, 200);
      assert.ok(rootRes.headers.get('content-type')?.includes('text/html'));
      const html = await rootRes.text();
      assert.ok(html.includes('id="root"'));

      // Test compiled JS asset delivery
      const jsMatch = html.match(/\/assets\/index-[a-zA-Z0-9_\-]+\.js/);
      assert.ok(jsMatch, 'index.html must reference a compiled JS bundle');
      const assetRes = await fetch(origin + jsMatch[0]);
      assert.equal(assetRes.status, 200);
      assert.ok(assetRes.headers.get('content-type')?.includes('javascript'));
      const assetBytes = await assetRes.arrayBuffer();
      assert.ok(assetBytes.byteLength > 1000);

      // Test SPA fallback for arbitrary client route
      const spaRes = await fetch(origin + '/sessions/active-session-id');
      assert.equal(spaRes.status, 200);
      assert.ok(spaRes.headers.get('content-type')?.includes('text/html'));
      const spaHtml = await spaRes.text();
      assert.ok(spaHtml.includes('id="root"'));

      // Test API routes bypass SPA fallback
      const healthRes = await fetch(origin + '/api/health');
      assert.equal(healthRes.status, 200);
      assert.ok(healthRes.headers.get('content-type')?.includes('json'));
      const healthJson = await healthRes.json();
      assert.equal(healthJson.status, 'ok');

      // Test 404 for missing API route returns JSON, NOT HTML
      const api404Res = await fetch(origin + '/api/nonexistent-route-12345');
      assert.equal(api404Res.status, 404);
      assert.ok(api404Res.headers.get('content-type')?.includes('json'));
      const api404Json = await api404Res.json();
      assert.ok(api404Json.error?.includes('API route not found'));
    } finally {
      server.close();
    }
  });
});
