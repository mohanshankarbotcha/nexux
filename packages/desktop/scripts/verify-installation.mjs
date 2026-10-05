import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import cp from 'node:child_process';

const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const userProfile = process.env.USERPROFILE || os.homedir();

const installDir = path.join(localAppData, 'Programs', 'NEXUS.AI');
const exe = path.join(installDir, 'NEXUS_AI.exe');
const uninst = path.join(installDir, 'uninstall.exe');
const desktopLnk = path.join(userProfile, 'Desktop', 'NEXUS.AI.lnk');
const startMenuDir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'NEXUS.AI');
const startMenuLnk = path.join(startMenuDir, 'NEXUS.AI.lnk');

console.log('Installation Verification Results:');
console.log('Install Dir exists:     ', fs.existsSync(installDir));
console.log('NEXUS_AI.exe exists:    ', fs.existsSync(exe));
if (fs.existsSync(exe)) {
  console.log('  NEXUS_AI.exe size:    ', fs.statSync(exe).size, 'bytes');
}
console.log('uninstall.exe exists:   ', fs.existsSync(uninst));
console.log('Desktop shortcut exists:', fs.existsSync(desktopLnk));
console.log('Start Menu lnk exists:  ', fs.existsSync(startMenuLnk));

try {
  const regQuery = cp.execSync(
    'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\NEXUS.AI"',
    { encoding: 'utf-8' }
  );
  console.log('\nWindows Registry Uninstall Key:');
  console.log(regQuery.trim());
} catch (e) {
  console.log('Windows Registry Key query failed or not found.');
}
