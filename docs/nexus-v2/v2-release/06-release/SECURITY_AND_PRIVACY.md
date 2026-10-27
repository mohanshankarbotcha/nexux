# NEXUS.AI v2.0.0 Security and Privacy Architecture

## Security Guarantees

NEXUS.AI operates on a "Local-First, Zero-Surveillance" principle. The core engine is designed for sovereign execution on your local workstation without external tracking, third-party analytics, or background telemetry.

---

## 1. Credential Security & Vault Storage
- **Encryption at Rest:** All API keys are encrypted at rest using AES-256-GCM authenticated encryption.
- **Key Derivation:** Cryptographic master keys are derived via PBKDF2 (100,000 SHA-256 rounds) incorporating local machine identifiers and user-specific security identifiers. Encrypted vaults cannot be transplanted to another workstation.
- **Zero Key Echoing:** API keys are write-only from the user interface. Read operations return masked identifiers (`sk-...` or `AIza...`), preventing credential theft via screen capture or UI inspection.
- **Scrubbing:** Plaintext credential files (`credentials.json`) are automatically detected, encrypted into `credentials.enc`, and safely unlinked.

---

## 2. Network & Loopback Isolation
- **127.0.0.1 Interface Only:** The internal backend HTTP server binds strictly to IPv4 loopback (`127.0.0.1`). Binding to all interfaces (`0.0.0.0`) is prohibited.
- **DNS Rebinding Prevention:** The server inspects the `Host` header of every incoming HTTP request, rejecting any non-loopback hostnames.
- **Strict CORS Policy:** Only local application protocols and loopback origins (`http://127.0.0.1:*`, `http://localhost:*`) are permitted. Cross-origin web requests from external websites are dropped.
- **Cryptographic Token Authorization:** Every API request must carry a per-launch authentication token via header (`X-Nexus-Token`) or Bearer token. Tokens are compared in constant time (`crypto.timingSafeEqual`) to prevent timing attacks.

---

## 3. Filesystem Sandboxing & Path Guard
- **Workspace Boundary Enforcement:** File read, write, and directory listing tools are restricted to the active workspace folder.
- **Traversal Defense:** Path Guard sanitizes all paths using normalized resolution, rejecting directory escape sequences (`../../`), Windows drive traversal, and encoded path representations.
- **System Folder Protection:** NEXUS.AI explicitly refuses attempts to open Windows operating system directories (`C:\Windows`, `C:\Program Files`, `C:\ProgramData`, and root drives).
- **NTFS Stream Protection:** Alternate Data Streams (`file.txt:stream`) are blocked to prevent hidden payload execution.

---

## 4. Electron Desktop Sandbox
- **Context Isolation:** Enabled (`contextIsolation: true`). The renderer has no direct access to Node.js APIs.
- **Node Integration Disabled:** Disabled (`nodeIntegration: false`). Web pages cannot call `require()` or `process`.
- **Chromium Native Sandbox:** Enabled (`sandbox: true`).
- **Navigation Controls:** The Electron main process intercepts and blocks `will-navigate` events attempting to browse away from the local application bundle. External web links open exclusively in the user's default browser via `shell.openExternal`.

---

## 5. Third-Party Data Transmission
- **AI Providers:** Prompts, relevant code snippets, and error diagnostics are transmitted solely to the user-selected AI provider (Google Gemini or OpenAI) via HTTPS TLS 1.3 endpoints.
- **No Third-Party Analytics:** No telemetry, usage statistics, user prompts, or logs are sent to NEXUS.AI maintainers, CDNs, or telemetry brokers.
