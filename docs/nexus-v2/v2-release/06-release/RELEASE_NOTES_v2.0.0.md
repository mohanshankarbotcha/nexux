# NEXUS.AI v2.0.0 Release Notes

**Release Date:** October 27, 2026  
**Target Platform:** Windows 10 / Windows 11 (x64)  
**Binary Integrity:** SHA-256 Verified  
**Signing Status:** Unsigned (Community / Developer Release — See SmartScreen Guide)

---

## Overview
NEXUS.AI v2.0.0 is a major generational upgrade to the autonomous multi-agent developer environment. Built on top of Google Stitch V2 Technical Precision design specifications and an enterprise-grade hardened core, v2.0.0 delivers offline resilience, local encrypted credential vaults, strict loopback isolation, and transparent autonomous task execution.

---

## Key Highlights & What's New in V2

### 1. Stitch V2 Technical Precision Interface
- **48px Navigation Rail:** High-density left rail with direct views for Chat, Code/Workspace, Stats/Telemetry, and Provider Setup.
- **Unified Technical Precision Palette:** Deep obsidian canvas (`#121316`), charcoal panels (`#16181D`), subtle hairline borders (`#2D313A`), and agent mint (`#0FF0CB`) telemetry accents.
- **Offline System Typography:** Display and UI headers default to `Times New Roman` with code/logs bound to `Courier Prime` / `Courier New`, eliminating third-party CDN font dependencies.
- **Dynamic Operational Indicator:** TopBar real-time status dynamically evaluates backend loopback health (`/api/health`) with `Ctrl+K` command launcher.

### 2. Local Security & Vault Hardening
- **AES-256-GCM Vault (`credentials.enc`):** API keys are encrypted at rest with machine- and user-bound key derivation. Plaintext `credentials.json` files are automatically migrated and scrubbed.
- **Strict Loopback Binding (127.0.0.1):** Server explicitly refuses connections from remote network interfaces (`0.0.0.0` prohibited).
- **Per-Session API Authentication (`X-Nexus-Token`):** All local API endpoints and SSE event streams require cryptographic tokens validated via constant-time comparison (`crypto.timingSafeEqual`).
- **Path Traversal Guard:** Prevents unauthorized directory escape, NTFS Alternate Data Streams (`:stream`), UNC paths, and access to protected Windows system folders (`C:\Windows`, `C:\Program Files`).
- **Electron Sandboxing:** Context isolation (`contextIsolation: true`), node integration disabled (`nodeIntegration: false`), native sandboxing enabled (`sandbox: true`), and strict `will-navigate` boundary blockers.

### 3. Truthful Telemetry & Multi-Agent Engine
- **No Fictional Metrics:** Removed all placeholder strings and synthetic sample numbers (`NEX-4091`, `84M tokens`, `p95 192ms`). Telemetry displays live data from the local usage ledger.
- **Explicit Provider Selection:** Silent automatic failovers are strictly rejected. The engine explicitly attributes requests and costs to the user-selected provider and model.
- **Server Crash Recovery:** In the event of an unexpected termination or forced shutdown, interrupted tasks automatically transition to `failed` with code `SERVER_RESTART`, preserving workspace and session integrity.
- **Idempotent Task Cancellation:** Responsive abort signals cleanly terminate child processes and active model streams without false error states.

---

## Shipped Artifacts & SHA-256 Checksums

| Artifact | File Size | SHA-256 Checksum |
|:---|:---:|:---|
| `NEXUS_AI_2.0.0_Setup.exe` | 112.0 MB | `816b75a4231020ae69f853225587f0be24c7bffea0b1927ca43596a5872095b5` |
| `NEXUS_AI_2.0.0_win_x64.exe` | 112.0 MB | `12baebbc9e2c0e13038d4a4a95c3f9a7e7dfdfd0bd71795f7d5883f0d0236401` |
| `NEXUS_AI_Windows_x64.zip` | 112.0 MB | `3e3fdd0b632243542a089a3481c24b7fadf01a752bc11bab8f6e8ca85ac8c8f7` |

---

## Known Limitations
1. **Windows SmartScreen Prompt:** Release executables are currently unsigned. When launching for the first time, Windows SmartScreen will display an "Unknown Publisher" notice. Users must click "More info" -> "Run anyway".
2. **Upstream Provider Rate Limits:** Free-tier API keys (e.g., Google Gemini 20 requests/day free tier) may experience rate limiting during intensive multi-turn code generation. Configure a paid tier API key in Provider Setup for unlimited execution.
3. **Clean-Machine Sandbox Verification:** Clean-room tests were verified at the engine and packaging layer; automated Windows Sandbox execution was blocked due to hypervisor unavailability on the build host.
