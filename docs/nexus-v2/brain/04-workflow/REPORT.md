# NEXUS.AI Brain Upgrade: Prompt 04 — Engineering Workflow Report
**Author:** Google Senior Architect / Autonomous Agent Systems Lead
**Date:** 2026-10-24
**Branch:** `v2-brain-upgrade`
**Status:** COMPLETE & VERIFIED

---

## 1. Executive Summary & Objective

The objective of Prompt 04 is to establish a deterministic, supervisor-governed engineering workflow for workspace-altering tasks:
- **Profile S3 (Focused Change):** Single-engineer loop with write tools, terminal access, and targeted verification.
- **Profile S4 (Engineering Workflow):** Supervised multi-stage workflow consisting of exploration, planning with runnable acceptance checks, multi-turn implementation, verification ladder, targeted debugger loop, and evidence-grounded final reporting.
- **Profile S5 (Clarify & Authorize):** Ambiguous, high-risk, or destructive prompts halt execution and require explicit clarification or authorization.

Prior to Prompt 04, stage transitions were loosely managed, tool loops were vulnerable to repetitive calls, file outputs could diverge from actual disk modifications, and verification failures did not trigger a disciplined debugging loop.

With Prompt 04, the `EngineeringSupervisor` enforces a rigorous state machine where transitions are deterministic, file modifications are verified through physical disk presence and `EvidenceLedger`, acceptance checks are executed via terminal exit codes, and claims are audited through `ClaimChecker`.

---

## 2. Modules Inspected

| Module | Path | Role & Findings |
|---|---|---|
| `types/workflow.ts` | `packages/core/src/types/workflow.ts` | Authored canonical typed contracts: `ExplorerReport`, `AcceptanceCheck`, `Milestone`, `Plan`, `ChangeSet`, `VerificationReport`, `FixAttempt`, `ReviewReport`, `FinalReport`. |
| `supervisor.ts` | `packages/server/src/agent/supervisor.ts` | Implemented `AntiLoopDetector` and `EngineeringSupervisor` state machine governing S3 and S4 workflows. |
| `coordinator.ts` | `packages/server/src/agent/coordinator.ts` | Wired `RequestRouter` decisions (S1/S2/S3/S4/S5) to `EngineeringSupervisor` and Fast Paths. |
| `claim-checker.ts` | `packages/server/src/tools/claim-checker.ts` | Integrated claim verification for created, modified, deleted files, and passed/failed commands. |
| `evidence-ledger.ts` | `packages/server/src/tools/evidence-ledger.ts` | Used to extract actual mutated files and verified tool results. |
| `diagnostics-parser.ts` | `packages/core/src/diagnostics/diagnostics-parser.ts` | Parses raw compiler/runtime stderr into structured diagnostics for the debugger loop. |

---

## 3. Architecture & Implementation

### 3.1. Typed Contracts (`packages/core/src/types/workflow.ts`)
- **`Plan`:** Contains `requirements`, `assumptions`, `stackChoice`, and `milestones`. Every milestone defines upfront `acceptanceChecks` with an executable terminal command and expected exit code.
- **`ChangeSet`:** Contains `createdFiles`, `modifiedFiles`, `deletedFiles`, and `totalFilesChanged`, derived strictly from `EvidenceLedger` and filesystem verification.
- **`VerificationReport`:** Records each check's command, exit code, output preview, and pass/fail boolean.
- **`FinalReport`:** Aggregates change sets, verification checks, audited claims, and blocker reasons.

### 3.2. Anti-Loop Protection (`AntiLoopDetector`)
- **Tool Deduplication:** Tracks consecutive calls per tool and arguments hash. Three identical consecutive calls immediately halt execution with an anti-loop blocker report.
- **Error Cycling:** Detects identical compiler/runtime diagnostic error signatures. Two consecutive identical failures trigger a strategy shift or blocker report.

### 3.3. Deterministic Engineering Supervisor (`EngineeringSupervisor`)
- **Stage 1 (Explore):** Runs bounded `list_files` to discover workspace layout.
- **Stage 2 (Plan):** Synthesizes milestone plan with runnable acceptance commands before code generation.
- **Stage 3 (Implement):** Supports both single-turn structured multi-file output (`<<<FILE: path>>>...<<<END_FILE>>>`) and multi-turn interactive tool calling loops.
- **Stage 4 (Verification Ladder):** Executes plan acceptance checks via `terminal`. Exit code 0 is required for passing.
- **Stage 5 (Targeted Debugger Loop):** On check failure, passes stderr to `parseCompilerAndRuntimeDiagnostics`, prompts the debugger for a targeted fix, applies the patch, and re-executes the check.
- **Stage 6 (ChangeSet Derivation):** Queries `EvidenceLedger` and verifies file existence on disk to compile real `createdFiles` and `modifiedFiles`.
- **Stage 7 (Claim Checking):** Passes all claims to `ClaimChecker`. Any unsupported claim is rejected or flagged.
- **Stage 8 (Final Reporting):** Emits status, summary, and changelog grounded in evidence.

---

## 4. Test Verification & Results

### 4.1. Supervisor Test Suite (`packages/server/src/agent/supervisor.test.ts`)
10 out of 10 tests passing:
1. `AntiLoopDetector - detects repetitive tool calls with identical arguments` (PASS)
2. `AntiLoopDetector - detects repetitive identical errors` (PASS)
3. `EngineeringSupervisor - executes S4 workflow and creates verified calculator application` (PASS: verified 7+5=12, 7-5=2, 7*5=35, 20/4=5, divide-by-zero ValueError)
4. `EngineeringSupervisor - fixes fixture bug and retests with exit 0` (PASS)
5. `EngineeringSupervisor - generates HTML page listing workspace files without hallucinating` (PASS: zero hallucinated files)
6. `EngineeringSupervisor - S5 asks for authorization on destructive requests` (PASS: "delete everything in this folder")
7. `EngineeringSupervisor - S5 asks focused clarification on ambiguous requests` (PASS: "make it better")
8. `EngineeringSupervisor - stops infinite tool calling loop with blocker report` (PASS)
9. `EngineeringSupervisor - handles tool permission/missing directory failure truthfully` (PASS)
10. `ClaimChecker - rejects final report claiming non-existent file` (PASS)

### 4.2. End-to-End Loop Test (`packages/server/src/agent/loop.test.ts`)
- Multi-turn CoderAgent read & edit workflow: 1/1 PASS.
- Full event lifecycle validated (`task_started`, `agent_started`, `tool_started`, `tool_completed`, `command_started`, `command_completed`, `agent_completed`, `task_completed`).
- Git diff verified.

### 4.3. Full Server Test Suite (`npm test --workspace=packages/server`)
- Total tests: 123
- Passed: 123
- Failed: 0
- Skipped: 0
- Duration: ~6.2 seconds

---

## 5. Acceptance Criteria Checklist

| Requirement | Status | Evidence |
|---|---|---|
| S3 focused change with targeted verification | MET | Verified in `supervisor.test.ts` |
| S4 multi-stage workflow with milestones and runnable checks | MET | Verified in `supervisor.test.ts` & `loop.test.ts` |
| S5 clarification for ambiguous requests | MET | Verified in `supervisor.test.ts` (S5 "make it better") |
| S5 authorization for destructive requests | MET | Verified in `supervisor.test.ts` (S5 "delete everything") |
| Anti-loop deduplication & error detection | MET | Verified in `AntiLoopDetector` tests |
| Real ChangeSet from filesystem diff | MET | Derived via `EvidenceLedger` and `fs.existsSync` |
| Exit-code driven verification ladder | MET | Verified in `EngineeringSupervisor.execute` |
| Targeted debugger loop on failing checks | MET | Verified in bug fixture tests |
| ClaimChecker verification of final claims | MET | Verified in `claim-checker.test.ts` & `supervisor.test.ts` |

---

## 6. Handoff Notes for Prompt 05

- **Prompt 05 Scope:** Context & Conversation (`05_CONTEXT_AND_CONVERSATION.md`).
- Ensure working set tracking reflects the `ChangeSet` and `EvidenceLedger` updates made during S3/S4 tasks.
- Ensure reference resolution ("that file", "the error") leverages the recent task context, active files, and tool failure summaries.
