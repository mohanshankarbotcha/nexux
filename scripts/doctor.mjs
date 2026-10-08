#!/usr/bin/env node
/**
 * NEXUS.AI System Diagnostic & Credential Health Tool (Doctor)
 * Reports real configuration status, masked keys, live API reachability, and model availability.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const isFixMode = process.argv.includes('--fix');

console.log('========================================================');
console.log('  NEXUS.AI V2 — SYSTEM DIAGNOSTIC & CREDENTIAL DOCTOR');
console.log('========================================================\n');

const baseDir =
  process.env.NEXUS_DATA_DIR ||
  process.env.LOCALAPPDATA ||
  process.env.APPDATA ||
  path.join(os.homedir(), '.nexus_ai');

const dataDir = process.env.NEXUS_DATA_DIR ? path.resolve(process.env.NEXUS_DATA_DIR) : path.join(baseDir, 'NEXUS_AI_DATA');

console.log(`[Storage] Data Directory: ${dataDir}`);
console.log(`[Storage] Directory Exists: ${fs.existsSync(dataDir) ? 'YES' : 'NO'}`);

if (!fs.existsSync(dataDir)) {
  console.log('No data directory found. Initial configuration will be created on first launch.\n');
  process.exit(0);
}

const credsPath = path.join(dataDir, 'credentials.json');
let creds = {};

if (fs.existsSync(credsPath)) {
  try {
    creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    console.log(`[Storage] credentials.json: Found (${fs.statSync(credsPath).mtime.toISOString()})`);
  } catch (err) {
    console.error(`[Storage] ERROR parsing credentials.json: ${err.message}`);
  }
} else {
  console.log('[Storage] credentials.json: NOT FOUND');
}

function mask(key) {
  if (!key || typeof key !== 'string') return '(none)';
  if (key.length <= 8) return '********';
  return key.slice(0, 4) + '••••••••' + key.slice(-4);
}

function isFixture(key) {
  if (!key || typeof key !== 'string') return false;
  const lower = key.trim().toLowerCase();
  return (
    lower.startsWith('sk-test') ||
    lower.includes('obviously-fake') ||
    lower.includes('your-api-key') ||
    lower.includes('dummy') ||
    lower.includes('developer-audit') ||
    lower.startsWith('aizasygemini') ||
    lower === 'sk-intentionally-invalid-key'
  );
}

// ----------------------------------------------------
// Check OpenAI
// ----------------------------------------------------
console.log('\n--- Provider: OpenAI ---');
const openaiKey = creds.openaiApiKey || process.env.OPENAI_API_KEY;
const openaiSource = creds.openaiApiKey ? 'credentials.json' : process.env.OPENAI_API_KEY ? 'environment' : 'none';
const openaiIsFixture = isFixture(openaiKey);

console.log(`Configured: ${Boolean(openaiKey)} (Source: ${openaiSource})`);
console.log(`Masked Key: ${mask(openaiKey)}`);
console.log(`Fixture/Placeholder Key: ${openaiIsFixture ? 'YES (UNSAFE/INVALID)' : 'NO (clean)'}`);

if (openaiKey && !openaiIsFixture) {
  process.stdout.write('Validating live API reachability & models... ');
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${openaiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      const ids = (data.data || []).map((m) => m.id);
      console.log('VALID (HTTP 200)');
      console.log(`Total accessible models: ${ids.length}`);
      console.log(`  gpt-4o: ${ids.includes('gpt-4o') ? 'YES' : 'NO'}`);
      console.log(`  gpt-4o-mini: ${ids.includes('gpt-4o-mini') ? 'YES' : 'NO'}`);
      console.log(`  o1-mini: ${ids.includes('o1-mini') ? 'YES' : 'NO (not available on this tier/account)'}`);
      console.log(`  o1: ${ids.includes('o1') ? 'YES' : 'NO'}`);
      console.log(`  o3-mini: ${ids.includes('o3-mini') ? 'YES' : 'NO'}`);
    } else {
      console.log(`INVALID (HTTP ${res.status})`);
      const err = await res.json().catch(() => ({}));
      console.log(`  Error: ${(err && err.error && err.error.message) || 'Unknown error'}`);
    }
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
  }
}

// ----------------------------------------------------
// Check Google Gemini
// ----------------------------------------------------
console.log('\n--- Provider: Google Gemini ---');
const geminiKey = creds.geminiApiKey || process.env.GEMINI_API_KEY;
const geminiSource = creds.geminiApiKey ? 'credentials.json' : process.env.GEMINI_API_KEY ? 'environment' : 'none';
const geminiIsFixture = isFixture(geminiKey);

console.log(`Configured: ${Boolean(geminiKey)} (Source: ${geminiSource})`);
console.log(`Masked Key: ${mask(geminiKey)}`);
console.log(`Fixture/Placeholder Key: ${geminiIsFixture ? 'YES (UNSAFE/INVALID)' : 'NO (clean)'}`);

if (geminiKey && !geminiIsFixture) {
  process.stdout.write('Validating live API reachability & models... ');
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(geminiKey)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (res.ok) {
      const data = await res.json();
      const names = (data.models || []).map((m) => m.name.replace('models/', ''));
      console.log('VALID (HTTP 200)');
      console.log(`Total accessible models: ${names.length}`);
      console.log(`  gemini-2.5-flash: ${names.includes('gemini-2.5-flash') ? 'YES' : 'NO'}`);
      console.log(`  gemini-2.5-pro: ${names.includes('gemini-2.5-pro') ? 'YES' : 'NO'}`);
      console.log(`  gemini-1.5-flash: ${names.some((m) => m.includes('1.5-flash')) ? 'YES' : 'NO'}`);
    } else {
      console.log(`INVALID (HTTP ${res.status})`);
      const err = await res.json().catch(() => ({}));
      console.log(`  Error: ${(err && err.error && err.error.message) || 'Unknown error'}`);
    }
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
  }
}

// ----------------------------------------------------
// Fix Mode
// ----------------------------------------------------
if (isFixMode) {
  console.log('\n--- Fix Mode ---');
  let changed = false;
  const updatedCreds = { ...creds };

  if (openaiIsFixture) {
    console.log('Found fixture OpenAI key. Removing from credentials.json...');
    delete updatedCreds.openaiApiKey;
    changed = true;
  }
  if (geminiIsFixture) {
    console.log('Found fixture Gemini key. Removing from credentials.json...');
    delete updatedCreds.geminiApiKey;
    changed = true;
  }

  if (changed) {
    const backupPath = path.join(dataDir, `credentials.backup.${Date.now()}.json`);
    fs.copyFileSync(credsPath, backupPath);
    console.log(`Backed up existing credentials to: ${backupPath}`);
    fs.writeFileSync(credsPath, JSON.stringify(updatedCreds, null, 2), { mode: 0o600 });
    console.log('Successfully cleaned fixture keys from credentials.json.');
  } else {
    console.log('No fixture keys found to remove. Storage is clean.');
  }
}

console.log('\n========================================================\n');
