import os from 'node:os';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';

console.log('====================================================');
console.log('  R0: ENVIRONMENT & CONNECTIVITY AUDIT');
console.log('====================================================\n');

// 1. Runtime & OS
console.log('[1/5] Runtime & Platform');
console.log(`Node version: ${process.version}`);
console.log(`Platform: ${process.platform} (${os.release()}, arch: ${process.arch})`);
console.log(`Cwd: ${process.cwd()}`);

// 2. Localhost resolution
console.log('\n[2/5] Localhost Resolution');
try {
  const v4 = await dns.resolve4('localhost').catch(() => []);
  const v6 = await dns.resolve6('localhost').catch(() => []);
  console.log(`localhost IPv4: ${v4.join(', ') || 'none'}`);
  console.log(`localhost IPv6: ${v6.join(', ') || 'none'}`);
} catch (e) {
  console.log(`DNS resolution error: ${e.message}`);
}

// 3. Port check
async function checkPort(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const s = net.createConnection(port, host, () => {
      s.destroy();
      resolve(true);
    });
    s.on('error', () => resolve(false));
  });
}

console.log('\n[3/5] Ports Check');
const port3000 = await checkPort(3000);
const port5173 = await checkPort(5173);
console.log(`Port 3000 (Backend): ${port3000 ? 'OPEN/LISTENING' : 'NOT ACCESSIBLE'}`);
console.log(`Port 5173 (Frontend): ${port5173 ? 'OPEN/LISTENING' : 'NOT ACCESSIBLE'}`);

// 4. External DNS & TCP reachability
console.log('\n[4/5] Provider DNS & TCP Reachability');
for (const host of ['api.openai.com', 'generativelanguage.googleapis.com']) {
  try {
    const addrs = await dns.resolve4(host);
    const tcp = await new Promise((resolve) => {
      const s = net.createConnection(443, host, () => {
        s.destroy();
        resolve(true);
      });
      s.setTimeout(3000, () => { s.destroy(); resolve(false); });
      s.on('error', () => resolve(false));
    });
    console.log(`${host}: DNS OK (${addrs[0]}), TCP:443 ${tcp ? 'REACHABLE' : 'UNREACHABLE'}`);
  } catch (err) {
    console.log(`${host}: FAILED (${err.message})`);
  }
}

// 5. Credentials audit (masked)
console.log('\n[5/5] Stored Credentials Presence');
const baseDir = process.env.LOCALAPPDATA || process.env.APPDATA || path.join(os.homedir(), '.nexus_ai');
const credFile = path.join(baseDir, 'NEXUS_AI_DATA', 'credentials.json');
console.log(`Credentials path: ${credFile}`);
if (fs.existsSync(credFile)) {
  const creds = JSON.parse(fs.readFileSync(credFile, 'utf8'));
  const entries = Array.isArray(creds)
    ? creds.map(c => [c.provider, c.apiKey])
    : Object.entries(creds).map(([k, v]) => [k, v]);
  for (const [key, val] of entries) {
    const valStr = String(val || '');
    const masked = valStr.length > 8 ? `${valStr.slice(0, 7)}...${valStr.slice(-4)} (length ${valStr.length})` : 'EMPTY';
    console.log(`Key '${key}': Masked = ${masked}`);
  }
} else {
  console.log('credentials.json does not exist');
}
