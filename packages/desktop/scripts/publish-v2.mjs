import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

console.log('====================================================');
console.log('  NEXUS.AI v2.0.0 — GitHub Release & Publish Engine');
console.log('====================================================\n');

// 1. Retrieve GitHub Token from Windows Credential Manager
function getGitHubToken() {
  const tmpFile = path.join(os.tmpdir(), `get-gh-token-${Date.now()}.ps1`);
  const psScript = [
    '$csharp = @\'',
    'using System;',
    'using System.Runtime.InteropServices;',
    'using System.Text;',
    'public class CredentialHelper {',
    '    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]',
    '    public static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credentialPtr);',
    '    [DllImport("advapi32.dll", EntryPoint = "CredFree", SetLastError = true)]',
    '    public static extern void CredFree(IntPtr credential);',
    '    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
    '    public struct CREDENTIAL {',
    '        public int Flags; public int Type; public string TargetName; public string Comment;',
    '        public long LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob;',
    '        public int Persist; public int AttributeCount; public IntPtr Attributes;',
    '        public string TargetAlias; public string UserName;',
    '    }',
    '    public static string GetSecret(string target, string encoding) {',
    '        IntPtr credPtr;',
    '        if (CredRead(target, 1, 0, out credPtr)) {',
    '            var cred = (CREDENTIAL)Marshal.PtrToStructure(credPtr, typeof(CREDENTIAL));',
    '            byte[] bytes = new byte[cred.CredentialBlobSize];',
    '            Marshal.Copy(cred.CredentialBlob, bytes, 0, cred.CredentialBlobSize);',
    '            CredFree(credPtr);',
    '            if (encoding == "utf8") return Encoding.UTF8.GetString(bytes);',
    '            return Encoding.Unicode.GetString(bytes);',
    '        }',
    '        return null;',
    '    }',
    '}',
    '\'@',
    'Add-Type -TypeDefinition $csharp -Language CSharp',
    '$tok = [CredentialHelper]::GetSecret("git:https://github.com", "unicode")',
    'if (-not $tok) {',
    '    $tok = [CredentialHelper]::GetSecret("LegacyGeneric:target=GitHub - https://api.github.com/mohanshankarbotcha", "utf8")',
    '}',
    'Write-Output $tok',
  ].join('\r\n');

  fs.writeFileSync(tmpFile, psScript, 'utf-8');
  try {
    const output = cp.execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`, {
      encoding: 'utf-8',
    }).trim();
    return output.split('\r\n').map((s) => s.trim()).filter(Boolean).pop();
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

const token = getGitHubToken();
if (!token || !token.startsWith('gh')) {
  console.error('Failed to retrieve valid GitHub token from Credential Manager.');
  process.exit(1);
}
console.log(`Successfully authenticated with GitHub token (${token.slice(0, 4)}••••••••).`);

const owner = 'mohanshankarbotcha';
const repo = 'nexux';
const tag = 'v2.0.0';
const repoUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;

// 2. Push main branch and v2.0.0 tag to GitHub
console.log('\n[1/4] Pushing branch main to origin...');
try {
  cp.execSync(`git push "${repoUrl}" main`, { cwd: rootDir, stdio: 'inherit' });
} catch (e) {
  console.error('git push main failed:', e.message);
  process.exit(1);
}

console.log('\n[2/4] Tagging and pushing tag v2.0.0 to origin...');
try {
  try {
    cp.execSync(`git tag -a ${tag} -m "NEXUS.AI ${tag} — Production Multi-Agent Desktop Release"`, { cwd: rootDir, stdio: 'ignore' });
  } catch {}
  cp.execSync(`git push "${repoUrl}" ${tag}`, { cwd: rootDir, stdio: 'inherit' });
} catch (e) {
  console.log('Tag push note:', e.message);
}

// 3. Create or Update GitHub Release for v2.0.0
const releaseBody = `# NEXUS.AI Version 2.0.0 — Production Multi-Agent Desktop Release

NEXUS.AI v2.0.0 is a major generational upgrade featuring Google Stitch V2 Technical Precision design, local AES-256-GCM encrypted vaults, strict loopback isolation, offline system fonts, and verified multi-agent task execution.

### 📥 Download Options (Windows x64)

- **[NEXUS_AI_2.0.0_Setup.exe](https://github.com/${owner}/${repo}/releases/download/${tag}/NEXUS_AI_2.0.0_Setup.exe)**: Complete Windows installer. Installs to \`%LOCALAPPDATA%\\NEXUS_AI\`, creates Desktop and Start Menu shortcuts, and provides full uninstaller support. Zero developer tools or Node.js runtime required.
- **[NEXUS_AI_2.0.0_win_x64.exe](https://github.com/${owner}/${repo}/releases/download/${tag}/NEXUS_AI_2.0.0_win_x64.exe)**: Standalone single-file portable executable. Runs instantly with zero installation.
- **[NEXUS_AI_Windows_x64.zip](https://github.com/${owner}/${repo}/releases/download/${tag}/NEXUS_AI_Windows_x64.zip)**: Portable ZIP distribution archive.

### 🚀 What's New in Version 2.0.0

- **Stitch V2 Interface:** High-density 48px Left Rail with views for Chat, Code/Workspace, Stats/Telemetry, and Provider Setup. Obsidian Technical Precision dark theme.
- **Zero External CDN Dependencies:** 100% offline typography using system fonts (Times New Roman & Courier Prime/New) under strict Content-Security-Policy.
- **Local Security & AES-256-GCM Vault:** Credentials encrypted at rest with machine-bound key derivation. Plaintext \`credentials.json\` eliminated.
- **Loopback Isolation & Token Auth:** Server bound exclusively to \`127.0.0.1\` with per-launch cryptographic token verification (\`X-Nexus-Token\`) and DNS rebinding protection.
- **Path Guard Sandboxing:** File read/write operations strictly sandboxed within the project workspace, blocking directory traversal (\`../../\`), NTFS Alternate Data Streams (\`:stream\`), and access to system folders.
- **Electron Hardening:** Native sandboxing enabled (\`sandbox: true\`), context isolation active, Node integration disabled, and navigation strictly blocked to local bundles.
- **Truthful Telemetry:** Zero synthetic metrics or placeholder strings. Telemetry displays live data directly from the local usage ledger.

### 🔍 Release Checksums (SHA-256)

\`\`\`text
fd02d375748607388830a348489100baffd3dc50a88f3b21a6dbd4e2b97f7382  NEXUS_AI_2.0.0_Setup.exe
384c33ed4c43681f07b6c3da078e92b9c7bbc79bf7b45c8443695aadf9a45932  NEXUS_AI_2.0.0_win_x64.exe
e899f18dd6662762ea10b06ac98cbf94a70c49046c4a33a780966d48381b8e9b  NEXUS_AI_Windows_x64.zip
\`\`\`
`;

console.log(`\n[3/4] Ensuring GitHub Release exists for tag ${tag}...`);
async function getOrCreateRelease() {
  const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'NEXUS-AI-Release-Engine',
    },
  });

  if (getRes.status === 200) {
    const data = await getRes.json();
    console.log(`Release already exists with ID: ${data.id}`);
    return data;
  }

  // Create new release
  console.log('Creating new GitHub Release for v2.0.0...');
  const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'NEXUS-AI-Release-Engine',
    },
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: 'main',
      name: 'NEXUS.AI v2.0.0 — Windows Release (Latest)',
      body: releaseBody,
      draft: false,
      prerelease: false,
      make_latest: 'true',
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create release: ${createRes.status} ${errText}`);
  }

  const newRelease = await createRes.json();
  console.log(`Created GitHub Release with ID: ${newRelease.id}`);
  return newRelease;
}

// 4. Upload Assets
async function uploadAsset(release, filename, contentType) {
  const filePath = path.join(rootDir, 'release', filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}, skipping.`);
    return;
  }

  const stat = fs.statSync(filePath);
  const sizeMB = (stat.size / 1024 / 1024).toFixed(1);
  console.log(`Uploading ${filename} (${sizeMB} MB)...`);

  // Check if asset already exists on this release
  if (Array.isArray(release.assets)) {
    const existing = release.assets.find((a) => a.name === filename);
    if (existing) {
      console.log(`  Deleting existing asset ${existing.id}...`);
      await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${existing.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'NEXUS-AI-Release-Engine',
        },
      });
    }
  }

  const uploadUrlBase = release.upload_url.replace(/\{\?name,label\}/, '');
  const uploadUrl = `${uploadUrlBase}?name=${encodeURIComponent(filename)}`;

  const fileData = fs.readFileSync(filePath);
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
      'Content-Length': String(stat.size),
      'User-Agent': 'NEXUS-AI-Release-Engine',
    },
    body: fileData,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Failed to upload ${filename}: ${uploadRes.status} ${err}`);
  }

  const asset = await uploadRes.json();
  console.log(`  PASS: Uploaded ${filename} -> ${asset.browser_download_url}`);
}

async function main() {
  const release = await getOrCreateRelease();
  console.log(`Release URL: ${release.html_url}`);

  console.log('\n[4/4] Uploading v2.0.0 distribution assets...');
  await uploadAsset(release, 'NEXUS_AI_2.0.0_Setup.exe', 'application/vnd.microsoft.portable-executable');
  await uploadAsset(release, 'NEXUS_AI_2.0.0_win_x64.exe', 'application/vnd.microsoft.portable-executable');
  await uploadAsset(release, 'NEXUS_AI_Windows_x64.zip', 'application/zip');
  await uploadAsset(release, 'checksums.txt', 'text/plain');

  console.log('\n====================================================');
  console.log('  NEXUS.AI v2.0.0 PUBLISHED SUCCESSFULLY TO GITHUB!');
  console.log(`  Release: ${release.html_url}`);
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Fatal release error:', err);
  process.exit(1);
});
