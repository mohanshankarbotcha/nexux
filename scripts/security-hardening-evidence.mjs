import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createNexusApp } from '../packages/server/dist/api/app.js';
import { getOrCreateApiToken, setApiToken } from '../packages/server/dist/security/auth-token.js';
import { CredentialVault } from '../packages/server/dist/security/credential-vault.js';
import { globalStorage } from '../packages/server/dist/storage/storage-engine.js';
import { globalWorkspaceService } from '../packages/server/dist/workspace/workspace-service.js';

const evidenceDir = path.resolve('docs/nexus-v2/v2-release/03-security/evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

function writeEvidence(filename, data) {
  const filePath = path.join(evidenceDir, filename);
  fs.writeFileSync(filePath, typeof data === 'string' ? data : JSON.stringify(data, null, 2), 'utf8');
  console.log(`Saved evidence: ${filename}`);
}

async function runSecurityTests() {
  console.log('=== STARTING SECURITY HARDENING EVIDENCE RUN ===\n');

  const token = 'nexus_test_sec_token_99998888777766665555444433332222';
  setApiToken(token);

  const app = createNexusApp();
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Security Test Server running on ${baseUrl}`);

  // Test 1: CORS rejection of unauthorized external origin
  {
    console.log('Running Check 1: CORS unauthorized origin...');
    let corsBlocked = false;
    let resStatus = 0;
    let errorMsg = '';
    try {
      const res = await fetch(`${baseUrl}/api/health`, {
        headers: {
          Origin: 'https://malicious-website.com',
        },
      });
      resStatus = res.status;
      // Express cors middleware returns 500 or error when origin fails callback
      if (res.status >= 400) {
        corsBlocked = true;
      }
    } catch (e) {
      corsBlocked = true;
      errorMsg = e.message;
    }
    writeEvidence('01_cors_unauthorized_origin.json', {
      origin: 'https://malicious-website.com',
      endpoint: '/api/health',
      blocked: corsBlocked,
      status: resStatus,
      errorMsg,
      expected: 'Blocked or HTTP 500 error on disallowed CORS origin',
    });
  }

  // Test 2: Request without API token rejected with 401
  {
    console.log('Running Check 2: Request without API token...');
    const res = await fetch(`${baseUrl}/api/providers/status`);
    const status = res.status;
    const body = await res.json();
    writeEvidence('02_unauthenticated_request_rejected.json', {
      endpoint: '/api/providers/status',
      method: 'GET',
      headersSent: {},
      status,
      body,
      passed: status === 401 && body.errorCode === 'AUTH_REQUIRED',
    });
  }

  // Test 3: Request with wrong token rejected
  {
    console.log('Running Check 3: Request with invalid API token...');
    const res = await fetch(`${baseUrl}/api/providers/status`, {
      headers: {
        'X-Nexus-Token': 'wrong_invalid_token_12345',
      },
    });
    const status = res.status;
    const body = await res.json();
    writeEvidence('03_invalid_token_rejected.json', {
      endpoint: '/api/providers/status',
      method: 'GET',
      tokenSent: 'wrong_invalid_token_12345',
      status,
      body,
      passed: status === 401 && body.errorCode === 'AUTH_REQUIRED',
    });
  }

  // Test 4: Request with valid token accepted
  {
    console.log('Running Check 4: Request with valid API token...');
    const res = await fetch(`${baseUrl}/api/providers/status`, {
      headers: {
        'X-Nexus-Token': token,
      },
    });
    const status = res.status;
    const body = await res.json();
    writeEvidence('04_valid_token_accepted.json', {
      endpoint: '/api/providers/status',
      method: 'GET',
      tokenSent: 'VALID_TOKEN',
      status,
      bodySuccess: body.success,
      passed: status === 200 && body.success === true,
    });
  }

  // Test 5: Terminal route ignores client-supplied workspacePath and rejects without active workspace
  {
    console.log('Running Check 5: Terminal route without active workspace...');
    const res = await fetch(`${baseUrl}/api/workspaces/terminal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Nexus-Token': token,
      },
      body: JSON.stringify({
        command: 'echo attack',
        workspacePath: 'C:\\Windows\\System32', // Attack payload
      }),
    });
    const status = res.status;
    const body = await res.json();
    writeEvidence('05_terminal_arbitrary_workspace_rejected.json', {
      endpoint: '/api/workspaces/terminal',
      attackPayload: { command: 'echo attack', workspacePath: 'C:\\Windows\\System32' },
      status,
      body,
      passed: status === 400 && body.error?.code === 'NO_ACTIVE_WORKSPACE',
    });
  }

  // Test 6: Workspace /open forbids protected directories
  {
    console.log('Running Check 6: Workspace open protected directory rejection...');
    const protectedPaths = [
      'C:\\Windows',
      'C:\\Program Files',
      'C:\\',
      process.env.USERPROFILE || 'C:\\Users\\BMS',
    ];
    const results = [];
    for (const p of protectedPaths) {
      if (!fs.existsSync(p)) continue;
      const res = await fetch(`${baseUrl}/api/workspaces/open`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Nexus-Token': token,
        },
        body: JSON.stringify({ targetPath: p }),
      });
      const body = await res.json();
      results.push({
        path: p,
        status: res.status,
        code: body.error?.code,
        rejected: res.status === 403 && body.error?.code === 'PROTECTED_DIRECTORY',
      });
    }
    writeEvidence('06_workspace_protected_dirs_rejected.json', {
      results,
      allPassed: results.every((r) => r.rejected),
    });
  }

  // Test 7: CredentialVault encryption at rest and zero plaintext leakage
  {
    console.log('Running Check 7: CredentialVault encryption at rest...');
    const testDir = path.join(os.tmpdir(), `nexus_vault_sec_test_${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    const vault = new CredentialVault();
    const rawSecret = {
      geminiApiKey: 'AIzaSyA_REALISTIC_TEST_SECRET_KEY_12345',
      openaiApiKey: 'sk-proj-TEST_SECRET_OPENAI_KEY_67890',
    };

    vault.saveToDisk(testDir, rawSecret);

    const encFile = path.join(testDir, 'credentials.enc');
    const jsonFile = path.join(testDir, 'credentials.json');

    const encExists = fs.existsSync(encFile);
    const jsonExists = fs.existsSync(jsonFile);
    const encContent = encExists ? JSON.parse(fs.readFileSync(encFile, 'utf8')) : null;

    // Decrypt and verify
    const restored = vault.loadFromDisk(testDir);

    writeEvidence('07_credential_vault_encryption.json', {
      encFileExists: encExists,
      plaintextJsonExists: jsonExists,
      envelopeFormat: encContent?.format,
      hasIv: !!encContent?.iv,
      hasTag: !!encContent?.tag,
      ciphertextSample: encContent?.data?.slice(0, 32) + '...',
      plaintextLeakedInEncFile: fs.readFileSync(encFile, 'utf8').includes('AIzaSyA'),
      restoredKeysMatch: restored.geminiApiKey === rawSecret.geminiApiKey,
      passed: encExists && !jsonExists && encContent?.format === 'nexus_vault_v2_aes256gcm' && !fs.readFileSync(encFile, 'utf8').includes('AIzaSyA'),
    });

    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  }

  // Test 8: Secret sanitization in logs and API responses
  {
    console.log('Running Check 8: Secret masking in API responses...');
    const testDir = path.join(os.tmpdir(), `nexus_mask_sec_test_${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    globalStorage.reinitialize(testDir);

    // Save test credentials via storage
    globalStorage.saveCredentials({
      geminiApiKey: 'AIzaSyA1B2C3D4E5F6G7H8I9SECRET123',
      openaiApiKey: 'sk-proj-1234567890abcdefSECRET456',
    });

    const statusRes = await fetch(`${baseUrl}/api/providers/status`, {
      headers: { 'X-Nexus-Token': token },
    });
    const statusBody = await statusRes.json();

    const credsRes = await fetch(`${baseUrl}/api/providers/credentials`, {
      headers: { 'X-Nexus-Token': token },
    });
    const credsBody = await credsRes.json();

    const rawCredsStr = JSON.stringify(credsBody);
    const rawStatusStr = JSON.stringify(statusBody);

    const secretLeaked =
      rawCredsStr.includes('SECRET123') ||
      rawCredsStr.includes('SECRET456') ||
      rawStatusStr.includes('SECRET123') ||
      rawStatusStr.includes('SECRET456');

    writeEvidence('08_secret_masking_verification.json', {
      statusResponse: statusBody,
      credentialsResponse: credsBody,
      secretLeaked,
      geminiMasked: credsBody.credentials?.geminiApiKey,
      openaiMasked: credsBody.credentials?.openaiApiKey,
      passed: !secretLeaked && credsBody.credentials?.geminiApiKey?.includes('••••'),
    });

    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  }

  await new Promise((resolve) => server.close(() => resolve()));
  console.log('\n=== ALL SECURITY EVIDENCE COLLECTED SUCCESSFULLY ===');
}

runSecurityTests().catch((err) => {
  console.error('Security test failed:', err);
  process.exit(1);
});
