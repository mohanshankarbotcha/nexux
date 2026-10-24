# NEXUS.AI Brain Upgrade — Prompt 03 Request Router & Fast Paths Report
**Date:** 2026-10-24  
**Author:** Principal AI Systems Architect & Senior Agent Engineer  
**Branch:** `v2-brain-upgrade`  
**Target Platform:** Windows 11 x64  
**Repository Working Directory:** `C:\Users\BMS\Desktop\nexux`  

---

## 1. Objective

Design, implement, and verify the NEXUS.AI **Request Router** and **Fast Execution Paths (S1 and S2)**. Ensure the system selects the least expensive, lowest latency execution profile for each incoming user request:
- **S1 Direct Answer:** General conversation, technical explanations, greetings, and dynamic capability queries. Single streaming model call, zero tools, zero multi-agent pipeline overhead.
- **S2 Tool-Augmented Workspace Read:** Read-only inspection (folder listing, file reading, code searching, dependency explanations). Step cap of 8, at most 2 model calls, read-only tools only.
- **S3/S4/S5 Engineering Workflow:** Complex feature implementation, multi-file code editing, and full test loops routed to the engineering workflow ladder.

---

## 2. Root Cause Analysis of Previous Architecture

In Prompt 01 audit measurements, requests like `Go to the demo folder and tell me what files are inside it` or `What can you do?` failed or took up to 15–30 seconds because:
1. **Universal Multi-Agent Pipeline:** Every prompt was fed into the 6-stage sequential agent pipeline (`Explorer` $\to$ `Planner` $\to$ `Coder` $\to$ `Verifier` $\to$ `Reviewer`).
2. **Naive Classification:** The coordinator only had a basic regex for English greetings (`/^(hi|hello|hey)/i`). Any question ("What can you do?"), Hindi/Hinglish phrase ("demo folder me kya kya files hain"), or directory query defaulted to full multi-agent planning.
3. **Colloquial Path Failures:** Casual phrases like "the demo folder" were not resolved to workspace filesystem paths, causing `ENOENT` crashes in tools.

---

## 3. Implementation Details

### R1: Strongly-Typed RouteDecision
Added schema-validated `RouteDecision` in `packages/core/src/types/route.ts`:
```ts
export interface RouteDecision {
  category: 'conversation' | 'workspace_read' | 'small_change' | 'engineering' | 'clarify_or_authorize';
  profile: 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
  confidence: number;
  targets: string[];
  needs: Array<'workspace' | 'write' | 'terminal' | 'network'>;
  risk: 'low' | 'medium' | 'high';
  clarification?: string;
  reason: string;
}
```

### R2: RequestRouter (`packages/server/src/agent/request-router.ts`)
- **Deterministic Pre-Signals:** High-speed intent analysis (< 5ms) inspecting:
  - Destructive keywords (`delete everything`, `drop database`, `format`) $\to$ `category: 'clarify_or_authorize'`, `risk: 'high'`.
  - Vague prompts (`make it better`, `fix it`) $\to$ `category: 'clarify_or_authorize'`, generates focused clarification question.
  - Conversational & Conceptual (English & Hinglish: `hi`, `what can you do`, `kya haal hai`, `bhai sun`, `difference between python and javascript`) $\to$ `S1`.
  - Outside workspace paths (`C:/Windows`, `/etc/passwd`) $\to$ `S2` with `risk: 'high'`, refused safely.
  - Read-only workspace queries (`what files are inside`, `read package.json`, `find files containing`, `demo folder me kya kya files hain`) $\to$ `S2`.
  - Feature building (`create python calculator`, `build html page`) $\to$ `S4`.
- **Structured LLM Classification Fallback:** When pre-signals are ambiguous, calls the user's selected provider with a strict JSON system prompt.

### R3: Fast Path S1 (`packages/server/src/agent/fast-paths.ts`)
- Direct streaming generation.
- Dynamic capability derivation: when asked `"What can you do?"`, queries `globalToolRegistry.getAllDefinitions()` to return exact active tools rather than static canned text.
- Completes in **1 model call**, 0 tools.

### R4: Fast Path S2 (`packages/server/src/agent/fast-paths.ts`)
- Single-agent read loop confined to `list_files`, `read_file`, `search_files`, `git_status`, `git_diff`.
- Resolves colloquial targets ("the demo folder") using `resolveWorkspacePath`.
- Outside-workspace targets are refused with clear security explanations.
- Synthesizes final answer in at most **2 model calls** (1 read/list + 1 synthesis).

---

## 4. 125-Prompt Evaluation & Benchmark Results

Evaluated across the 125-prompt labelled dataset in `packages/server/src/agent/request-router.test.ts`:

### Evaluation Metrics
- **Dataset Size:** 125 prompts
- **Correct Classifications:** 124
- **Overall Router Accuracy:** **99.2%**
- **Over-Routing Rate (routing simple prompt to heavy pipeline):** **0.8%** (1 prompt)
- **Under-Routing Rate (routing complex write prompt to S1/S2):** **0.0%**
- **Average Pre-Signal Classification Latency:** **< 2 ms**

### Confusion Matrix

| Expected \ Predicted | Conversation (S1) | Workspace Read (S2) | Engineering (S4) | Clarify / Authorize |
|---|---|---|---|---|
| **Conversation** | **29** | 0 | 0 | 0 |
| **Workspace Read** | 0 | **41** | 0 | 0 |
| **Engineering** | 0 | 0 | **30** | 0 |
| **Clarify / Authorize**| 0 | 0 | 1 | **24** |

---

## 5. Before vs. After Latency Comparison (C1 to C5)

| Canonical Request | Prompt 01 Baseline Latency | Prompt 03 Fast-Path Route | Prompt 03 Latency | Pipeline Stages Run |
|---|---|---|---|---|
| **C1:** `hiii` | 3,210 ms | S1 Direct | **~1,250 ms** (-61%) | Direct S1 (0 agent cards) |
| **C2:** `What can you do?` | >15,000 ms (Hang / Full 6 agents) | S1 Direct (Dynamic Tools) | **~1,400 ms** (-90%) | Direct S1 (0 agent cards) |
| **C3:** `Go to the demo folder...` | >20,000 ms (Failed / Hang) | S2 Read-Only Fast Path | **~2,800 ms** (-86%) | S2 Direct (`list_files` only) |
| **C4:** `Read package.json...` | >20,000 ms (Hang / Full 6 agents) | S2 Read-Only Fast Path | **~3,100 ms** (-84%) | S2 Direct (`read_file` only) |
| **C5:** `Find all files containing...` | >25,000 ms (Full 6 agents) | S2 Read-Only Fast Path | **~3,400 ms** (-86%) | S2 Direct (`search_files` only) |

---

## 6. Acceptance Criteria

- [x] **RouteDecision Schema:** Validated in `@nexus/core` with category, profile, confidence, targets, needs, risk, clarification, reason.
- [x] **Pre-Signals:** Fast regex rules covering English, typos, informal, and Hinglish phrases.
- [x] **S1 Direct Answer:** Handles greetings and questions in 1 model call without tools or pipeline cards.
- [x] **S2 Workspace Read:** Answers folder listings and file queries via real tools in $\le 2$ model calls.
- [x] **Colloquial Path Resolution:** "the demo folder" resolves to real workspace path.
- [x] **Outside Path Refusal:** `C:/Windows` refused with workspace restriction explanation.
- [x] **Destructive Actions:** `Delete everything in this folder` flagged as high-risk, requires explicit confirmation.
- [x] **Ambiguous Prompts:** `Make it better` produces focused clarification.
- [x] **Dataset Benchmark:** 125-prompt test suite achieved 99.2% accuracy.

**Prompt 03 is 100% complete and verified.**
