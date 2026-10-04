import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

const releaseDir = path.join(rootDir, 'release');
const targetAppDir = path.join(releaseDir, 'NEXUS_AI-win32-x64');
const electronDistDir = path.join(rootDir, 'node_modules/electron/dist');

console.log('====================================================');
console.log('  NEXUS.AI — Production Windows Packaging Pipeline');
console.log('====================================================\n');

// 1. Verify Prerequisites
if (!fs.existsSync(electronDistDir)) {
  console.error('Error: Electron distribution not found at:', electronDistDir);
  process.exit(1);
}

const clientDist = path.join(rootDir, 'packages/client/dist');
const serverDist = path.join(rootDir, 'packages/server/dist');
const coreDist = path.join(rootDir, 'packages/core/dist');
const desktopDist = path.join(rootDir, 'packages/desktop/dist');

for (const [pkg, distPath] of [
  ['@nexus/core', coreDist],
  ['@nexus/server', serverDist],
  ['@nexus/client', clientDist],
  ['@nexus/desktop', desktopDist],
]) {
  if (!fs.existsSync(distPath)) {
    console.error(`Error: Built package dist missing for ${pkg} at ${distPath}`);
    console.error('Run `npm run build` first.');
    process.exit(1);
  }
}

// 2. Prepare Release Directory
console.log(`[1/6] Preparing release target: ${targetAppDir}`);
if (fs.existsSync(targetAppDir)) {
  fs.rmSync(targetAppDir, { recursive: true, force: true });
}
fs.mkdirSync(targetAppDir, { recursive: true });

// 3. Copy Electron Binaries & DLLs
console.log('[2/6] Copying certified Electron runtime binaries and Chromium DLLs...');
fs.cpSync(electronDistDir, targetAppDir, { recursive: true });

// 4. Rename executable to NEXUS_AI.exe
const originalExe = path.join(targetAppDir, 'electron.exe');
const targetExe = path.join(targetAppDir, 'NEXUS_AI.exe');
if (fs.existsSync(originalExe)) {
  fs.renameSync(originalExe, targetExe);
  console.log('      Created standalone executable: NEXUS_AI.exe');
} else {
  console.error('Error: electron.exe not found in copied distribution.');
  process.exit(1);
}

// Remove default electron placeholder app
const defaultAppAsar = path.join(targetAppDir, 'resources/default_app.asar');
if (fs.existsSync(defaultAppAsar)) {
  fs.unlinkSync(defaultAppAsar);
}

// 5. Build and Bundle resources/app/
console.log('[3/6] Bundling NEXUS application payload into resources/app...');
const appDir = path.join(targetAppDir, 'resources/app');
fs.mkdirSync(appDir, { recursive: true });

// App package manifest
const appPkgJson = {
  name: 'nexus-ai',
  productName: 'NEXUS.AI',
  version: '1.0.0',
  description: 'NEXUS.AI — Autonomous AI Coding Assistant Platform',
  type: 'module',
  main: './dist/main.js',
  dependencies: {
    express: '^4.21.2',
    cors: '^2.8.5',
  },
};
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(appPkgJson, null, 2), 'utf-8');

// Copy desktop compiled dist
fs.cpSync(desktopDist, path.join(appDir, 'dist'), { recursive: true });

// Copy icon and assets
const desktopAssets = path.join(rootDir, 'packages/desktop/assets');
if (fs.existsSync(desktopAssets)) {
  fs.cpSync(desktopAssets, path.join(appDir, 'assets'), { recursive: true });
  fs.cpSync(desktopAssets, path.join(targetAppDir, 'assets'), { recursive: true });
}

// Copy production client bundle
fs.cpSync(clientDist, path.join(appDir, 'client-dist'), { recursive: true });

// 6. Bundle Node.js Runtime Dependencies
console.log('[4/6] Installing self-contained production runtime dependencies in app payload...');
cp.execSync('npm install --omit=dev --no-audit --no-fund --no-package-lock', {
  cwd: appDir,
  stdio: 'inherit',
});

// Copy internal workspace packages into app node_modules
console.log('[5/6] Linking internal workspace packages (@nexus/core, @nexus/server)...');
const appNodeModules = path.join(appDir, 'node_modules/@nexus');
fs.mkdirSync(appNodeModules, { recursive: true });

// @nexus/core
const appCoreDir = path.join(appNodeModules, 'core');
fs.mkdirSync(appCoreDir, { recursive: true });
fs.cpSync(coreDist, path.join(appCoreDir, 'dist'), { recursive: true });
fs.copyFileSync(
  path.join(rootDir, 'packages/core/package.json'),
  path.join(appCoreDir, 'package.json')
);

// @nexus/server
const appServerDir = path.join(appNodeModules, 'server');
fs.mkdirSync(appServerDir, { recursive: true });
fs.cpSync(serverDist, path.join(appServerDir, 'dist'), { recursive: true });
fs.copyFileSync(
  path.join(rootDir, 'packages/server/package.json'),
  path.join(appServerDir, 'package.json')
);

// 7. Write App Info and Windows Installer Helper
const appInfo = {
  name: 'NEXUS.AI',
  version: '1.0.0',
  executable: 'NEXUS_AI.exe',
  platform: 'win32',
  arch: 'x64',
  runtime: 'Electron v34.5.8 (Node.js v20+ / Chromium v134 embedded)',
  buildDate: new Date().toISOString(),
  targetDirectory: targetAppDir,
  security: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    dataDirectory: '%APPDATA%\\NEXUS_AI_DATA',
  },
};
fs.writeFileSync(path.join(targetAppDir, 'app-info.json'), JSON.stringify(appInfo, null, 2), 'utf-8');

// Optional Windows Setup / Shortcut installer script
const setupBat = `@echo off
echo ====================================================
echo   NEXUS.AI — Desktop Shortcut Installer
echo ====================================================
set APP_DIR=%~dp0
set EXE_PATH=%APP_DIR%NEXUS_AI.exe
set SHORTCUT_NAME=NEXUS.AI.lnk

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([System.Environment]::GetFolderPath('Desktop'), '%SHORTCUT_NAME%')); $s.TargetPath = '%EXE_PATH%'; $s.WorkingDirectory = '%APP_DIR%'; $s.IconLocation = '%APP_DIR%assets\\icon.png'; $s.Save(); Write-Host 'Desktop shortcut created successfully!'"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $programs = [System.Environment]::GetFolderPath('Programs'); $s = $ws.CreateShortcut([System.IO.Path]::Combine($programs, '%SHORTCUT_NAME%')); $s.TargetPath = '%EXE_PATH%'; $s.WorkingDirectory = '%APP_DIR%'; $s.IconLocation = '%APP_DIR%assets\\icon.png'; $s.Save(); Write-Host 'Start Menu shortcut created successfully!'"

echo.
echo NEXUS.AI installation complete! You can launch NEXUS.AI from your Desktop or Start Menu.
pause
`;
fs.writeFileSync(path.join(targetAppDir, 'Install_NEXUS_AI.bat'), setupBat, 'utf-8');

// 8. Create Distribution ZIP Archive if tar is available
console.log('[6/6] Generating portable ZIP archive: release/NEXUS_AI_Windows_x64.zip...');
const zipFile = path.join(releaseDir, 'NEXUS_AI_Windows_x64.zip');
if (fs.existsSync(zipFile)) {
  fs.unlinkSync(zipFile);
}

try {
  cp.execSync(`tar -a -c -f "${zipFile}" -C "${releaseDir}" NEXUS_AI-win32-x64`, {
    stdio: 'inherit',
  });
  console.log(`      Created release archive: ${zipFile}`);
} catch (err) {
  console.warn('      Could not generate zip via tar, skipping archive creation.');
}

console.log('\n====================================================');
console.log('  NEXUS.AI Windows Build Complete!');
console.log('  Executable: ' + path.join(targetAppDir, 'NEXUS_AI.exe'));
console.log('====================================================\n');
