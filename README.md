# NEXUS.AI (nexux)

[![Platform](https://img.shields.io/badge/platform-Windows%20x64%20%7C%20Web-blue.svg)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-3178C6.svg)](#)
[![React](https://img.shields.io/badge/React-18.3.1-61DAFB.svg)](#)
[![Electron](https://img.shields.io/badge/Electron-34.5.8-47848F.svg)](#)
[![Node.js](https://img.shields.io/badge/Node.js-24%20%2F%2022%20%2F%2020-339933.svg)](#)
[![Tests](https://img.shields.io/badge/tests-99%2F99%20passing%20(100%25)-brightgreen.svg)](#)

> **NEXUS.AI** is an autonomous multi-agent AI coding assistant and workspace platform engineered for local desktop and web development. Equipped with 6 specialist agents, repository exploration, dynamic planning, precise file editing, verification tool execution, and real-time usage telemetry.

---

## 🌟 Key Architecture & Capabilities

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                     NEXUS.AI Desktop Application (Electron)             │
│                                                                         │
│  [ React 18 SPA Frontend ]                                              │
│  - File Tree & Explorer                                                 │
│  - Code Editor & Diff Viewer                                            │
│  - Multi-Agent Orchestration Panel & Live SSE Activity Stream           │
│  - Terminal Dock & Problem Diagnostics                                  │
│  - Usage & Cost Intelligence Dashboard                                  │
│       │                                                                 │
│       ▼ HTTP / SSE (Loopback 127.0.0.1)                                 │
│  [ Express 4 Backend Server ]                                           │
│  - Coordinator, Explorer, Planner, Coder, Debugger, Reviewer Agents      │
│  - Model Router (OpenAI GPT-4o / Google Gemini 2.5)                     │
│  - Tool Registry: read_file, write_file, edit_file, delete_file,        │
│                   terminal, git_status, git_diff                        │
│  - Context Engine with Bounded LRU Cache & mtime Invalidation           │
│  - Path Guard & Symlink Escape Prevention                               │
│  - Persistent Storage: %APPDATA%\NEXUS_AI_DATA (mode 0o600)             │
└─────────────────────────────────────────────────────────────────────────┘
```

### 🤖 6 Specialist Autonomous Agents
1. **Coordinator Agent:** Analyzes task complexity, orchestrates execution pipelines, evaluates stage transitions, and ensures task completion.
2. **Explorer Agent:** Scans project directories, detects language frameworks, searches symbols, and maps workspace topology.
3. **Planner Agent:** Formulates structured, step-by-step implementation plans with targeted files and verification checkpoints.
4. **Coder Agent:** Executes targeted code changes using precise line replacements and guarded file operations.
5. **Debugger Agent:** Locates test failures, diagnoses compiler/runtime errors, and applies targeted automated fixes.
6. **Reviewer Agent:** Inspects git diffs against instructions, verifies lint/typecheck passes, and uses fast-path evaluation on zero-modification tasks.

### 🛡️ Safety & Zero-Data-Loss Model
- **Filesystem Boundary Protection:** Strictly blocks path traversal (`../`) and enforces canonical workspace boundaries.
- **Overwrite Guards:** `write_file` refuses to overwrite without explicit authorization; `delete_file` blocks workspace root deletion.
- **Terminal Blacklist:** Blocks dangerous commands (`rm -rf /`, `rmdir /s /q c:\`, `format`, remote `git push`, system reboots).
- **Process Lifecycle Safety:** Hard execution timeouts (30s) and buffer limits (50k chars).
- **Secret Scrubbing:** Redacts API keys (`sk-••••••••1a2b`, `AIza••••••••8899`) from all logs, telemetry, and error traces. Stored in `%APPDATA%\NEXUS_AI_DATA\credentials.json` (mode `0o600`).
- **Crash Recovery:** Tasks interrupted by application shutdown are automatically caught and recovered upon relaunch.

---

## 📦 Project Structure

```text
nexux/
├── packages/
│   ├── core/         # Unified data models, error handling, security guards, LRU cache
│   ├── server/       # Express REST/SSE server, multi-agent engine, tools, storage
│   ├── client/       # React 18, Vite 6, Tailwind CSS desktop & web UI
│   └── desktop/      # Electron main process, preload IPC bridge, Windows server manager
├── release/          # Packaged standalone distribution (NEXUS_AI.exe)
├── scripts/          # Packaging & automated verification suites
└── package.json      # Monorepo workspaces manifest
```

---

## 🚀 Quickstart & Development

### Prerequisites
- Node.js (v20+ recommended)
- Git (v2.30+)
- Windows 10/11 x64 (for standalone desktop binary)

### Installation
```bash
# Clone the repository
git clone https://github.com/mohanshankarbotcha/nexux.git
cd nexux

# Install monorepo dependencies
npm install

# Build all packages
npm run build
```

### Running Locally
```bash
# Start backend server (http://localhost:3000)
npm run dev:server

# Start frontend dev server (http://localhost:5173)
npm run dev:client

# Start desktop app in development
npm run dev:desktop
```

---

## 🪟 Windows Desktop Packaging

NEXUS.AI packages into a completely self-contained Windows executable bundling its own Chromium and Node.js runtimes:

```bash
# Package standalone Windows desktop app
npm run package:desktop
```

The output will be created in:
- `release/NEXUS_AI-win32-x64/NEXUS_AI.exe` (Standalone executable — zero Node.js installation required)
- `release/NEXUS_AI-win32-x64/Install_NEXUS_AI.bat` (Desktop & Start Menu shortcut installer)
- `release/NEXUS_AI_Windows_x64.zip` (Portable compressed distribution archive)

---

## 🧪 Testing & Quality Gates

```bash
# Run all 99 automated tests across core, server, and desktop
npm test

# Run full TypeScript typecheck
npm run typecheck

# Run 10-step packaged binary verification
node packages/desktop/scripts/verify-packaged-release.mjs

# Run 19-step black-box end-to-end User Acceptance Test
node packages/desktop/scripts/final-uat-test.mjs
```

---

## 📄 License

MIT License. Designed and engineered for autonomous software development.
