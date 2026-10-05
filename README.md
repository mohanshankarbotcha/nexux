# NEXUS.AI (nexux) — Version 1.0.0

[![Release](https://img.shields.io/badge/release-v1.0.0-blue.svg)](https://github.com/mohanshankarbotcha/nexux/releases/tag/v1.0.0)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64%20%7C%20Web-blue.svg)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-3178C6.svg)](#)
[![React](https://img.shields.io/badge/React-18.3.1-61DAFB.svg)](#)
[![Electron](https://img.shields.io/badge/Electron-34.5.8-47848F.svg)](#)
[![Node.js](https://img.shields.io/badge/Node.js-24%20%2F%2022%20%2F%2020-339933.svg)](#)
[![Tests](https://img.shields.io/badge/tests-99%2F99%20passing%20(100%25)-brightgreen.svg)](#)

> **NEXUS.AI** is an autonomous multi-agent AI coding assistant and workspace platform engineered for desktop and local development. Equipped with 6 specialist autonomous agents, repository exploration, dynamic planning, precise file editing, verification tool execution, and real-time usage telemetry.

---

## 📥 Download & Installation (Windows x64)

Normal PC users do **NOT** need to install Node.js, npm, or Git to run the application.

1. **Download the Installer:**
   Download [`NEXUS_AI_1.0.0_Setup.exe`](https://github.com/mohanshankarbotcha/nexux/releases/download/v1.0.0/NEXUS_AI_1.0.0_Setup.exe) from [GitHub Releases](https://github.com/mohanshankarbotcha/nexux/releases/tag/v1.0.0).
2. **Run Setup:**
   Launch `NEXUS_AI_1.0.0_Setup.exe`. The installer creates application files in `%LOCALAPPDATA%\Programs\NEXUS.AI`, adds Desktop and Start Menu shortcuts, and registers standard Windows Add/Remove Programs uninstall support.
3. **Launch NEXUS.AI:**
   Open NEXUS.AI from your Desktop or Start Menu. The embedded local backend and agent runtime start automatically on loopback `127.0.0.1`.
4. **Configure Your AI Model Provider:**
   Go to **Settings / Provider Setup** and enter your personal **OpenAI** (`sk-...`) or **Google Gemini** (`AIza...`) API key. Zero credentials are ever bundled with the installer.
5. **Open a Workspace:**
   Select or create a workspace directory and start coding!

### 🔑 Portable Single-File Executable
Prefer not to install? Download [`NEXUS_AI_1.0.0_win_x64.exe`](https://github.com/mohanshankarbotcha/nexux/releases/download/v1.0.0/NEXUS_AI_1.0.0_win_x64.exe) or [`NEXUS_AI_Windows_x64.zip`](https://github.com/mohanshankarbotcha/nexux/releases/download/v1.0.0/NEXUS_AI_Windows_x64.zip) for instant, zero-install portable execution.

---

## 🔒 Security & Data Privacy Model

- **Zero Bundled API Keys:** NEXUS.AI ships with 0 bundled credentials. All AI provider keys are provided by the user at runtime.
- **Per-User Isolated Storage:** User state, encrypted API credentials, sessions, and task logs are stored in `%LOCALAPPDATA%\NEXUS_AI_DATA` (mode `0o600`), isolated outside installation paths and preserved across updates and uninstallation.
- **Filesystem Boundary Guard:** Enforces canonical workspace root boundaries and blocks path traversal (`../`) and outside symlink escapes.
- **Terminal Safety Guard:** Sandboxed workspace execution blocks dangerous commands (`rm -rf /`, `format`, `rmdir /s /q c:\`, remote `git push`, system reboot).

---

## 🧭 Core Application Workspace

NEXUS.AI organizes developer workflows into four persistent, first-class workspaces:

1. **CHAT (`Ctrl+1`):** Coding agent conversation interface with structured stage pipelines (`Coordinator`, `Explorer`, `Planner`, `Coder`, `Debugger`, `Reviewer`), live thought streams, tool activity feed, and diff inspector.
2. **TERMINAL (`Ctrl+2`):** Multi-tab developer shell with command history, real workspace execution, exit codes, and process outputs.
3. **WORKSPACE (`Ctrl+3`):** IDE workspace with interactive directory tree, multi-tab code editor, syntax styling, and resizable problem dock.
4. **USAGE (`Ctrl+4`):** Developer telemetry tracking token economics, model cost breakdowns, and agent usage metrics.

---

## 🛠️ Developer & Build Instructions

### Prerequisites
- Node.js v20+ / v22 / v24
- npm 10+ / 11+
- Windows 10/11 x64 (for Windows packaging)

### Building from Source
```bash
# Clone the repository
git clone https://github.com/mohanshankarbotcha/nexux.git
cd nexux

# Install monorepo dependencies
npm install

# Compile all workspace packages (core, server, client, desktop)
npm run build

# Run comprehensive test suites
npm test

# Package Windows desktop installer & portable executable
npm run package:desktop
```

Build outputs are saved to `release/`:
- `release/NEXUS_AI_1.0.0_Setup.exe` (Windows GUI installer)
- `release/NEXUS_AI_1.0.0_win_x64.exe` (Single-file portable runner)
- `release/NEXUS_AI_Windows_x64.zip` (Portable ZIP archive)
- `release/checksums.txt` (SHA-256 integrity checksums)

---

## 🔍 Release Checksums (SHA-256)

| Release Artifact | SHA-256 Checksum |
| :--- | :--- |
| `NEXUS_AI_1.0.0_Setup.exe` | `0d2e9bb0912f703f1930c0dfb567cb5a25451426ce91c42a1356e7be2de6669f` |
| `NEXUS_AI_1.0.0_win_x64.exe` | `9bda984f6368a2f42358ee7bfd1f56b9de70264232d059951989e8ae87207313` |
| `NEXUS_AI_Windows_x64.zip` | `86dd3626008db4c42842187ca72ecb603b7fdcc760d47e28c641703f91868f26` |

---

## 📄 License

MIT License. Designed and engineered for autonomous software development.
