# NEXUS.AI End-to-End Request Execution Trace

This document maps a user request from input submission to final UI rendering with exact file paths, line numbers, state transitions, and model call indicators.

---

## Request Trace Table

| Step # | File & Line | Component / Function | Operational Description | State Mutated | Makes Model Call? |
|:---|:---|:---|:---|:---|:---|
| **1** | `packages/client/src/components/screens/ChatScreen.tsx:288` | `ChatScreen.handleSubmit` | User enters prompt, selects model/provider, clicks Send. Clears composer, sets UI state to loading. | Frontend `isSubmitting = true`, `activeTask` initialized | **NO** |
| **2** | `packages/client/src/services/api.ts:104` | `api.createTask` | Sends `POST /api/tasks` with JSON payload `{ prompt, sessionId, workspaceRoot, provider, model }`. | Network transport | **NO** |
| **3** | `packages/server/src/api/routes/task.ts:63` | `POST /api/tasks` handler | Receives Express request, extracts parameters, validates non-empty prompt. | Request context | **NO** |
| **4** | `packages/server/src/api/routes/task.ts:70` | `hasAnyConfiguredProvider` | Verifies at least one provider has an API key configured. Fails fast with `PROVIDER_AUTH_FAILED` if none. | None | **NO** |
| **5** | `packages/server/src/providers/model-router.ts:88` | `ModelRouter.getRouteForRole` | Resolves target provider and model for role `coordinator`. Strictly honors user overrides without silent fallback. | Route selection | **NO** |
| **6** | `packages/server/src/providers/openai-provider.ts:77` or `gemini-provider.ts:80` | `validateCredentials` | Preflight credentials validation probe. Checks key format and verifies API access. | None | **YES (Probe)** |
| **7** | `packages/server/src/providers/openai-provider.ts:133` or `gemini-provider.ts:140` | `validateModel` | Preflight model accessibility & quota probe (1-token test call to detect credit balance exhaustion or quota limits). | Model cache TTL | **YES (1-token Probe)** |
| **8** | `packages/server/src/api/routes/task.ts:209` | `saveTask` & `ActiveTaskRegistry.register` | Persists initial Task record (`status: pending, stage: created`), allocates stable `taskId`, binds `AbortController`. | `StorageEngine` task JSON, `activeTaskRegistry` | **NO** |
| **9** | `packages/server/src/api/routes/task.ts:229` | `globalEventBus.emit` | Emits `task_started` event across event bus to SSE subscribers. | In-memory event bus | **NO** |
| **10** | `packages/server/src/api/routes/task.ts:250` | `globalCoordinator.run` (Async) | Initiates background asynchronous coordinator execution loop. Immediately returns HTTP 201 to client. | Active task status $\to$ `running` | **NO** |
| **11** | `packages/server/src/agent/coordinator.ts:69` | `isConversationalGreeting` | Primitive keyword heuristic checking if prompt is a greeting (e.g., "hi", "hello"). | Routing branch | **NO** |
| **12** | `packages/server/src/agent/coordinator.ts:220` | `CoordinatorAgent.handleGreeting` | If greeting, executes single conversational completion using coordinator role model route. | Task result summary | **YES** |
| **13** | `packages/server/src/agent/coordinator.ts:260` | `ExplorerAgent.run` | If non-greeting, launches Explorer to read directory structure and summarize repo conventions. | `ExplorationResult`, `events.jsonl` | **YES** |
| **14** | `packages/server/src/agent/coordinator.ts:285` | `PlannerAgent.run` | Launches Planner to produce sequential step-by-step implementation plan. | `TaskPlan`, task stage $\to$ `planning` | **YES** |
| **15** | `packages/server/src/agent/coordinator.ts:315` | `CoderAgent.run` | Launches Coder agent loop with workspace tools to execute plan steps. | Workspace files, git status | **YES** |
| **16** | `packages/server/src/tools/tool-registry.ts:48` | `ToolRegistry.executeTool` | Validates parameters, executes tool (`write_file`, `terminal`, etc.), emits `tool_started`/`tool_completed`. | Workspace disk, `Task.changedFiles` | **NO** |
| **17** | `packages/server/src/agent/coordinator.ts:380` | Verification Step | Runs configured verification commands (e.g. `npm test`, `python -m unittest`). If failing, launches `DebuggerAgent`. | Test output, task status | **YES (if failing)** |
| **18** | `packages/server/src/agent/coordinator.ts:440` | `ReviewerAgent.run` | Inspects resulting diff and writes code review feedback. | `Task.summary` | **YES** |
| **19** | `packages/server/src/agent/coordinator.ts:510` | Task Completion | Marks task `completed`, records final token usage, emits `task_completed` event. | `StorageEngine` task JSON, usage record | **NO** |
| **20** | `packages/client/src/services/api.ts:25` | `subscribeToTaskEvents` | Client SSE listener receives events (`tool_completed`, `task_progress`, `task_completed`), updates UI state. | React state, status chip, file tree | **NO** |

---

## Key Failure Points Uncovered in Current Architecture

1. **Routing Heuristic Gap (Step 11)**:
   `isConversationalGreeting` only checks exact greeting tokens. A query like `"Go to the demo folder and tell me what files are inside it"` or `"What can you do?"` bypasses fast paths and triggers all five heavy agent roles (Explorer $\to$ Planner $\to$ Coder $\to$ Verifier $\to$ Reviewer), burning 4–6 LLM calls for a trivial folder listing.
2. **Preflight Probe Overhead (Step 7)**:
   The 1-token generation probe on Gemini/OpenAI guarantees fail-fast for bad keys, but when uncached it adds 500–1500ms fixed latency to *every* request.
3. **Missing Typed Contracts between Agents (Steps 13–18)**:
   Agents pass raw string markdown outputs rather than structured schema-validated contracts (`ExplorerReport`, `Plan`, `ChangeSet`, `VerificationReport`).
4. **Lack of Claim Verification (Step 19)**:
   The final task summary is generated by the LLM without comparing claims against an immutable evidence ledger or physical disk state.
