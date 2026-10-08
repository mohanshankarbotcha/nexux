# NEXUS.AI V2 — Phase 1 Findings & Root Cause Analysis

**Audit Date:** 2026-10-08  
**Workspace:** `C:\Users\BMS\Desktop\nexux`  
**Node.js:** v24.21.0  
**Platform:** Windows 11 x64  

---

## 1. Executive Summary & Diagnostic Ladder Results

A comprehensive, zero-assumption code and runtime audit was conducted across `@nexus/core`, `@nexus/server`, `@nexus/client`, and `@nexus/desktop`.

### Diagnostic Ladder Summary
- **R0 Environment:** Node v24.21.0 on win32. Localhost DNS resolve returns `none` (Windows loopback resolution behavior). API endpoints for OpenAI (`api.openai.com`) and Google Gemini (`generativelanguage.googleapis.com`) are fully DNS-resolvable and TCP port 443 reachable.
- **R1 Raw Provider Call:** 
  - Direct OpenAI call using stored key (`sk-test...cdef`) immediately returns HTTP 401 (`Incorrect API key provided`).
  - Direct Google Gemini call using stored Gemini key (`AQ.Ab8R...vvJg`) returns HTTP 200 with valid content and usage metadata.
- **R2 Provider Adapter Isolation:** 
  - `OpenAIProvider.validateCredentials()` correctly fails with `isValid: false`, and `complete()` throws `PROVIDER_AUTH_FAILED`.
  - `GeminiProvider.validateCredentials()` returns `isValid: true`, and `complete()` succeeds with usage metadata.
- **R3 Model Router:** 
  - Role routing correctly resolves overrides (`gemini-2.5-flash` and `gpt-4o`). Router execution successfully produces model responses.
- **R4 Context & Budget Audit:** 
  - `ContextEngine.buildTaskContext()` returned 3 items for a simple prompt ("hiii"), including binary files (`.pak` files from `release/`) because `release/` and build directories were not excluded from context collection.
- **R5 Task Lifecycle & Runner:** 
  - `ActiveTaskRegistry` registers, updates stages, and completes cleanly in isolation.
- **R6 Event Transport:** 
  - SSE formatting and event payloads conform to specifications.
- **R7 UI Rendering:** 
  - Multiple divergent state mappings identified across `TopBar`, `StatusBar`, and `ChatScreen`.

---

## 2. Defect Register Verification (Items E1 to E10)

| ID | Observation | Status | File:Line Citation | Root Cause Explanation |
|---|---|---|---|---|
| **E1** | App only loads forever on any prompt; no files, no reply, no error | **REPRODUCED** | `packages/server/src/api/routes/task.ts:143-160`, `packages/client/src/App.tsx:328-340` | `handleLaunchTask` optimistically sets `setActiveStatus('thinking')`. `POST /api/tasks` accepts task (201) and runs `globalCoordinator.run()` in background. If provider call fails (e.g. invalid OpenAI key `sk-test...`), coordinator catches error, marks task failed in storage, but `task_failed` is either missed or does not render error in UI. Frontend remains in `thinking` state indefinitely. |
| **E2** | Network shows only short fetch calls (`/health`, `/tasks`, `/cancel`); `/tasks` re-fetched whole and grows | **REPRODUCED** | `packages/client/src/App.tsx:160-186`, `packages/server/src/api/routes/task.ts:15-30` | `App.tsx` re-triggered its initial `useEffect` whenever dependency callbacks changed, repeatedly polling `getTasks()`. The server `GET /api/tasks` returns the entire unpaginated array of all historical tasks from disk, causing the response payload to grow with every run (6.9 kB $\rightarrow$ 8.0 kB). |
| **E3** | Coordinator card says `Executing`, TopBar says `Reasoning`, StatusBar says `Thinking`, with 0 events | **REPRODUCED** | `packages/client/src/components/layout/TopBar.tsx:101-103`, `packages/client/src/components/layout/StatusBar.tsx:47-49`, `packages/client/src/components/screens/ChatScreen.tsx:172-178` | Divergent string mappings from local state: `TopBar` maps `activeStatus === 'thinking'` to `"Reasoning..."`; `StatusBar` maps it to `activeRole (Thinking)`; `ChatScreen` maps it to `"Executing..."`. Since no tool call has begun, 0 events are recorded. |
| **E4** | Task ended failed, but Coordinator card showed `Done` with green check and 0 events, no error reason | **REPRODUCED** | `packages/client/src/components/screens/ChatScreen.tsx:174-178`, `packages/client/src/App.tsx:270-275` | In `ChatScreen.tsx`, line 176: `activeTask ? 'completed' : 'waiting'`. If `activeTask` exists (even with `status === 'failed'`), it returns `'completed'`, displaying a green checkmark! Additionally, `activeTask.error` was never rendered on `ChatScreen.tsx`. |
| **E5** | Two cancel calls return 200 with 444 B bodies, one at page start | **REPRODUCED** | `packages/client/src/App.tsx:122-126`, `packages/server/src/api/routes/task.ts:172-205` | When restoring a previous session on page load, if a task was previously recorded as active, client components or cleanup handlers triggered `handleCancelTask()`. The server `POST /:id/cancel` returns `{ success: true, message: ... }` (HTTP 200). |
| **E6** | Model labels disagree: `gpt-4o` in top bar, `o1-mini` in header and composer | **REPRODUCED** | `packages/client/src/components/layout/TopBar.tsx:143-145` | `TopBar.tsx` hardcoded the model chip to display `primaryProvider.defaultModel` (`gpt-4o`), ignoring the active task's `providerMetadata.model` and the composer's `selectedModel`. |
| **E7** | Status bar shows 207,900 / 207,960 tokens (~$0.6807) on brand-new task with 0 events | **REPRODUCED** | `packages/client/src/App.tsx:541`, `packages/server/src/storage/storage-engine.ts:32-42`, `packages/server/src/api/routes/usage.ts:15-30` | `App.tsx` passes `totalTokens={usageSummary?.totalTokens || 0}` to `StatusBar`. `usageSummary` is the lifetime aggregate of all historical test runs in `C:\Users\BMS\AppData\Local\NEXUS_AI_DATA\usage.json` (98 records totaling ~209,902 tokens). This lifetime total was rendered on every screen, even for brand-new tasks with zero events. |
| **E8** | Providers show green (2/2) and Online badge, but key is invalid | **REPRODUCED** | `packages/client/src/components/layout/TopBar.tsx:148-150`, `packages/server/src/api/routes/provider.ts:25-45` | `isConfigured` only checks if a non-empty string is stored in `credentials.json`, without performing an authenticated test call (`validateCredentials`). |
| **E9** | Two stop controls shown (`Stop Agent` and `Stop`), and status bar text is overprinted | **REPRODUCED** | `packages/client/src/components/layout/TopBar.tsx:104-110`, `packages/client/src/components/screens/ChatScreen.tsx:761-769`, `packages/client/src/components/layout/StatusBar.tsx:23-52` | Two distinct buttons called cancel: one in `TopBar` / task header and one in the composer. In `StatusBar.tsx`, flex items lacked min-width constraints, causing text overprinting at specific viewport widths. |
| **E10** | Plain greeting ("hiii") triggers full six-agent pipeline | **REPRODUCED** | `packages/server/src/agent/coordinator.ts:71-98`, `packages/server/src/agent/coordinator.ts:220-228` | The Coordinator lacked a conversational fast-path (`CHAT` vs `WORK`). It immediately routed simple greetings like "hiii" to `CoderAgent`, attempting code implementation on greetings. |

---

## 3. Code Smells & Architectural Anti-Patterns Identified

1. **Unawaited Background Promises without Terminal State Guarantee:**
   - In `packages/server/src/api/routes/task.ts:143`, `globalCoordinator.run()` is invoked in background. If an unexpected rejection occurs outside the try/catch, the task is abandoned in memory and disk without terminal state transition.
2. **Missing Outbound Request Timeouts & Signal Propagation:**
   - Provider calls lacked connect/idle deadlines with automatic abort controllers.
3. **Inappropriate Parameter Forwarding for Reasoning Models:**
   - In `openai-provider.ts`, `messages.push({ role: 'system' })`, `temperature: 0.2`, and `max_tokens` are sent to models like `o1-mini`, which triggers HTTP 400 parameter errors from OpenAI.
4. **Context Engine Including Build Artifacts:**
   - `packages/server/src/context/context-engine.ts` included binary files from `release/` in task context.

---

## 4. Phase 2-6 Action Plan

1. **Phase 2 — Eliminate Endless Loading:**
   - Enforce request-level timeouts (connect, first-byte, idle) using `AbortSignal`.
   - Implement startup cleanup for stale tasks (`SERVER_RESTART`).
   - Add prompt budget and binary/build directory ignore list in `ContextEngine`.
2. **Phase 3 — Single Source of Truth:**
   - Ensure single-writer state transitions via `TaskManager`.
   - Implement structured per-task SSE stream with monotonic sequence numbers and heartbeats.
   - Refactor UI to pure projection: unify state labels (`Waiting for model`, `Executing Tool`, etc.), derive model chips from active task, render explicit error panels.
   - Ground token counters strictly in the per-task usage ledger.
3. **Phase 4 — Real Builder Capabilities:**
   - Conversational classifier: `CHAT` (direct model answer) vs `WORK` (sized S/M/L/XL).
   - Workspace directory grants.
   - Physical file verification and terminal process tree management (`taskkill /T`).
4. **Phases 5 & 6 — Acceptance, Soak, & Final Report:**
   - Independent verification suite (no mocks).
   - Complete verification evidence documentation.
