import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

console.log('====================================================');
console.log('  R1: RAW PROVIDER API CALL AUDIT (Outside NEXUS)');
console.log('====================================================\n');

const baseDir = process.env.LOCALAPPDATA || process.env.APPDATA || path.join(os.homedir(), '.nexus_ai');
const credFile = path.join(baseDir, 'NEXUS_AI_DATA', 'credentials.json');
let creds = {};
if (fs.existsSync(credFile)) {
  creds = JSON.parse(fs.readFileSync(credFile, 'utf8'));
}

// 1. Raw OpenAI Call
console.log('[1/2] Raw OpenAI API Call (Testing sk-test...cdef with 10s timeout)');
const openaiKey = creds.openaiApiKey || process.env.OPENAI_API_KEY || 'sk-invalid';
const controller1 = new AbortController();
const timeout1 = setTimeout(() => controller1.abort(), 10000);
try {
  const start = Date.now();
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 10,
    }),
    signal: controller1.signal,
  });
  clearTimeout(timeout1);
  const duration = Date.now() - start;
  const body = await res.json().catch(() => ({}));
  console.log(`Status: HTTP ${res.status} (${duration}ms)`);
  if (!res.ok) {
    console.log(`OpenAI Error: ${JSON.stringify(body?.error?.message || body)}`);
  } else {
    console.log(`OpenAI Reply: ${body.choices?.[0]?.message?.content}`);
    console.log(`Usage:`, body.usage);
  }
} catch (err) {
  clearTimeout(timeout1);
  console.log(`OpenAI Call Failed: ${err.name} - ${err.message}`);
}

// 2. Raw Gemini Call
console.log('\n[2/2] Raw Gemini API Call (Testing stored Gemini key with 10s timeout)');
const geminiKey = creds.geminiApiKey || process.env.GEMINI_API_KEY || '';
const controller2 = new AbortController();
const timeout2 = setTimeout(() => controller2.abort(), 10000);
try {
  const start = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'hi' }] }],
      generationConfig: { maxOutputTokens: 10 },
    }),
    signal: controller2.signal,
  });
  clearTimeout(timeout2);
  const duration = Date.now() - start;
  const body = await res.json().catch(() => ({}));
  console.log(`Status: HTTP ${res.status} (${duration}ms)`);
  if (!res.ok) {
    console.log(`Gemini Error: ${JSON.stringify(body?.error?.message || body)}`);
  } else {
    console.log(`Gemini Reply: ${body.candidates?.[0]?.content?.parts?.[0]?.text}`);
    console.log(`Usage:`, body.usageMetadata);
  }
} catch (err) {
  clearTimeout(timeout2);
  console.log(`Gemini Call Failed: ${err.name} - ${err.message}`);
}
