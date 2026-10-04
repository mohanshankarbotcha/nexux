import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {
  ServerManager,
  isPortAvailable,
  findAvailablePort,
  resolveUserDataDir,
} from './server-manager.js';

describe('Desktop Process Lifecycle & Server Integration', () => {
  const testDataDir = path.join(os.tmpdir(), `nexus-desktop-test-${Date.now()}`);

  after(() => {
    try {
      if (fs.existsSync(testDataDir)) {
        fs.rmSync(testDataDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('resolves user data directory conforming to platform conventions', () => {
    const dir = resolveUserDataDir(testDataDir);
    assert.ok(fs.existsSync(dir), 'Data directory must be created if not existing');
    assert.equal(path.resolve(dir), path.resolve(testDataDir));
  });

  it('detects port availability and finds available free loopback port', async () => {
    const freePort = await findAvailablePort(3100, 20);
    assert.ok(typeof freePort === 'number' && freePort >= 3100);
    const isAvail = await isPortAvailable(freePort);
    assert.equal(isAvail, true);
  });

  it('starts embedded server and responds to HTTP health check', async () => {
    const manager = new ServerManager();
    const serverInfo = await manager.start({
      dataDir: testDataDir,
      preferredPort: 3200,
    });

    assert.ok(serverInfo.port >= 3200);
    assert.equal(serverInfo.host, '127.0.0.1');

    // Verify HTTP Health Check
    const res = await fetch(`${serverInfo.url}/api/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.status, 'ok');

    // Clean shutdown
    await serverInfo.stop();
  });

  it('handles port conflict gracefully by binding to next available port', async () => {
    // Intentionally occupy port 3300 with a dummy HTTP server
    const dummy = http.createServer((_req, res) => res.end('occupied'));
    await new Promise<void>((resolve) => dummy.listen(3300, '127.0.0.1', () => resolve()));

    const manager = new ServerManager();
    const serverInfo = await manager.start({
      dataDir: testDataDir,
      preferredPort: 3300,
    });

    // The manager should have safely selected 3301 or higher
    assert.notEqual(serverInfo.port, 3300);
    assert.ok(serverInfo.port > 3300);

    const res = await fetch(`${serverInfo.url}/api/health`);
    assert.equal(res.status, 200);

    await serverInfo.stop();
    await new Promise<void>((resolve) => dummy.close(() => resolve()));
  });

  it('supports repeated startup and clean shutdown cycles without socket or port leaks', async () => {
    const manager = new ServerManager();
    const targetPort = 3450;

    for (let cycle = 1; cycle <= 3; cycle++) {
      const serverInfo = await manager.start({
        dataDir: testDataDir,
        preferredPort: targetPort,
      });

      assert.equal(serverInfo.port, targetPort, `Cycle ${cycle} should bind to released port`);

      const res = await fetch(`${serverInfo.url}/api/health`);
      assert.equal(res.status, 200);

      await serverInfo.stop();

      // Ensure port is immediately reusable
      const available = await isPortAvailable(targetPort);
      assert.equal(available, true, `Port should be free after cycle ${cycle} shutdown`);
    }
  });

  it('persists credentials and workspaces in user data directory and not install dir', async () => {
    const manager = new ServerManager();
    const serverInfo = await manager.start({
      dataDir: testDataDir,
      preferredPort: 3500,
    });

    // Save provider credentials
    const saveRes = await fetch(`${serverInfo.url}/api/providers/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        geminiApiKey: 'test-desktop-gemini-key',
      }),
    });
    assert.equal(saveRes.status, 200);

    // Verify stored in testDataDir/credentials.json
    const credsFile = path.join(testDataDir, 'credentials.json');
    assert.ok(fs.existsSync(credsFile), 'Credentials file must be in user data directory');
    const content = JSON.parse(fs.readFileSync(credsFile, 'utf-8'));
    assert.equal(content.geminiApiKey, 'test-desktop-gemini-key');

    await serverInfo.stop();
  });
});
