# NEXUS.AI v2.0.0 Installation and Setup Guide

## System Requirements
- **Operating System:** Windows 10 (Build 19041+) or Windows 11 (64-bit)
- **Processor:** 64-bit Intel / AMD dual-core processor or higher
- **RAM:** 4 GB RAM minimum (8 GB recommended for complex agent workloads)
- **Disk Space:** 500 MB free disk space
- **Network:** Internet access is required only for communicating with remote AI providers (Google Gemini or OpenAI). The application runtime and UI are completely offline-capable.

---

## Installation Options

### Option A: Standard Setup Installer (`NEXUS_AI_2.0.0_Setup.exe`)
1. Download `NEXUS_AI_2.0.0_Setup.exe`.
2. Double-click the installer executable.
3. If prompted by Windows SmartScreen ("Windows protected your PC"):
   - Click **More info**.
   - Click **Run anyway**.
4. The installer will extract application binaries to `%LOCALAPPDATA%\NEXUS_AI` and create Desktop and Start Menu shortcuts.
5. Launch **NEXUS.AI** from your desktop.

### Option B: Single-File Portable Runner (`NEXUS_AI_2.0.0_win_x64.exe`)
1. Download `NEXUS_AI_2.0.0_win_x64.exe` to any folder or USB drive.
2. Double-click to launch directly without system installation.
3. Application files extract to a local temporary sandbox on launch and execute immediately.

### Option C: Portable ZIP Archive (`NEXUS_AI_Windows_x64.zip`)
1. Download and extract `NEXUS_AI_Windows_x64.zip` to your preferred folder (e.g., `D:\Tools\NEXUS_AI`).
2. Run `NEXUS_AI.exe` located inside `NEXUS_AI-win32-x64/`.

---

## First-Run Configuration

### Step 1: Launch Application
Upon launch, NEXUS.AI starts the embedded backend engine on a loopback interface (`http://127.0.0.1:3200` to `3500`) and opens the high-density desktop shell.

### Step 2: Configure Provider Credentials
1. Click the **Setup** gear icon in the 48px left rail.
2. Select your AI provider:
   - **Google Gemini:** Enter your Gemini API key (recommended models: `gemini-2.5-flash`, `gemini-2.5-pro`).
   - **OpenAI:** Enter your OpenAI API key (recommended models: `gpt-4o`, `gpt-4o-mini`, `o1`).
3. Click **Save & Test Connection**.
4. The key is validated in real-time and stored into an AES-256-GCM encrypted vault (`credentials.enc`) in `%LOCALAPPDATA%\NEXUS_AI_DATA`. Keys are never displayed back in plaintext.

### Step 3: Open a Workspace
1. Click the **Code / Workspace** icon in the left rail.
2. Click **Open Workspace** and select your project root folder.
3. The File Explorer will populate with your project structure, while preserving security boundaries preventing access outside the project root.

---

## Uninstallation
To remove NEXUS.AI:
1. Open Windows **Settings** -> **Installed Apps** (or navigate to `%LOCALAPPDATA%\NEXUS_AI`).
2. Run `uninstall.exe`.
3. Choose whether to retain or purge your local encrypted settings and task history (`%LOCALAPPDATA%\NEXUS_AI_DATA`).
4. Shortcuts and binary files will be cleanly removed.
