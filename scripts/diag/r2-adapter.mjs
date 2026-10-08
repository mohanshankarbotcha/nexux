import { OpenAIProvider, GeminiProvider } from '../../packages/server/dist/index.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

console.log('====================================================');
console.log('  R2: PROVIDER ADAPTER ISOLATION AUDIT');
console.log('====================================================\n');

const baseDir = process.env.LOCALAPPDATA || process.env.APPDATA || path.join(os.homedir(), '.nexus_ai');
const credFile = path.join(baseDir, 'NEXUS_AI_DATA', 'credentials.json');
let creds = {};
if (fs.existsSync(credFile)) {
  creds = JSON.parse(fs.readFileSync(credFile, 'utf8'));
}

// 1. OpenAI Provider Adapter
console.log('[1/2] OpenAIProvider Adapter (Testing validate & complete)');
const openai = new OpenAIProvider({ apiKey: creds.openaiApiKey });
const o1Valid = await openai.validateCredentials();
console.log(`OpenAI validateCredentials: isValid = ${o1Valid.isValid}, message = "${o1Valid.message}"`);

try {
  await openai.complete({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'hi' }],
  });
} catch (err) {
  console.log(`OpenAI complete threw correctly: [${err.code || err.name}] ${err.message}`);
}

// 2. Gemini Provider Adapter
console.log('\n[2/2] GeminiProvider Adapter (Testing validate & complete)');
const gemini = new GeminiProvider({ apiKey: creds.geminiApiKey });
const gemValid = await gemini.validateCredentials();
console.log(`Gemini validateCredentials: isValid = ${gemValid.isValid}, message = "${gemValid.message}"`);

try {
  const gemRes = await gemini.complete({
    model: 'gemini-2.5-flash',
    messages: [{ role: 'user', content: 'Say hello in one word' }],
  });
  console.log(`Gemini complete SUCCESS: "${gemRes.content.trim()}"`);
  console.log(`Gemini usage:`, gemRes.usage);
} catch (err) {
  console.log(`Gemini complete FAILED:`, err);
}
