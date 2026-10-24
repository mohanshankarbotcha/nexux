# NEXUS.AI Brain Upgrade — Handoff Ledger

This file tracks defects, architectural gaps, and cross-cutting requirements discovered during each stage of the Brain Upgrade. Each item is tagged with the prompt responsible for addressing it.

---

## Active Handoff Items

| ID | Originating Prompt | Target Prompt | Area | Summary | Status |
|:---|:---|:---|:---|:---|:---|
| H-01 | 01 Audit | 02 Tools | Tool Envelope | Tools currently return unstandardized payloads without evidence ID or typed error envelopes. | OPEN |
| H-02 | 01 Audit | 02 Tools | Path Resolution | "demo folder" and colloquial references fail path normalization; exact disk resolution needed. | OPEN |
| H-03 | 01 Audit | 02 Tools | Protected Paths | App's own source folder and `%LOCALAPPDATA%\NEXUS_AI_DATA` lack affirmative default-deny protection. | OPEN |
| H-04 | 01 Audit | 03 Router | Fast Paths | Every request (including greetings and folder lookups) initializes the 6-agent coordinator pipeline. | OPEN |
| H-05 | 01 Audit | 03 Router | Route Decision | No typed schema-validated `RouteDecision` exists; intent classification is missing. | OPEN |
| H-06 | 01 Audit | 04 Workflow | Supervisor | LLM decides next stage rather than a deterministic supervisor state machine; loops occur on errors. | OPEN |
| H-07 | 01 Audit | 04 Workflow | Runnable Verification | Acceptance checks are not defined prior to code writing; verification relies on LLM self-evaluation. | OPEN |
| H-08 | 01 Audit | 05 Context | Reference Resolver | Follow-up references like "open that file" or "run the tests again" lose context across turns. | OPEN |
| H-09 | 01 Audit | 05 Context | Project Profile | Repo structure and build/test commands are rediscovered on every single task. | OPEN |
| H-10 | 01 Audit | 06 Speed | Preflight Probe | Preflight generation probe adds fixed latency to every request; needs caching and metadata preference. | OPEN |
| H-11 | 01 Audit | 06 Speed | Budgets & Recovery | No per-route token/time budgets or anti-loop no-progress detection. | OPEN |
| H-12 | 01 Audit | 07 Evals | Evaluation Suite | No repeatable automated multi-prompt evaluation harness (E01–E36) exists. | OPEN |
