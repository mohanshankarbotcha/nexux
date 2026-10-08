# NEXUS.AI V2 — Round 3 Investigation & Audit Findings (R3-findings.md)

**Date:** 2026-10-09  
**Branch:** `v2-execution-reliability`  
**Engineer:** Principal Software Architect & Senior QA Lead  

---

## 1. Executive Summary & Root Cause Verdicts

A thorough investigation of the codebase, the owner's real data directory (`%LOCALAPPDATA%\NEXUS_AI_DATA`), and live provider API endpoints was conducted. Every defect reported in Owner Reports O1 through O8 and Hypotheses H1 through H7 has been tracked to exact source lines and verified with discriminating tests.

### Summary of Ranked Hypotheses Verdicts

| Hypothesis | Verdict | Root Cause & File:Line Citation |
|---|---|---|
| **H1: Test fixture key leaked into real credential store** | **VERIFIED** | `packages/server/src/api/routes/provider.test.ts:110-115` ran `createNexusApp()` without setting `process.env.NEXUS_DATA_DIR`. In `StorageEngine` constructor (`packages/server/src/storage/storage-engine.ts:31-36`), it fell back to `%LOCALAPPDATA%\NEXUS_AI_DATA\credentials.json`, overwriting user's credentials with `sk-testopenai1234567890abcdef`. |
| **H2: Validation scoped to global provider, not task model provider** | **VERIFIED** | Task creation in `task.ts:97-104` preflight called `route.provider.validateCredentials()`. When the UI sent `openai` / `o1-mini`, it validated OpenAI credentials regardless of whether the user only wanted or configured Gemini. |
| **H3: Task payload omits provider/model or backend defaults win** | **VERIFIED** | `ChatScreen.tsx:90-100` initialized `selectedModel` from `localStorage` without validating provider validity. It persisted `o1-mini` and sent `{ provider: 'openai', model: 'o1-mini' }` in every request payload. |
| **H4: Dropdown lists unavailable models; selection not validated** | **VERIFIED** | `ChatScreen.tsx:792` hardcoded `['gpt-4o', 'gpt-4o-mini', 'o1-mini']`. Direct query to `https://api.openai.com/v1/models` proved that `o1-mini` is NOT available on the owner's OpenAI key (`Has o1-mini: false`), while `gpt-4o` and `gpt-4o-mini` are available. |
| **H5: Keys saved in Settings stored in different place than adapter** | **DISPROVED** | Both Settings route and adapter use `StorageEngine` (`credentials.json`). The issue was test pollution (H1) and model availability (H4), not path divergence. |
| **H6: Error classifier sends 404 to generic path, retries delay failure** | **VERIFIED** | In `openai-provider.ts:209-210`, 404 was mapped to generic `PROVIDER_REQUEST_FAILED`. In `coder.ts:220`, it was wrapped as `Implementation failed: ...`. Retries and turn-loop in `coder.ts:120` caused 20-30s delay before failing with generic workspace guidance. |
| **H7: Stale process or port mismatch (3000 vs 5173)** | **VERIFIED** | Vite dev server runs on 5173 proxying to server on 3000. When Vite starts without backend, or when ports differ, no build hash warning was presented to the user. |

---

## 2. Owner Report Citations (O1 to O8)

### O1: Only Gemini configured, but failed with `PROVIDER_AUTH_FAILED: sk-testo...cdef`
- **Status:** **REPRODUCED & VERIFIED**
- **Evidence:**
  - Running `npm test` executed `provider.test.ts:112`, which called `saveCredentials({ openaiApiKey: 'sk-testopenai1234567890abcdef' })` directly against `%LOCALAPPDATA%\NEXUS_AI_DATA\credentials.json`.
  - Frontend composer defaulted to `openai` / `o1-mini` because it was stored in `localStorage` and `ChatScreen.tsx:90-100` did not check provider validity.
  - Backend preflight in `task.ts:103` tested the leaked `sk-test...cdef` against `api.openai.com`, receiving HTTP 401.

### O2: Composer/TopBar showed `o1-mini`; Providers panel showed 2/2 green
- **Status:** **REPRODUCED & VERIFIED**
- **Evidence:**
  - `packages/server/src/api/routes/provider.ts:24-34` computed `configured: Boolean(creds.openaiApiKey)`. Any string in `credentials.json`—including fixture keys—resulted in `configured: true`.
  - Client counted configured providers as green (2/2) without checking if credentials were authenticated (`VALID`).
  - Dropdown did not restrict options to valid providers.

### O3: Top-centre chip said "Task Active" while header said "failed"; double period and key leakage
- **Status:** **REPRODUCED & VERIFIED**
- **Evidence:**
  - `packages/client/src/components/layout/TopBar.tsx:114-118`:
    ```tsx
    ) : activeTaskId ? (
      <div className="flex items-center space-x-1.5 ...">
        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
        <span>Task Active</span>
      </div>
    ) : null}
    ```
    Rendered "Task Active" whenever `activeTaskId` existed, regardless of `activeTask.status === 'failed'`.
  - `packages/server/src/api/routes/task.ts:112`:
    ```ts
    error: `PROVIDER_AUTH_FAILED: ${validation.message}. Please configure a valid ${route.provider.name} API key...`
    ```
    When `validation.message` ended with a period from OpenAI (`Incorrect API key provided: sk-test-********************cdef.`), this produced a double period `..` and leaked the key fragment.

### O4: Real OpenAI key used, but failed after 20-30s with `o1-mini does not exist or you do not have access`
- **Status:** **REPRODUCED & VERIFIED**
- **Evidence:**
  - Live API check against `https://api.openai.com/v1/models` using the owner's real key returned 127 models. `gpt-4o` and `gpt-4o-mini` exist, but `o1-mini` does NOT exist for this account.
  - `task.ts` preflight only called `validateCredentials()` (checking if key works for GET /models), but did NOT check if the requested `model` was in the list!
  - Coder agent proceeded to call completion with `o1-mini`, caught error, attempted fallback loop (turn 1 retry), causing a 20-30s delay.

### O5: Guidance was generic (check workspace permissions) instead of model access guidance
- **Status:** **REPRODUCED & VERIFIED**
- **Evidence:**
  - `packages/client/src/components/screens/ChatScreen.tsx:378-384` hardcoded generic bullets ("Review tool execution log", "Check workspace permissions", "Verify API credentials") for all error codes.

### O6: Pipeline cards showed "Waiting" after failure instead of indicating failed stage
- **Status:** **REPRODUCED & VERIFIED**
- **Evidence:**
  - `packages/server/src/agent/coordinator.ts:500-504` did not set `task.currentAgentRole` when an agent threw an error.
  - In `ChatScreen.tsx:160-220`, each stage checked `activeTask.currentAgentRole === '<role>'`. Since `currentAgentRole` was unset or defaulted, Coder stage remained `waiting`.

### O7: EventSource `all` pending with 0 B; large polling payloads
- **Status:** **REPRODUCED & VERIFIED**
- **Evidence:**
  - `task.ts:33-46` did not send periodic SSE heartbeats, so idle stream received 0 B.
  - `App.tsx:185` polled `GET /api/tasks`, `/api/usage/summary`, and `/api/usage/records` every 3 seconds, transferring ~85 kB on every tick across 112 stored tasks.

### O8: Real Gemini UI flow never proven
- **Status:** **REPRODUCED & VERIFIED**
- **Evidence:**
  - While script `verify-acceptance.mjs` directly instantiated GeminiProvider, the UI flow defaulted to `openai` / `o1-mini` in localStorage, causing UI tasks to fail on OpenAI preflight before ever reaching Gemini.

---

## 3. Plan of Action (Phases 2-6)

1. **F1 & F10: Test Isolation & Credential Protection**
   - In `StorageEngine`, enforce that if `NODE_ENV === 'test'` and `NEXUS_DATA_DIR` is not set, use an isolated temporary test directory.
   - Detect placeholder/fixture keys (`sk-test*`, `AIzaSyGe*`, `your-api-key`) and mark them `NOT_CONFIGURED`.
   - Build `scripts/doctor.mjs` to inspect and heal credentials non-destructively.
2. **F2 & F3: Real Provider & Model Validation**
   - Implement live model validation in `OpenAIProvider` and `GeminiProvider`: verify model access against live API.
   - Return provider states: `VALID`, `INVALID`, `NOT_CONFIGURED`.
   - In preflight (`task.ts`), check model availability in < 1 second; fail fast with `MODEL_UNAVAILABLE` or `PROVIDER_AUTH_FAILED`.
3. **F4: Live Model Registry & Smart Selection**
   - Query live models from valid providers.
   - If only Gemini is configured/valid, UI automatically selects `gemini-2.5-flash` with zero manual intervention.
   - Models not available on the user's account are disabled in the dropdown with clear reasons.
4. **F5 & F7: Error Classification, Guidance & Redaction**
   - Classify errors: `MODEL_UNAVAILABLE`, `PROVIDER_AUTH_FAILED`, `QUOTA_EXCEEDED`, `VERIFICATION_FAILED`.
   - Render specific guidance with 1-click action buttons (e.g. "Switch to gpt-4o", "Open Provider Settings").
   - Strip all key fragments and fix the double period.
   - Mark the failed stage card in the pipeline as `failed`.
5. **F8 & F9: Status Truthfulness, Heartbeats & Incremental Payloads**
   - Top-centre chip in `TopBar.tsx` reflects actual task status (never "Task Active" on failed tasks).
   - Add SSE heartbeats every 15s.
   - Add query limits to `/tasks` and `/usage` endpoints to eliminate heavy polling.
