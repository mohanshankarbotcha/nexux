import { ModelRouter, OpenAIProvider, GeminiProvider } from '../../packages/server/dist/index.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

console.log('====================================================');
console.log('  R3: MODEL ROUTER AUDIT');
console.log('====================================================\n');

const baseDir = process.env.LOCALAPPDATA || process.env.APPDATA || path.join(os.homedir(), '.nexus_ai');
const credFile = path.join(baseDir, 'NEXUS_AI_DATA', 'credentials.json');
let creds = {};
if (fs.existsSync(credFile)) {
  creds = JSON.parse(fs.readFileSync(credFile, 'utf8'));
}

const router = new ModelRouter();
const openai = new OpenAIProvider({ apiKey: creds.openaiApiKey });
const gemini = new GeminiProvider({ apiKey: creds.geminiApiKey });
router.registerProvider(openai);
router.registerProvider(gemini);

// 1. Route resolution for roles
console.log('[1/3] Route resolution for role "coordinator"');
const defaultRoute = router.getRouteForRole('coordinator');
console.log(`Default coordinator route: provider = ${defaultRoute.provider.id}, model = ${defaultRoute.model}`);

// 2. Overrides
console.log('\n[2/3] Route override tests');
const geminiOverride = router.getRouteForRole('coordinator', { provider: 'gemini', model: 'gemini-2.5-flash' });
console.log(`Gemini override route: provider = ${geminiOverride.provider.id}, model = ${geminiOverride.model}`);

const openaiOverride = router.getRouteForRole('coordinator', { provider: 'openai', model: 'gpt-4o' });
console.log(`OpenAI override route: provider = ${openaiOverride.provider.id}, model = ${openaiOverride.model}`);

// 3. Execution via Gemini
console.log('\n[3/3] Execution via Router (Gemini)');
try {
  const res = await router.executeForRole('coordinator', {
    model: 'gemini-2.5-flash',
    messages: [{ role: 'user', content: 'Say "NEXUS OK" in two words' }],
  }, { provider: 'gemini', model: 'gemini-2.5-flash' });
  console.log(`Router execution SUCCESS: "${res.content.trim()}"`);
} catch (err) {
  console.log(`Router execution FAILED:`, err);
}
