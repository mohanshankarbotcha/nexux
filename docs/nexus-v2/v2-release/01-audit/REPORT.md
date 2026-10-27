# EVIDENCE REPORT: PROMPT 01 — AUDIT AND BASELINE

## 1. Header
- **Prompt number and name:** Prompt 01 — Audit and Baseline
- **Date and time (local):** October 27, 2026, 11:55:00 IST
- **Branch and commit at start / at end:** `v2-release-integration` at `d749cbc580cd0bfdb9a086c611e9a65cffc86dff` (Clean checkout)
- **Operator (agent) and environment:** Windows 11 (`10.0.26200.9711`), Node.js `v22.23.3`, npm `10.9.9`, Edge/Chromium, Google Gemini & OpenAI adapters
- **Data folder used for tests (throwaway path):** `C:\Users\BMS\AppData\Local\Temp\nexus_audit_throwaway_1793082257534`

---

## 2. Initial Baseline

### 2.1 Build, Typecheck, and Test Execution Results
All tests and compilation commands were run directly on the working tree with real output saved in the evidence directory:

| Workspace | Command | Real Result | Evidence Path |
| :--- | :--- | :--- | :--- |
| **Monorepo Typecheck** | `npm run typecheck` | **PASS** (Exit Code 0, 0 type errors across `@nexus/core`, `@nexus/server`, `@nexus/desktop`) | `docs/nexus-v2/v2-release/01-audit/evidence/02_typecheck.txt` |
| **Monorepo Build** | `npm run build` | **PASS** (Exit Code 0: core tsc -b, server tsc -b, client vite build 1607 modules transformed, desktop tsc -b) | `docs/nexus-v2/v2-release/01-audit/evidence/03_build.txt` |
| **`@nexus/core` Unit Tests** | `node --test dist/**/*.test.js` | **PASS** (6/6 tests passed, duration: 807ms) | `docs/nexus-v2/v2-release/01-audit/evidence/04_npm_test.txt` |
| **`@nexus/server` Unit Tests** | `node --test dist/**/*.test.js` | **PASS** (133/133 tests passed, duration: 19.1s) | `docs/nexus-v2/v2-release/01-audit/evidence/04_npm_test.txt` |
| **`@nexus/desktop` Unit Tests** | `node --test dist/**/*.test.js` | **PASS** (6/6 tests passed, duration: 1.2s) | `docs/nexus-v2/v2-release/01-audit/evidence/04_npm_test.txt` |
| **Total Test Count** | `npm test` | **PASS: 145 / 145 Tests Passed (100% Pass Rate)** | `docs/nexus-v2/v2-release/01-audit/evidence/04_npm_test.txt` |

### 2.2 What the Tests Cover vs. What They Do Not
- **What Is Covered:**
  - Workspace path jail enforcement, null byte rejection, and symlink protection (`path-guard.test.ts`).
  - Secret sanitizer redacting API keys and tokens (`sanitizer.test.ts`).
  - Model router, preflight cache, and provider adapters (`provider.test.ts`).
  - Safe file reading, atomic writes, surgical search-and-replace, and directory search (`workspace.test.ts`).
  - Request router fast paths S1-S5 and 125-prompt intent classification benchmark (`request-router.test.ts`).
  - Engineering supervisor state machine and multi-step verification (`supervisor.test.ts`).
  - Embedded desktop server process lifecycle and dynamic port binding (`desktop.test.ts`).
- **What Is NOT Covered:**
  - Automated client browser tests (no Playwright/Cypress end-to-end tests exist in `packages/client`).
  - Authenticated loopback token handshake between renderer and backend.
  - Windows clean-environment sandbox deployment.
  - Offline font loading under strict Content-Security-Policy.

### 2.3 Report Claims versus Verified Code Reality

| Report Claim (Dated Oct 26, 2026) | Verified Status | Real Observed Code Reality & Evidence |
| :--- | :--- | :--- |
| **React 19 Frontend** | **FAILED** | `packages/client/package.json` specifies `"react": "^18.3.1"` and `"react-dom": "^18.3.1"`. |
| **Monaco Code Editor** | **FAILED** | Zero Monaco dependencies or imports exist in `packages/client`. Editor is currently a syntax-highlighted textarea/pre view. |
| **Agent Roster: Coordinator, Planner, Coder, Reviewer, Supervisor** | **FAILED (Incomplete)** | `packages/server/src/agent/` also contains implementations for `explorer.ts` and `debugger.ts`. |
| **Preflight Cache 15-Minute TTL** | **FAILED** | `packages/server/src/providers/preflight-cache.ts:19` defines `defaultTtlMs = 10 * 60 * 1000` (10 minutes, not 15). |
| **Version 2.0.0 Release** | **FAILED** | All `package.json` manifests (`core`, `server`, `client`, `desktop`, `root`) and `/api/health` report version `1.0.0`. |
| **Storage Data Folder** | **PARTIALLY VERIFIED** | Server defaults to `%LOCALAPPDATA%\nexus_data`, while Desktop `ServerManager` overrides to `%APPDATA%\NEXUS_AI_DATA`. |
| **99.2% Request Router Accuracy** | **VERIFIED** | `packages/server/src/agent/request-router.test.ts` executes a 125-prompt labelled benchmark with 124/125 correct classifications (99.2%). |
| **145/145 Unit Tests Passing** | **VERIFIED** | Observed real test run: 6 (core) + 133 (server) + 6 (desktop) = 145 passed, 0 failed. |
| **Sub-second S1 Fast Path** | **VERIFIED** | S1 direct answer fast-path executes in < 350ms without invoking planner/coder/reviewer agents. |
| **Bug Registry Fixes (BUG-01 to BUG-10)** | **VERIFIED** | All 10 reported fixes verified present in source code and tested. |

---

## 3. Root Causes Identified

| ID | Defect | Severity | Evidence (path) | Root Cause (file:line) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DEF-01** | Local API allows CORS from any website (`origin: '*'`) | Critical | `docs/nexus-v2/v2-release/01-audit/evidence/07_security_scan.json` | `packages/server/src/api/app.ts:34` | Open (Assigned to Prompt 03) |
| **DEF-02** | Standalone server listens on `0.0.0.0` (all interfaces) | Critical | `docs/nexus-v2/v2-release/01-audit/evidence/07_security_scan.json` | `packages/server/src/index.ts:36` (`app.listen(port)`) | Open (Assigned to Prompt 03) |
| **DEF-03** | Local API endpoints have no authentication requirement | Critical | `docs/nexus-v2/v2-release/01-audit/evidence/07_security_scan.json` | `packages/server/src/api/app.ts:25-50` | Open (Assigned to Prompt 03) |
| **DEF-04** | Terminal endpoint takes client `workspacePath` with `process.cwd()` fallback | Critical | `docs/nexus-v2/v2-release/01-audit/evidence/07_security_scan.json` | `packages/server/src/api/routes/workspace.ts:106-109` | Open (Assigned to Prompt 03) |
| **DEF-05** | `credentials.json` stored in unencrypted plaintext | High | `docs/nexus-v2/v2-release/01-audit/evidence/07_security_scan.json` | `packages/server/src/storage/storage-engine.ts:68-80` | Open (Assigned to Prompt 03) |
| **DEF-06** | Electron window configured with `sandbox: false` | Medium | `docs/nexus-v2/v2-release/01-audit/evidence/07_security_scan.json` | `packages/desktop/src/main.ts:39` | Open (Assigned to Prompt 03) |
| **DEF-07** | Committed build artifact in git repository | Low | `docs/nexus-v2/v2-release/01-audit/evidence/01_tracked_artifacts.txt` | `packages/core/tsconfig.tsbuildinfo` | Open (Assigned to Prompt 03) |
| **DEF-08** | Standalone `eval:v2` crashes if backend server is not running | High | `docs/nexus-v2/v2-release/01-audit/evidence/05_eval_v2_offline.txt` | `scripts/eval-suite-v2.mjs:30-40` | Open (Assigned to Prompt 02) |
| **DEF-09** | S1 returns canned greeting on 429 quota without explicit system label | Medium | `packages/server/src/agent/fast-paths.ts:110-120` | `fast-paths.ts:112` | Open (Assigned to Prompt 02) |
| **DEF-10** | Preflight cache TTL mismatch (10 min vs claimed 15 min) | Low | `packages/server/src/providers/preflight-cache.ts:19` | `preflight-cache.ts:19` | Open (Assigned to Prompt 02) |

---

## 4. Files and Components Changed
*(Prompt 01 is strictly read-only for product code. No product runtime behaviour was modified.)*

| File or Component | Change | Reason |
| :--- | :--- | :--- |
| `docs/design/stitch-v2/*` | Extracted and classified Stitch V2 design assets | Prompt 01 Step 5 (Asset Inventory) |
| `docs/nexus-v2/v2-release/api-contract.md` | Author live API contract from source | Prompt 01 Step 4 (Contracts) |
| `docs/nexus-v2/v2-release/handoff.md` | Initialized cross-prompt defect ledger | Prompt 01 Step 8 (Defect Register) |
| `docs/nexus-v2/v2-release/01-audit/evidence/*` | Saved real execution outputs | Prompt 01 Ground Rule 2 (Evidence) |

---

## 5. Tests Added and Executed
- Executed full test suite: `npm test` (145 tests passed).
- Executed `npm run typecheck` (passed).
- Executed `npm run build` (passed).
- Executed standalone throwaway audit harness in `docs/nexus-v2/v2-release/01-audit/evidence/06_historical_failures.json`.

---

## 6. Real-World Acceptance Outcomes (Historical Failure Reproduction)

| Test Item | Action or Request | Environment / State | Result | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **1. Greeting Execution** | `hiii` | Standalone server with throwaway data folder | **NOT REPRODUCED (FIX VERIFIED):** S1 fast path executes directly in < 350ms, no hanging reasoning state. | `evidence/06_historical_failures.json` |
| **2. Folder Listing** | `List the files in demo folder` | S2 read-only path | **NOT REPRODUCED (FIX VERIFIED):** S2 executes directly with disk verification, no hallucinated filesystem. | `evidence/06_historical_failures.json` |
| **3. Invalid Provider Key** | Validate `AIzaSyFakeKey...` | POST `/api/providers/validate` | **NOT REPRODUCED (FIX VERIFIED):** Fails immediately with `PROVIDER_REQUEST_FAILED` in < 2ms without infinite thinking. | `evidence/06_historical_failures.json` |
| **4. Missing Provider State** | Create task without credentials | POST `/api/tasks` | **NOT REPRODUCED (FIX VERIFIED):** Returns clean HTTP 200 with `status: 'failed'` and actionable guidance. | `evidence/06_historical_failures.json` |
| **5. Cancel Execution** | POST `/api/tasks/:id/cancel` | Active Task Registry | **NOT REPRODUCED (FIX VERIFIED):** Absorbing cancellation verified in `agent.test.ts`. | `evidence/04_npm_test.txt` |
| **6. Usage Totals** | Check task usage vs summary | Storage ledger | **NOT REPRODUCED (FIX VERIFIED):** Reconciles across `/api/tasks/:id/usage` and `/api/usage/summary`. | `evidence/04_npm_test.txt` |
| **7. Fixture Key Leak** | Pass `sk-test-fixture-key` | `isPlaceholderOrFixtureKey` | **NOT REPRODUCED (FIX VERIFIED):** Fixture keys are flagged and rejected from credential store. | `evidence/04_npm_test.txt` |

---

## 7. Security Findings

| ID | Finding | Severity | Confirmed How | Fix or Residual Risk | Tested How | Not Tested |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | `cors({ origin: '*' })` allows any website to make requests to local backend | **Critical** | Inspected `packages/server/src/api/app.ts:34` | Fix in Prompt 03: Restrict to explicit local allow-list. | Static audit + code inspection | Live browser cross-site exploit simulation |
| **SEC-02** | Standalone server binds to `0.0.0.0` (all interfaces) | **Critical** | Inspected `packages/server/src/index.ts:36` | Fix in Prompt 03: Bind explicitly to loopback `127.0.0.1`. | Static audit + code inspection | External network interface probe |
| **SEC-03** | No authentication required on API routes | **Critical** | Inspected `packages/server/src/api/app.ts` | Fix in Prompt 03: Add per-launch random token authentication header. | Static audit + code inspection | Token replay / timing attack testing |
| **SEC-04** | Terminal endpoint accepts client `workspacePath` and defaults to `process.cwd()` | **Critical** | Inspected `packages/server/src/api/routes/workspace.ts:106-109` | Fix in Prompt 03: Enforce current authorized server workspace only. | Static audit + code inspection | Malicious directory escape execution |
| **SEC-05** | `credentials.json` stored in unencrypted plaintext | **High** | Inspected `packages/server/src/storage/storage-engine.ts:70-80` | Fix in Prompt 03: Use Electron `safeStorage` (Windows DPAPI) and honest fallback. | Static audit + disk inspection | DPAPI recovery across OS reinstallation |
| **SEC-06** | Electron window has `sandbox: false` | **Medium** | Inspected `packages/desktop/src/main.ts:39` | Fix in Prompt 03: Enable `sandbox: true` and adapt preload bridge. | Static audit + code inspection | Chromium renderer exploit escape |
| **SEC-07** | Committed build artifact `tsconfig.tsbuildinfo` | **Low** | Inspected `git ls-files` | Fix in Prompt 03: Remove from git tracking and add to `.gitignore`. | Git tracking verification | N/A |

*Statement of Limitation: The application is NOT claimed to be secure. The items above represent verified architectural vulnerabilities that MUST be remediated in Prompt 03.*

---

## 8. UI Integration Status & Stitch V2 Feature Disposition

### 8.1 Stitch V2 Assets Ingested
Reference assets successfully extracted into `docs/design/stitch-v2/stitch_nexus_ai_developer_environment/`:
- `nexus.ai_multi_agent_ai_task_chat/` (`code.html`, `screen.png`)
- `nexus.ai_workspace_ide_environment/` (`code.html`, `screen.png`)
- `nexus.ai_project_telemetry_dashboard/` (`code.html`, `screen.png`)
- `nexus.ai_multi_agent_configuration_api_providers/` (`code.html`, `screen.png`)
- `technical_precision_ide/DESIGN.md`

### 8.2 Feature-Disposition Matrix

| Screen | Visible Element / Control | Disposition | Backend Capability / Justification |
| :--- | :--- | :--- | :--- |
| **Shell** | 48px Left Rail (Chat, Code, Stats, Setup) | **CONNECT** | Maps to existing screen router in `App.tsx`. |
| **Shell** | "Operational" Status Pill | **CONNECT** | Derives from `/api/health` and `/api/providers/status`. |
| **Shell** | Active Branch Indicator | **ADAPT** | Add git branch lookup in `WorkspaceService`. |
| **Chat** | Execution Sequence / Timeline | **CONNECT** | Driven by `/api/tasks/:id/timeline` and SSE stream. |
| **Chat** | Composer with Inline Model Picker | **CONNECT** | Supported by `/api/tasks` body `{ provider, model }`. |
| **Chat** | "Autonomous" Mode Chip | **CONNECT** | Maps to approval policy in `EngineeringSupervisor`. |
| **Chat** | "Commit & Merge" / "Discard Changes" | **ADAPT** | Must require explicit user confirmation and checkpointing; never auto-push. |
| **Workspace** | Directory Tree Explorer | **CONNECT** | Backed by `GET /api/workspaces/tree`. |
| **Workspace** | File Diff Viewer | **CONNECT** | Backed by `ChangedFile.diff` and `WorkspaceService`. |
| **Workspace** | Bench Terminal | **CONNECT** | Backed by `POST /api/workspaces/terminal` (post-security hardening). |
| **Workspace** | "Revert" / "Accept Diff" | **ADAPT** | Wire to `CheckpointManager.restore()`. |
| **Telemetry** | Granular Token Ledger Table | **CONNECT** | Backed by `GET /api/usage/records`. |
| **Telemetry** | Aggregated Tokens & Cost Cards | **CONNECT** | Backed by `GET /api/usage/summary`. |
| **Telemetry** | Mock Go Benchmark Metrics (p95 192ms, 142 threads, 84M tokens) | **REJECT** | Fabricated sample data from Stitch export; must NEVER ship. Replace with real project usage. |
| **Setup** | Provider Cards (OpenAI, Gemini) | **CONNECT** | Backed by `/api/providers/status` and `/api/providers/credentials`. |
| **Setup** | "Test Connection" with Live Latency | **CONNECT** | Backed by `/api/providers/validate` measuring real round-trip time. |
| **Setup** | "Encrypted in local session storage" Badge | **ADAPT** | Update to "Encrypted via Windows DPAPI" only after Prompt 03 encryption lands. |
| **Setup** | Automatic Failover to Secondary | **REJECT** | Violates Rule 5 (Never switch providers silently). May only exist as explicit opt-in setting with per-request recording. |

### 8.3 Typography Decision
- **Owner's Requirement:** Times New Roman for UI display and text (offline Windows system font).
- **Stitch DESIGN.md:** Source Serif 4 (headlines), Courier Prime (body/code), Comfortaa (labels).
- **Architecture Decision:** Implement unified token layer in Tailwind config with CSS variables:
  - `--font-serif`: Defaulting to `'Times New Roman', serif`.
  - `--font-mono`: Bundled local `Courier Prime` with `Courier New` fallback.
  - `--font-label`: Tracked uppercase monospace.
  Switching between font families remains a single-token change.

---

## 9. Build and Installer Status
- Monorepo compilation verified (`npm run build` exits 0).
- Windows packaging (`package-windows.mjs` and installer compilers) verified present in repository. Full clean-environment verification scheduled for Prompt 06.

---

## 10. Known Issues and Limitations
- Critical security exposures (CORS `*`, `0.0.0.0` binding, missing auth token, client `workspacePath` fallback) remain active in current baseline and are prioritized for immediate remediation in **Prompt 03**.
- Monorepo package manifests currently state version `1.0.0` across all workspaces.

---

## 11. Release Readiness Verdict
**Status:** Not applicable for Prompt 01 (Audit & Baseline). Release readiness verdict is reserved for Prompt 06.

---

## 12. Evidence Supporting the Audit
1. `docs/nexus-v2/v2-release/01-audit/evidence/01_env_state.txt` (Git, Node, OS baseline)
2. `docs/nexus-v2/v2-release/01-audit/evidence/01_tracked_artifacts.txt` (Committed build artifacts)
3. `docs/nexus-v2/v2-release/01-audit/evidence/02_typecheck.txt` (TypeScript typecheck log)
4. `docs/nexus-v2/v2-release/01-audit/evidence/03_build.txt` (Full monorepo build log)
5. `docs/nexus-v2/v2-release/01-audit/evidence/04_npm_test.txt` (145/145 unit test log)
6. `docs/nexus-v2/v2-release/01-audit/evidence/05_eval_v2_offline.txt` (Eval v2 offline behaviour)
7. `docs/nexus-v2/v2-release/01-audit/evidence/06_historical_failures.json` (Throwaway reproduction results)
8. `docs/nexus-v2/v2-release/01-audit/evidence/07_security_scan.json` (Security posture audit scan)

---

## 13. Sign-off Statement
*Every result above was produced by a real run I performed on the repository. Anything I could not run is marked NOT VERIFIED or BLOCKED with the reason.*
