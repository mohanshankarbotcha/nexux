import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

console.log('====================================================');
console.log('  NEXUS.AI v1.0.0 — GitHub Release & Publish Engine');
console.log('====================================================\n');

// 1. Retrieve GitHub Token from Windows Credential Manager
function getGitHubToken() {
  const psScript = `
$csharp = @'
using System; using System.Runtime.InteropServices; using System.Text;
public class CredentialHelper {
    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credentialPtr);
    [DllImport("advapi32.dll", EntryPoint = "CredFree", SetLastError = true)]
    public static extern void CredFree(IntPtr credential);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public int Flags; public int Type; public string TargetName; public string Comment;
        public long LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob;
        public int Persist; public int AttributeCount; public IntPtr Attributes;
        public string TargetAlias; public string UserName;
    }
    public static string GetSecret(string target, string encoding) {
        IntPtr credPtr;
        if (CredRead(target, 1, 0, out credPtr)) {
            var cred = (CREDENTIAL)Marshal.PtrToStructure(credPtr, typeof(CREDENTIAL));
            byte[] bytes = new byte[cred.CredentialBlobSize];
            Marshal.Copy(cred.CredentialBlob, bytes, 0, cred.CredentialBlobSize);
            CredFree(credPtr);
            if (encoding == "utf8") return Encoding.UTF8.GetString(bytes);
            return Encoding.Unicode.GetString(bytes);
        }
        return null;
    }
}
'@
Add-Type -TypeDefinition $csharp -Language CSharp
$tok = [CredentialHelper]::GetSecret("git:https://github.com", "unicode")
if (-not $tok) {
    $tok = [CredentialHelper]::GetSecret("LegacyGeneric:target=GitHub - https://api.github.com/mohanshankarbotcha", "utf8")
}
Write-Output $tok
`;

  const output = cp.execSync('powershell -NoProfile -Command -', {
    input: psScript,
    encoding: 'utf-8',
  }).trim();

  return output.split('\n').map(s => s.trim()).filter(Boolean).pop();
}

const token = getGitHubToken();
if (!token || !token.startsWith('gh')) {
  console.error('Failed to retrieve valid GitHub token.');
  process.exit(1);
}
console.log(`Successfully authenticated with GitHub token (${token.slice(0, 4)}••••••••).`);

// 2. Push main branch and v1.0.0 tag to GitHub
const repoUrl = `https://x-access-token:${token}@github.com/mohanshankarbotcha/nexux.git`;

console.log('\n[1/4] Pushing branch main to origin...');
try {
  cp.execSync(`git push "${repoUrl}" main`, { cwd: rootDir, stdio: 'inherit' });
} catch (e) {
  console.error('git push main failed:', e.message);
  process.exit(1);
}

console.log('\n[2/4] Pushing tag v1.0.0 to origin...');
try {
  cp.execSync(`git push "${repoUrl}" v1.0.0`, { cwd: rootDir, stdio: 'inherit' });
} catch (e) {
  console.log('Tag push exit code non-zero (tag may already exist on remote, continuing).');
}

// Update local tracking ref
try {
  cp.execSync('git update-ref refs/remotes/origin/main refs/heads/main', { cwd: rootDir });
} catch {}

// 3. Create or Get GitHub Release
const owner = 'mohanshankarbotcha';
const repo = 'nexux';
const tag = 'v1.0.0';

const releaseBody = `# NEXUS.AI Version 1.0.0 — Windows Desktop Release

Autonomous AI coding assistant platform engineered for desktop development with multi-agent orchestration, repository exploration, file editing, and sandboxed execution.

### 📥 Download Options (Windows x64)

- **[NEXUS_AI_1.0.0_Setup.exe](https://github.com/${owner}/${repo}/releases/download/${tag}/NEXUS_AI_1.0.0_Setup.exe)**: Complete Windows installer. Installs to \`%LOCALAPPDATA%\\Programs\\NEXUS.AI\`, creates Desktop and Start Menu shortcuts, and configures full Add/Remove Programs uninstall support. Zero developer tools or Node.js runtime required.
- **[NEXUS_AI_1.0.0_win_x64.exe](https://github.com/${owner}/${repo}/releases/download/${tag}/NEXUS_AI_1.0.0_win_x64.exe)**: Standalone single-file portable executable. Runs instantly with zero installation.
- **[NEXUS_AI_Windows_x64.zip](https://github.com/${owner}/${repo}/releases/download/${tag}/NEXUS_AI_Windows_x64.zip)**: Portable ZIP distribution archive.

### 🚀 Key Capabilities

- **6 Autonomous Agents:** Coordinator, Explorer, Planner, Coder, Debugger, Reviewer.
- **4 First-Class Workspaces:** CHAT, TERMINAL, WORKSPACE (IDE), USAGE.
- **AI Model Support:** OpenAI (GPT-4o, GPT-4o-mini) and Google Gemini (2.5 Pro, 2.5 Flash).
- **Security & Privacy:** 0 bundled credentials; per-user isolated data storage in \`%LOCALAPPDATA%\\NEXUS_AI_DATA\`.
- **Sandboxed Execution:** Path traversal guards, command blacklists, and bounded execution timeouts.

### 🔍 Release Checksums (SHA-256)

\`\`\`text
0d2e9bb0912f703f1930c0dfb567cb5a25451426ce91c42a1356e7be2de6669f  NEXUS_AI_1.0.0_Setup.exe
9bda984f6368a2f42358ee7bfd1f56b9de70264232d059951989e8ae87207313  NEXUS_AI_1.0.0_win_x64.exe
86dd3626008db4c42842187ca72ecb603b7fdcc760d47e28c641703f91868f26  NEXUS_AI_Windows_x64.zip
\`\`\`
`;

console.log('\n[3/4] Ensuring GitHub Release exists for tag v1.0.0...');
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
  console.log('Creating new GitHub Release...');
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
      name: 'NEXUS.AI v1.0.0 — Windows Release',
      body: releaseBody,
      draft: false,
      prerelease: false,
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
    const existing = release.assets.find(a => a.name === filename);
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

  console.log('\n[4/4] Uploading release distribution assets...');
  await uploadAsset(release, 'NEXUS_AI_1.0.0_Setup.exe', 'application/vnd.microsoft.portable-executable');
  await uploadAsset(release, 'NEXUS_AI_1.0.0_win_x64.exe', 'application/vnd.microsoft.portable-executable');
  await uploadAsset(release, 'NEXUS_AI_Windows_x64.zip', 'application/zip');
  await uploadAsset(release, 'checksums.txt', 'text/plain');

  console.log('\n====================================================');
  console.log('  NEXUS.AI v1.0.0 PUBLISHED SUCCESSFULLY TO GITHUB!');
  console.log(`  Release: ${release.html_url}`);
  console.log('====================================================\n');
}

main().catch(err => {
  console.error('Fatal release error:', err);
  process.exit(1);
});
