# NEXUS.AI (nexux) — Version 2.0.0

[![Release](https://img.shields.io/badge/release-v2.0.0-0FF0CB.svg)](https://github.com/mohanshankarbotcha/nexux/releases/tag/v2.0.0)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64%20%7C%20Web-blue.svg)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-3178C6.svg)](#)
[![React](https://img.shields.io/badge/React-18.3.1-61DAFB.svg)](#)
[![Electron](https://img.shields.io/badge/Electron-34.5.8-47848F.svg)](#)
[![Node.js](https://img.shields.io/badge/Node.js-24%20%2F%2022%20%2F%2020-339933.svg)](#)
[![Tests](https://img.shields.io/badge/tests-145%2F145%20passing%20(100%25)-brightgreen.svg)](#)
[![Security](https://img.shields.io/badge/security-AES--256--GCM%20Vault%20%7C%20Loopback%20Isolated-success.svg)](#)

> **NEXUS.AI v2.0.0** is an enterprise-hardened, autonomous multi-agent AI coding assistant and workspace platform engineered for desktop and local development. Featuring the Google Stitch V2 Technical Precision interface, 6 specialist autonomous agents, an encrypted local credential vault, strict loopback isolation, zero-config browser access, and real-time truthful telemetry.

---

## 📥 Download & Installation (Windows x64)

Normal PC users do **NOT** need to install Node.js, npm, or Git to run the application.

1. **Download the Installer:**  
   Download [`NEXUS_AI_2.0.0_Setup.exe`](https://github.com/mohanshankarbotcha/nexux/releases/download/v2.0.0/NEXUS_AI_2.0.0_Setup.exe) from [GitHub Releases](https://github.com/mohanshankarbotcha/nexux/releases/tag/v2.0.0).
2. **Run Setup:**  
   Launch `NEXUS_AI_2.0.0_Setup.exe`. The installer creates application files in `%LOCALAPPDATA%\Programs\NEXUS.AI`, adds Desktop and Start Menu shortcuts, and registers standard Windows Add/Remove Programs uninstall support.
3. **Launch NEXUS.AI:**  
   Open NEXUS.AI from your Desktop or Start Menu. The embedded local backend and agent runtime start automatically on loopback `127.0.0.1`.
4. **Configure Your AI Model Provider:**  
   Go to **Settings / Provider Setup** (`Ctrl+4`) and enter your personal **Google Gemini** (`AIza...`) or **OpenAI** (`sk-...`) API key. Credentials are encrypted at rest on your local machine using AES-256-GCM.
5. **Open a Workspace:**  
   Select or create a workspace directory and start coding!

> [!NOTE]
> **Windows SmartScreen Notice:** As a community developer release, the binaries are currently self-published and unsigned. When launching for the first time, Windows SmartScreen may show an "Unknown Publisher" protection notice. Click **"More info"** and then **"Run anyway"** to proceed.

### 🔑 Portable Single-File Executables
Prefer not to run an installer?
- **Standalone Executable:** [`NEXUS_AI_2.0.0_win_x64.exe`](https://github.com/mohanshankarbotcha/nexux/releases/download/v2.0.0/NEXUS_AI_2.0.0_win_x64.exe) (single self-contained executable)
- **Portable ZIP Archive:** [`NEXUS_AI_Windows_x64.zip`](https://github.com/mohanshankarbotcha/nexux/releases/download/v2.0.0/NEXUS_AI_Windows_x64.zip) (extract anywhere and run `NEXUS.AI.exe`)

---

## 🔍 Release Checksums (SHA-256)

All distribution binaries are cryptographically signed with SHA-256 hashes published in [`checksums.txt`](https://github.com/mohanshankarbotcha/nexux/releases/download/v2.0.0/checksums.txt):

| Distribution Artifact | File Size | SHA-256 Cryptographic Checksum |
| :--- | :---: | :--- |
| `NEXUS_AI_2.0.0_Setup.exe` | 112.0 MB | `fd02d375748607388830a348489100baffd3dc50a88f3b21a6dbd4e2b97f7382` |
| `NEXUS_AI_2.0.0_win_x64.exe` | 112.0 MB | `384c33ed4c43681f07b6c3da078e92b9c7bbc79bf7b45c8443695aadf9a45932` |
| `NEXUS_AI_Windows_x64.zip` | 112.0 MB | `e899f18dd6662762ea10b06ac98cbf94a70c49046c4a33a780966d48381b8e9b` |

To verify on Windows PowerShell:
```powershell
Get-FileHash -Algorithm SHA256 .\NEXUS_AI_2.0.0_Setup.exe
```

---

## 🌟 What's New in Version 2.0.0

### 1. Stitch V2 Technical Precision Interface
- **48px Navigation Rail:** Compact, high-density left rail with quick toggles for Chat, Workspace/Code, Telemetry, and Settings.
- **Obsidian Architectural Palette:** Deep obsidian canvas (`#121316`), charcoal cards (`#16181D`), hairline slate borders (`#2D313A`), and agent mint (`#0FF0CB`) telemetry accents.
- **Offline System Typography:** Built with zero external CDN dependencies. Defaults to high-clarity native system fonts (`Times New Roman` display, `Courier Prime` / `Courier New` monospaced code and logs).
- **Dynamic TopBar Health Engine:** Real-time polling indicator connecting to `/api/health`, showing loopback latency and live system status with `Ctrl+K` command launcher.

### 2. Local Security & Vault Hardening
- **AES-256-GCM Credential Vault (`credentials.enc`):** API keys are encrypted at rest with PBKDF2/DPAPI machine-bound key derivation. Plaintext `credentials.json` files are automatically migrated and securely shredded.
- **Loopback Isolation (`127.0.0.1`):** Server explicitly binds to loopback interfaces only. Remote interface binding (`0.0.0.0`) is strictly prohibited.
- **Per-Session API Token Authentication (`X-Nexus-Token`):** All local API endpoints and SSE streams enforce cryptographic tokens validated in constant time via `crypto.timingSafeEqual`.
- **Zero-Config Browser Bootstrap:** When accessing the server in Chrome, Edge, or Firefox at `http://localhost:3000`, the server injects the session token into the served SPA headers, preventing 401 Unauthorized errors without compromising origin boundaries.
- **Path Traversal & Terminal Guard:** Blocks directory escapes (`../`), NTFS Alternate Data Streams (`:stream`), UNC paths, and forbidden destructive shell commands.
- **Electron Sandboxing:** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, and strict `will-navigate` boundary blockers.

### 3. Truthful Telemetry & Multi-Agent Architecture
- **Zero Synthetic Metrics:** Synthetic placeholder counters (`NEX-4091`, `84M tokens`) have been completely replaced with live queries from the local usage ledger.
- **Explicit Provider Selection:** No silent failovers. Requests are executed strictly against the user's selected provider (OpenAI or Google Gemini) with clear model attribution.
- **15-Minute Preflight Cache TTL:** Fast-path and health validations cache credentials for 15 minutes, avoiding redundant upstream pings.
- **Crash Recovery & Clean Cancellation:** Interrupted server processes gracefully flag tasks with `SERVER_RESTART`, and responsive abort controllers ensure clean process-tree termination.

---

## 🧭 Core Application Workspaces

NEXUS.AI organizes developer workflows into four persistent, high-density views:

1. **CHAT (`Ctrl+1`):** Coding agent conversation interface with structured stage pipelines (`Coordinator`, `Explorer`, `Planner`, `Coder`, `Debugger`, `Reviewer`), live thought streams, tool activity feed, and diff inspector.
2. **WORKSPACE / CODE (`Ctrl+2`):** IDE workspace with interactive directory tree, multi-tab code editor, syntax styling, and resizable problem dock.
3. **TELEMETRY & STATS (`Ctrl+3`):** Developer telemetry tracking real token economics, model cost breakdowns, and agent usage metrics from the local ledger.
4. **PROVIDER SETUP (`Ctrl+4`):** Secure credential management with key masking, AES-256-GCM vault status, and model routing configuration.

---

## 🛠️ Developer & Build Instructions

### Prerequisites
- Node.js v20+ / v22 / v24
- npm 10+ / 11+
- Windows 10/11 x64 (for Windows desktop packaging)

### Building from Source
```bash
# Clone the repository
git clone https://github.com/mohanshankarbotcha/nexux.git
cd nexux

# Install monorepo dependencies
npm install

# Compile all workspace packages (@nexus/core, @nexus/server, @nexus/client, @nexus/desktop)
npm run build

# Run monorepo test suites (145/145 tests passing)
npm test

# Package Windows desktop installer & portable binaries
npm run package:desktop
```

### Running the Application Locally

#### Production Integrated Server (Single Port)
Serves both the backend REST API and the compiled Stitch V2 React SPA:
```bash
node packages/server/dist/index.js
```
Open **`http://localhost:3000`** or **`http://127.0.0.1:3000`** in your browser.

#### Development Mode (With Hot Module Replacement)
```bash
# Terminal 1: Backend server
npm run dev:server

# Terminal 2: Vite React client (proxies /api to port 3000)
npm run dev:client
```
Open **`http://localhost:5173`** for instant frontend hot reload.

#### Desktop Electron Shell
```bash
npm run dev:desktop
```

---

## 📁 Monorepo Architecture

```
nexux/
├── packages/
│   ├── core/       # Shared types, error definitions, pricing models, path guards, sanitizer
│   ├── server/     # Express API, multi-agent orchestrator, providers (Gemini/OpenAI), vault
│   ├── client/     # React 18, Tailwind CSS, Stitch V2 components, monaco-ready editors
│   └── desktop/    # Electron 34 main/preload processes, server lifecycle manager, installer
├── release/        # Packaged production distribution binaries (v2.0.0)
└── docs/           # Architecture specs, security posture, and release evidence reports
```

---

## 🧪 Test Verification & Quality Gates

| Package | Test Count | Status | Description |
| :--- | :---: | :---: | :--- |
| `@nexus/core` | 6 / 6 | **PASS** | Path guard, secret sanitization, cost calculations, error formatting |
| `@nexus/server` | 133 / 133 | **PASS** | Agent orchestration, providers, vault encryption, terminal tools, workspace API |
| `@nexus/desktop` | 6 / 6 | **PASS** | Process lifecycle, server manager, port conflict handling, data persistence |
| **Total** | **145 / 145** | **PASS (100%)** | All unit, security, and integration suites green |

---

## 📄 License & Community Support

Distributed under the **MIT License**. Created by [Mohan Shankar Botcha](https://github.com/mohanshankarbotcha).

For bug reports, feature requests, or community discussions, please visit the [NEXUS GitHub Issues](https://github.com/mohanshankarbotcha/nexux/issues) tracker.
