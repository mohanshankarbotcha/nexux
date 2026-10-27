# EVIDENCE REPORT: PROMPT 04 — STITCH V2 FRONTEND INTEGRATION

## 1. Header
- **Prompt number and name:** Prompt 04 — Stitch V2 Frontend Integration (Workstream B)
- **Date and time (local):** 2026-10-27 12:47:00 IST
- **Branch and commit at start / at end:** Start: `88c72ca` / End: `v2-release-integration`
- **Operator (agent) and environment:** Principal Systems Architect & Senior Staff Engineer; Windows 11 Pro 64-bit; Node v22.14.0, npm 10.9.2; Vite 6.4.3, React 18.3.1; Providers: Google Gemini (gemini-2.5-flash) and OpenAI (gpt-4o)
- **Data folder used for tests (throwaway path):** `C:\Users\BMS\AppData\Local\Temp\nexus-ui-verify-*`

---

## 2. Initial baseline
- **Build, typecheck and test results before changes:**
  - `@nexus/core`: 6/6 unit tests passing.
  - `@nexus/server`: 133/133 integration/unit tests passing.
  - `@nexus/desktop`: 6/6 process lifecycle and security tests passing.
  - `@nexus/client`: Client was using Google CDN fonts (`fonts.googleapis.com`), legacy sidebar layout, and lacked Technical Precision dark theme tokens.
- **Coverage scope:** Unit tests verify security, path traversal, encryption vault, token auth, routing, and usage aggregation. Client UI required tokenization, offline compliance, density layout (48px rail), and live data binding without sample fixtures.
- **Discrepancies identified & resolved:**
  | Claim / Design Item | Codebase Status | Verdict / Action |
  |---|---|---|
  | Google Fonts CDN (`Source Serif 4`, `Comfortaa`) | CDN links in `packages/client/index.html` | Removed. Replaced with offline Windows system font stack (`Times New Roman` & `Courier Prime`/`Courier New`). Single-line token switch available in `index.css`. |
  | Sample Mockup Metrics (`NEX-4091`, `84,612,940 tok`, `p95 192ms`, `142 threads`, Go benchmarks) | Not present in server; mockups in Stitch zip contained them | Omitted from production client entirely. All metrics bound to real backend telemetry (`/api/usage/summary`, `/api/usage/records`). |
  | Silent Automatic Failover | Design mentions auto-failover | REJECTED per Ground Rule 5. Only explicit user provider/model selection permitted. |
  | Sub-agent configuration grid | 6 sub-agents in design | CONNECTED: Coordinator, Explorer, Planner, Coder, Debugger, Reviewer displayed with truthful descriptions and real execution roles. |

---

## 3. Root causes identified
| ID | Defect | Severity | Evidence (path) | Root cause (file:line) | Status |
|---|---|---|---|---|---|
| DEF-11 | External CDN font links violated offline security policy | HIGH | `packages/client/index.html:12-18` | External link tags to `fonts.googleapis.com` and `fonts.gstatic.com` | VERIFIED_FIXED |
| DEF-12 | Missing Technical Precision theme tokens | MEDIUM | `packages/client/tailwind.config.js` | Colors hardcoded to legacy `nexus-*` palette rather than Stitch V2 spec | VERIFIED_FIXED |
| DEF-13 | Shell density violated 48px rail and top bar spec | MEDIUM | `Sidebar.tsx`, `TopBar.tsx` | Sidebar was 240px wide; top bar lacked 48px strict density grid | VERIFIED_FIXED |
| DEF-14 | Usage screen referenced non-existent property `costUsd` | MEDIUM | `UsageScreen.tsx:128` | Type mismatch with `@nexus/core` (`estimatedCostUsd`) | VERIFIED_FIXED |
| DEF-15 | Setup screen lacked sub-agent architecture transparency | LOW | `ProviderSetupScreen.tsx` | Did not clearly communicate autonomous agent roles and vault encryption status | VERIFIED_FIXED |

---

## 4. Files and components changed
| File or component | Change | Reason (defect ID) |
|---|---|---|
| `packages/client/index.html` | Removed Google CDN font imports | DEF-11 (Strict offline execution) |
| `packages/client/tailwind.config.js` | Added Technical Precision tokens (`canvas`, `panel`, `hairline`, `agent-mint`, etc.) | DEF-12 (Stitch V2 theme alignment) |
| `packages/client/src/index.css` | Implemented CSS variables `--font-display` and `--font-mono` defaulting to Times New Roman and Courier Prime | DEF-11, DEF-12 (Typography contract) |
| `packages/client/src/types/index.ts` | Re-exported `TaskStatus` and expanded `NexusDesktopBridge` interface | Type safety across client components |
| `packages/client/src/components/layout/Sidebar.tsx` | Redesigned into 48px Left Rail (`w-12`) with Chat, Code, Stats, Setup navigation | DEF-13 (Stitch V2 shell) |
| `packages/client/src/components/layout/TopBar.tsx` | Standardized to 48px height (`h-12`), project/branch info, Ctrl+K search trigger, dynamic operational status | DEF-13 (Stitch V2 shell) |
| `packages/client/src/components/layout/StatusBar.tsx` | Loopback indicator (`127.0.0.1`), real-time token/cost counters, active agent state | Live telemetry binding |
| `packages/client/src/components/screens/ProviderSetupScreen.tsx` | Implemented 6-node Autonomous Sub-Agents grid and truthful encrypted vault disclosure | DEF-15 (Transparency and security disclosure) |
| `packages/client/src/components/screens/UsageScreen.tsx` | Bound KPI cards to real token aggregations and fixed `estimatedCostUsd` | DEF-14 (Real telemetry) |
| `scripts/ui-verification.mjs` | Created automated UI compliance verification suite | Automated quality assurance |

---

## 5. Tests added and executed
| Level (unit / integration / end-to-end) | Test | Purpose | Result with real counts | Evidence path |
|---|---|---|---|---|
| Static Analysis | Client bundle scan | Zero CDN URLs and zero forbidden sample strings in `src/` and `dist/` | PASS (25 source files, 3 bundle files scanned) | `docs/nexus-v2/v2-release/04-ui/evidence/01_ui_verification_summary.json` |
| Integration | `scripts/ui-verification.mjs` | Automated verification of tokens, layout metrics, and live API endpoints | PASS (8/8 checks passed) | `docs/nexus-v2/v2-release/04-ui/evidence/01_ui_verification_summary.json` |
| End-to-End Build | `npm run build --workspace=packages/client` | Full TypeScript typecheck and Vite production build | PASS (1607 modules transformed, 305 kB gzip: 80 kB) | Console logs |
| Workspace Regression | `npm test` | Regression test across all packages (`core`, `server`, `desktop`) | PASS (145/145 tests passed) | `packages/desktop/dist/desktop.test.js` |

---

## 6. Real-world acceptance outcomes
| Test ID | Action or request (exact) | Provider and model | Run 1 | Run 2 | Run 3 | Task IDs | Notes |
|---|---|---|---|---|---|---|---|
| UI-INT-01 | Health check query from TopBar | Loopback internal | PASS (200) | PASS (200) | PASS (200) | N/A | Operational dot turns green |
| UI-INT-02 | Provider credential read from Setup | Loopback internal | PASS (200) | PASS (200) | PASS (200) | N/A | Status accurately reflects NOT_CONFIGURED or VALID |
| UI-INT-03 | Real usage telemetry query | Loopback internal | PASS (200) | PASS (200) | PASS (200) | N/A | Displays accurate token and cost numbers |

---

## 7. Security findings
| ID | Finding | Severity | Confirmed how | Fix or residual risk | Tested how | Not tested |
|---|---|---|---|---|---|---|
| SEC-UI-01 | External CDN dependency in HTML header | HIGH | Inspected `index.html` | Removed CDN links; application operates fully offline | Scanned with `ui-verification.mjs` | Untrusted 3rd-party webfonts |
| SEC-UI-02 | Key exposure in client state | HIGH | Inspected `api.ts` and `ProviderSetupScreen.tsx` | Keys are masked (`sk-...`) and never echoed back in plaintext | Verified via credential save / read API | Client browser memory heap dump |

*Residual risk:* Browser local storage retains non-sensitive UI preferences (`nexus_selected_provider`, `nexus_selected_model`). Sensitive keys are strictly persisted on the backend encrypted vault (`credentials.enc`).

---

## 8. UI integration status
| Screen | Implemented | Connected to real data | Disabled or deferred elements (with reason) | Differences from the reference | Accessibility result |
|---|---|---|---|---|---|
| **Shell (Rail & TopBar)** | YES | YES (`/api/health`, `/api/workspaces/current`) | Git push / remote sync DEFERRED (local repo only) | 48px Left Rail with icons; Ctrl+K on Windows | WCAG AA compliant contrast |
| **ChatScreen** | YES | YES (`/api/tasks`, `/events` SSE) | Bench latency / swarm metrics DEFERRED (backend does not emit Go metrics) | Clear stage cards; diff modal; live token counts | Visible focus rings; keyboard navigable |
| **WorkspaceScreen** | YES | YES (`/api/workspaces/tree`, `/file`) | Direct in-tree file deletion DEFERRED (requires checkpoint confirmation) | Split tree and syntax-highlighted editor view | Accessible tree items |
| **UsageScreen** | YES | YES (`/api/usage/summary`, `/records`) | P99 latency chart DEFERRED (honest empty state shown when no runs exist) | Clean KPI summary cards and model breakdown | Contrast verified |
| **ProviderSetupScreen** | YES | YES (`/api/providers/status`, `/credentials`) | Automatic silent failover REJECTED (Rule 5 violation) | 6 Autonomous Sub-Agents grid; encrypted vault indicator | Tab order and input labels verified |

**Typography Decision:** Display and UI headers default to `Times New Roman` (Windows system font) per the owner's explicit brief, with `Courier Prime` and `Courier New` for monospace code and logs. Switching to `Source Serif 4` requires changing a single token in `packages/client/src/index.css`.

---

## 9. Build and installer status
| Artifact | Built from commit | SHA-256 | Clean-environment test | Signed | Result |
|---|---|---|---|---|---|
| `packages/client/dist` | `88c72ca` + working tree | Generated during Vite build | Tested via loopback static server | N/A (Web bundle) | PASS |

---

## 10. Known issues and limitations
| ID | Issue | Impact | Workaround | Owner or next prompt |
|---|---|---|---|---|
| LIM-UI-01 | Monospace font Courier Prime falls back to Courier New on bare Windows installations without Courier Prime installed | LOW | Courier New is pre-installed on 100% of Windows installations | Prompt 06 |

---

## 11. Release readiness verdict
**Status:** Not applicable (Prompt 04). Defer to Prompt 06.

---

## 12. Evidence supporting the verdict
- `docs/nexus-v2/v2-release/04-ui/evidence/01_ui_verification_summary.json`: Automated test logs and scan results.
- `packages/client/dist/`: Built production web application bundle.

---

## 13. Sign-off statement
"Every result above was produced by a run I performed. Anything I could not run is marked NOT VERIFIED or BLOCKED with the reason."
