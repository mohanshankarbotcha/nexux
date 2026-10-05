import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';

export function compileUninstaller(outputExe) {
  if (!fs.existsSync(cscPath)) {
    throw new Error(`C# compiler not found at ${cscPath}`);
  }

  const src = path.resolve(rootDir, 'packages/desktop/installer/Uninstall.cs');
  const icon = path.resolve(rootDir, 'packages/desktop/assets/icon.ico');

  console.log(`Compiling uninstaller -> ${outputExe}`);
  const args = [
    '/nologo',
    '/target:winexe',
    '/platform:x64',
    `/win32icon:${icon}`,
    `/out:${outputExe}`,
    '/r:System.Windows.Forms.dll,System.Drawing.dll',
    src,
  ];

  cp.execFileSync(cscPath, args, { stdio: 'inherit' });
  if (!fs.existsSync(outputExe)) {
    throw new Error(`Failed to produce ${outputExe}`);
  }
  console.log(`Uninstaller compiled successfully: ${outputExe} (${fs.statSync(outputExe).size} bytes)`);
}

export function compileSetupInstaller(zipPayloadPath, uninstallerExePath, outputSetupExe) {
  if (!fs.existsSync(cscPath)) {
    throw new Error(`C# compiler not found at ${cscPath}`);
  }

  const src = path.resolve(rootDir, 'packages/desktop/installer/Setup.cs');
  const icon = path.resolve(rootDir, 'packages/desktop/assets/icon.ico');

  console.log(`Compiling Setup Installer -> ${outputSetupExe}`);
  console.log(`Embedding payload: ${zipPayloadPath} (${(fs.statSync(zipPayloadPath).size / 1024 / 1024).toFixed(1)} MB)...`);

  const args = [
    '/nologo',
    '/target:winexe',
    '/platform:x64',
    `/win32icon:${icon}`,
    `/out:${outputSetupExe}`,
    `/resource:${zipPayloadPath},NEXUS_PAYLOAD`,
    `/resource:${uninstallerExePath},UNINSTALLER_EXE`,
    '/r:System.Windows.Forms.dll,System.Drawing.dll,System.IO.Compression.dll,System.IO.Compression.FileSystem.dll',
    src,
  ];

  cp.execFileSync(cscPath, args, { stdio: 'inherit' });
  if (!fs.existsSync(outputSetupExe)) {
    throw new Error(`Failed to produce ${outputSetupExe}`);
  }
  console.log(`Setup Installer compiled successfully: ${outputSetupExe} (${(fs.statSync(outputSetupExe).size / 1024 / 1024).toFixed(1)} MB)`);
}

export function compilePortableRunner(zipPayloadPath, outputPortableExe) {
  if (!fs.existsSync(cscPath)) {
    throw new Error(`C# compiler not found at ${cscPath}`);
  }

  const src = path.resolve(rootDir, 'packages/desktop/installer/Portable.cs');
  const icon = path.resolve(rootDir, 'packages/desktop/assets/icon.ico');

  console.log(`Compiling Portable Executable -> ${outputPortableExe}`);
  console.log(`Embedding payload into portable runner: ${(fs.statSync(zipPayloadPath).size / 1024 / 1024).toFixed(1)} MB...`);

  const args = [
    '/nologo',
    '/target:winexe',
    '/platform:x64',
    `/win32icon:${icon}`,
    `/out:${outputPortableExe}`,
    `/resource:${zipPayloadPath},NEXUS_PAYLOAD`,
    '/r:System.Windows.Forms.dll,System.Drawing.dll,System.IO.Compression.dll,System.IO.Compression.FileSystem.dll',
    src,
  ];

  cp.execFileSync(cscPath, args, { stdio: 'inherit' });
  if (!fs.existsSync(outputPortableExe)) {
    throw new Error(`Failed to produce ${outputPortableExe}`);
  }
  console.log(`Portable Executable compiled successfully: ${outputPortableExe} (${(fs.statSync(outputPortableExe).size / 1024 / 1024).toFixed(1)} MB)`);
}

// Allow direct CLI execution if needed
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const testUninstaller = path.resolve(rootDir, 'release/test-uninstaller.exe');
  fs.mkdirSync(path.dirname(testUninstaller), { recursive: true });
  compileUninstaller(testUninstaller);
}
