# NEXUS.AI Security Posture & Threat Model

This document outlines the security architecture, threat model, trust boundaries, and operational guarantees for NEXUS.AI V2.

---

## 1. Threat Model & Assets

### Protected Assets
1. **API Keys & Credentials:** OpenAI and Google Gemini API keys supplied by the user.
2. **Local Workspace Files:** Source code, configuration files, environment variables (`.env`), and proprietary artifacts within the user's workspace.
3. **Execution Environment:** The host operating system, local shell (PowerShell / Command Prompt / bash), and local network interfaces.

### Entry Points
1. **Local HTTP / SSE API:** Express server running on local loopback (`127.0.0.1`).
2. **Desktop Shell Bridge:** Electron preload context bridge (`window.nexus`).
3. **Workspace File System:** Local directory trees selected by the user.

### Trust Boundaries
| Boundary | Untrusted Zone | Trusted Zone | Security Mechanism |
|----------|----------------|--------------|-------------------|
| Web / Browser to API | Web browsers, external domains, malicious web scripts | NEXUS.AI Local Backend Server | Strict CORS allow-list + Loopback Host validation + Per-launch API Authentication Token (`X-Nexus-Token`) |
| API to File System | Arbitrary absolute paths, system directories, traversal escapes | Project Workspace Root | Canonical path resolution (`resolveSafePath`), symlink verification, traversal blocking, and system folder blacklist |
| API to Process Execution | Arbitrary client execution paths, rogue shell commands | Authorized Project Working Directory | Server-controlled workspace context, process trees timeout ceiling, prohibited command blacklist |
| Storage to Disk | Local non-admin applications reading user data files | Plaintext credentials | AES-256-GCM encrypted envelope (`credentials.enc`) bound to machine and user derivation key |

---

## 2. Hardened Protections in NEXUS.AI V2

### A. Network Exposure & Binding
- **Strict Loopback Binding:** The server explicitly binds to `127.0.0.1`. It never binds to `0.0.0.0` or external network adapters.
- **CORS Allow-List:** Wildcard CORS (`*`) is removed. Cross-origin requests from arbitrary websites are rejected with HTTP 500 / CORS origin violations.
- **DNS Rebinding Defense:** The `Host` header must match loopback identifiers (`localhost`, `127.0.0.1`, `::1`).
- **Per-Launch API Token:** Every API request (except `/api/health`) requires an authenticated token passed via the `X-Nexus-Token` header, Authorization Bearer, or SSE stream token query parameter. Tokens are compared using constant-time `crypto.timingSafeEqual`.

### B. Terminal & Workspace Execution Jail
- **Server-Managed Workspace Context:** `POST /api/workspaces/terminal` rejects any client-provided `workspacePath` and only executes within the active workspace authorized by the user.
- **No `process.cwd()` Fallback:** If no workspace is open, terminal execution requests are rejected with status 400 (`NO_ACTIVE_WORKSPACE`).
- **System Directory Refusal:** Opening Windows system roots (`C:\Windows`, `C:\Program Files`, `C:\`, or user profile root) is blocked with status 403 (`PROTECTED_DIRECTORY`).

### C. Credential Security at Rest & in Transit
- **Encrypted Local Vault:** Credentials are saved to disk as an AES-256-GCM encrypted envelope in `credentials.enc`. Plaintext `credentials.json` files are automatically migrated with backup and deleted.
- **Zero Key Leaks in API Responses:** Endpoints such as `/api/providers/status` and `/api/providers/credentials` return only masked keys (e.g. `••••••••cdef`).
- **Automatic Sanitization:** Log messages, SSE events, and error stack traces pass through the secret sanitizer, which redacts OpenAI keys, Gemini keys, Bearer tokens, and auth headers.

### D. Electron Renderer Isolation
- **Sandbox Enabled:** The Electron renderer runs with `sandbox: true`.
- **Context Isolation & Node Disabled:** `contextIsolation: true` and `nodeIntegration: false` prevent renderer scripts from calling Node.js runtime APIs directly.
- **Navigation Lock:** `will-navigate` blocks navigation away from local application origins.

---

## 3. Assumptions & Residual Risks
1. **Local Machine Administrator:** A user with local root/administrator privileges on the machine can inspect memory or reconstruct derivation keys. NEXUS.AI is designed to defend against drive-by web attacks, local unprivileged process snooping, and accidental path escapes.
2. **Third-Party Providers:** When AI tasks execute, prompts and relevant workspace context are transmitted to the configured AI provider (Google Gemini or OpenAI) using HTTPS. Keys are never transmitted to any other third-party servers.
