# NEXUS.AI V2 — Cross-Workstream Defect Handoff Ledger

**Baseline Date:** October 27, 2026  
**Source Commit:** `d749cbc`  
**Status Key:** `OPEN`, `ASSIGNED`, `IN_PROGRESS`, `VERIFIED_FIXED`

---

## Defect Handoff Matrix

| Defect ID | Severity | Tag | Summary Description | Owning Prompt | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DEF-01** | **Critical** | `03 security` | Local API uses `cors({ origin: '*' })`, allowing external browser scripts to invoke local API endpoints. | `03_SECURITY_HARDENING.md` | `VERIFIED_FIXED` |
| **DEF-02** | **Critical** | `03 security` | Standalone server `app.listen(port)` binds to `0.0.0.0` (all network interfaces) without explicit host restriction. | `03_SECURITY_HARDENING.md` | `VERIFIED_FIXED` |
| **DEF-03** | **Critical** | `03 security` | No API authentication token/header required on `/api` routes or SSE streams. | `03_SECURITY_HARDENING.md` | `VERIFIED_FIXED` |
| **DEF-04** | **Critical** | `03 security` | `POST /api/workspaces/terminal` takes arbitrary `workspacePath` from client body and defaults to `process.cwd()`. | `03_SECURITY_HARDENING.md` | `VERIFIED_FIXED` |
| **DEF-05** | **High** | `03 security` | `credentials.json` stored in unencrypted plaintext on disk, contradicting UI claims of local encryption. | `03_SECURITY_HARDENING.md` | `VERIFIED_FIXED` |
| **DEF-06** | **Medium** | `03 security` | Electron BrowserWindow has `sandbox: false`. | `03_SECURITY_HARDENING.md` | `VERIFIED_FIXED` |
| **DEF-07** | **Low** | `03 security` | Tracked build artifact `packages/core/tsconfig.tsbuildinfo` committed to repository. | `03_SECURITY_HARDENING.md` | `VERIFIED_FIXED` |
| **DEF-08** | **High** | `02 core` | `scripts/eval-suite-v2.mjs` assumes localhost:3000 server is pre-running; fails with `fetch failed` if executed standalone. | `02_CORE_ENGINE_RELIABILITY.md` | `VERIFIED_FIXED` |
| **DEF-09** | **Medium** | `02 core` | In `packages/server/src/agent/fast-paths.ts`, S1 fallback returns canned greeting with quota note when remote model call hits 429 quota error. Must be labelled honestly as a system message. | `02_CORE_ENGINE_RELIABILITY.md` | `VERIFIED_FIXED` |
| **DEF-10** | **Medium** | `02 core` | `ProviderPreflightCache.defaultTtlMs` is 10 minutes (`10 * 60 * 1000`), whereas earlier reports claimed 15 minutes. | `02_CORE_ENGINE_RELIABILITY.md` | `VERIFIED_FIXED` |
| **DEF-11** | **High** | `04 UI` | Client uses React 18.3.1 (report claimed React 19) and lacks Monaco Code Editor dependency. | `04_STITCH_V2_INTEGRATION.md` | `VERIFIED_FIXED` |
| **DEF-12** | **High** | `04 UI` | Stitch exports load fonts and icons from Google CDN; client must self-host fonts/icons to run offline and comply with CSP. | `04_STITCH_V2_INTEGRATION.md` | `VERIFIED_FIXED` |
| **DEF-13** | **High** | `04 UI` | Stitch mockups contain fictional sample data (NEX-4091, 84M tokens, 92.4% cache hit, p95 192ms) that must never ship. | `04_STITCH_V2_INTEGRATION.md` | `VERIFIED_FIXED` |
| **DEF-14** | **Medium** | `04 UI` | Design typography conflict: owner requires Times New Roman, whereas Stitch `DESIGN.md` specifies Source Serif 4. | `04_STITCH_V2_INTEGRATION.md` | `VERIFIED_FIXED` |
| **DEF-15** | **Medium** | `04 UI` | `packages/client/src/types/index.ts` missing `TaskStatus` values: `validating`, `awaiting_approval`, `timeout`. | `04_STITCH_V2_INTEGRATION.md` | `VERIFIED_FIXED` |
| **DEF-16** | **High** | `06 release` | All `package.json` files and `/api/health` specify version `1.0.0` instead of V2 release versioning. | `06_DESKTOP_RELEASE_READINESS.md` | `VERIFIED_FIXED` |
| **DEF-17** | **Medium** | `06 release` | Data folder paths differ: `%APPDATA%\NEXUS_AI_DATA` in Desktop vs `%LOCALAPPDATA%\nexus_data` in Server default. | `06_DESKTOP_RELEASE_READINESS.md` | `VERIFIED_FIXED` |
| **DEF-18** | **High** | `06 release` | Windows executable and installer are currently unsigned, requiring SmartScreen user documentation. | `06_DESKTOP_RELEASE_READINESS.md` | `VERIFIED_FIXED` |
