/* NEXUS.AI — shared application data and primitives */
(function () {
  "use strict";

  const NEXUS = (window.NEXUS = window.NEXUS || {});

  const safeRead = (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  };

  const safeWrite = (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      /* In-memory state remains authoritative. */
    }
  };

  const systemTheme = () => {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch (error) {
      return "dark";
    }
  };

  const storedTheme = safeRead("nexus-theme");
  const themePreference = ["dark", "light", "system"].includes(storedTheme) ? storedTheme : "dark";

  NEXUS.storage = { safeRead, safeWrite };

  NEXUS.state = {
    themePreference,
    theme: themePreference === "system" ? systemTheme() : themePreference,
    view: "home",
    selectedProject: "nexux",
    selectedThread: "auth-refresh",
    settingsSection: "general",
    sidebarOpen: window.innerWidth > 900,
    contextOpen: window.innerWidth > 1420,
    contextTool: "agents",
    expandedProjects: ["nexux"],
    projectFilter: "all",
    projectSearch: "",
    changesFilter: "all",
    selectedChange: "session",
    workspaceFile: "session.ts",
    openFiles: ["session.ts", "middleware.ts", "session.test.ts"],
    ideBottom: "terminal",
    terminalEntries: [],
    terminalBusy: false,
    usageRange: "30d",
    usageLoading: false,
    usageTimer: null,
    selectedModel: "GPT-4o",
    activeTask: null,
    attachments: [],
    paletteMode: "commands",
    paletteIndex: 0,
    paletteResults: [],
    providers: {
      openai: {
        id: "openai",
        name: "OpenAI",
        mark: "OA",
        connected: true,
        editing: false,
        testing: false,
        default: true,
        masked: "sk-proj-••••••••••••4f2a",
        lastChecked: "Today, 09:42",
        error: "",
        models: ["GPT-4o", "GPT-4o-mini"]
      },
      gemini: {
        id: "gemini",
        name: "Google Gemini",
        mark: "GG",
        connected: false,
        editing: false,
        testing: false,
        default: false,
        masked: "",
        lastChecked: "",
        error: "",
        models: ["Gemini 2.5 Pro", "Gemini 2.5 Flash"]
      }
    },
    settings: {
      restoreSession: true,
      nativeNotifications: false,
      autoUpdate: true,
      density: "comfortable",
      reduceMotion: false,
      autoSave: true,
      lineWrap: false,
      minimap: true,
      approvalMode: "workspace",
      parallelAgents: "auto",
      autoStage: false,
      signCommits: true,
      commitMessages: true,
      notifyComplete: true,
      notifyFailure: true,
      dailySummary: false,
      sandbox: true,
      redactSecrets: true,
      shell: "/bin/zsh",
      scrollback: "10000",
      confirmDestructive: true,
      telemetry: false,
      indexOnOpen: true,
      archiveStale: true
    },
    agentsEnabled: {
      coordinator: true,
      explorer: true,
      planner: true,
      coder: true,
      debugger: true,
      reviewer: true
    }
  };

  NEXUS.projects = [
    {
      id: "nexux",
      name: "nexux",
      path: "~/Developer/nexux",
      branch: "feature/auth-v2",
      status: "Active",
      tasks: 12,
      files: 84,
      last: "2 min ago",
      description: "Multi-tenant product platform with a TypeScript web application and Go services.",
      languages: ["TypeScript 72%", "Go 21%", "CSS 7%"],
      remote: "origin / nexux",
      baseBranch: "main"
    },
    {
      id: "demo",
      name: "demo",
      path: "~/Developer/demo",
      branch: "main",
      status: "Active",
      tasks: 3,
      files: 31,
      last: "Yesterday",
      description: "Internal prototype for evaluating new interaction patterns.",
      languages: ["TypeScript 91%", "CSS 9%"],
      remote: "origin / demo",
      baseBranch: "main"
    },
    {
      id: "smara",
      name: "smara",
      path: "~/Developer/smara",
      branch: "release/0.8",
      status: "Review",
      tasks: 7,
      files: 149,
      last: "3 days ago",
      description: "Data operations console with a scheduled ingestion pipeline.",
      languages: ["Go 48%", "TypeScript 43%", "SQL 9%"],
      remote: "origin / smara",
      baseBranch: "main"
    },
    {
      id: "raygo",
      name: "raygo",
      path: "~/Developer/raygo",
      branch: "main",
      status: "Paused",
      tasks: 1,
      files: 12,
      last: "2 weeks ago",
      description: "Ray-tracing experiments and renderer benchmarks.",
      languages: ["Rust 100%"],
      remote: "origin / raygo",
      baseBranch: "main"
    },
    {
      id: "mediscan-ai",
      name: "mediscan-ai",
      path: "~/Developer/mediscan-ai",
      branch: "feature/reporting",
      status: "Active",
      tasks: 9,
      files: 203,
      last: "4 hours ago",
      description: "Clinical document review workspace with role-aware collaboration.",
      languages: ["TypeScript 64%", "Python 30%", "CSS 6%"],
      remote: "origin / mediscan-ai",
      baseBranch: "main"
    }
  ];

  NEXUS.threads = [
    {
      id: "auth-refresh",
      projectId: "nexux",
      title: "Refactor auth middleware",
      status: "running",
      kind: "active",
      updated: "2m",
      branch: "feature/auth-v2",
      prompt:
        "Refactor the auth middleware so session refresh happens in one place. Keep the existing cookie handling and add coverage for expired access tokens.",
      detail: "Refresh logic is duplicated across three route handlers. Consolidate it at the session boundary.",
      duration: "00:42",
      progress: "2 of 5 checks passed"
    },
    {
      id: "upload-pipeline",
      projectId: "nexux",
      title: "Resumable asset uploads",
      status: "running",
      kind: "multi",
      updated: "8m",
      branch: "feature/resumable-uploads",
      prompt:
        "Add resumable uploads for files larger than 50 MB. Keep the existing S3-compatible storage adapter and preserve progress across reloads.",
      detail: "Explorer and Coder are working in parallel while Planner resolves the storage adapter contract.",
      duration: "08:16",
      progress: "4 of 7 checks passed"
    },
    {
      id: "usage-export",
      projectId: "nexux",
      title: "Export usage as CSV",
      status: "complete",
      kind: "completed",
      updated: "1h",
      branch: "feature/usage-export",
      prompt:
        "Add a CSV export to the usage dashboard. Include provider, model, agent, task, session duration, input tokens, output tokens, and estimated cost.",
      detail: "Completed in 01:18. All checks passed.",
      duration: "01:18",
      progress: "7 of 7 checks passed"
    },
    {
      id: "checkout-tests",
      projectId: "nexux",
      title: "Fix flaky checkout tests",
      status: "failed",
      kind: "failed",
      updated: "2h",
      branch: "fix/checkout-tests",
      prompt:
        "Investigate the intermittent checkout test failure in CI and stabilize the test without reducing its assertions.",
      detail: "The test runner timed out while waiting for the payment provider mock.",
      duration: "02:06",
      progress: "3 of 6 checks passed",
      errorTitle: "Verification timed out",
      errorBody:
        "The Debugger could not complete the checkout integration test. The payment provider mock did not settle within 120 seconds. No files were left in a running state.",
      errorDetail:
        "TimeoutError: payment mock did not resolve within 120000ms\n    at tests/checkout.integration.test.ts:84:11\n    at async Promise.all (index 0)"
    },
    {
      id: "telemetry-schema",
      projectId: "nexux",
      title: "Inspect telemetry schema",
      status: "complete",
      kind: "completed",
      updated: "Yesterday",
      branch: "feature/auth-v2",
      prompt:
        "Map the current telemetry event schema and identify any fields that are no longer used by the dashboard.",
      detail: "Completed in 00:36. Three unused fields were flagged.",
      duration: "00:36",
      progress: "4 of 4 checks passed"
    },
    {
      id: "demo-onboarding",
      projectId: "demo",
      title: "Review onboarding flow",
      status: "complete",
      kind: "completed",
      updated: "Yesterday",
      branch: "main",
      prompt:
        "Review the onboarding flow for keyboard traps and inconsistent focus behavior.",
      detail: "Completed in 00:24. Two focus issues were documented.",
      duration: "00:24",
      progress: "3 of 3 checks passed"
    },
    {
      id: "smara-import",
      projectId: "smara",
      title: "Harden ingestion retries",
      status: "running",
      kind: "multi",
      updated: "3d",
      branch: "release/0.8",
      prompt:
        "Harden the ingestion retry path so partial batches are idempotent and failures are visible in the run log.",
      detail: "Planner and Coder are validating retry semantics against the ingestion queue.",
      duration: "04:12",
      progress: "5 of 8 checks passed"
    },
    {
      id: "mediscan-report",
      projectId: "mediscan-ai",
      title: "Add report comparison",
      status: "running",
      kind: "active",
      updated: "4h",
      branch: "feature/reporting",
      prompt:
        "Add a side-by-side report comparison view with a clear distinction between changed findings and removed findings.",
      detail: "Coder is building the comparison surface after a completed accessibility audit.",
      duration: "11:08",
      progress: "3 of 5 checks passed"
    }
  ];

  NEXUS.agents = [
    {
      key: "coordinator",
      name: "Coordinator",
      initials: "CO",
      role: "Task routing",
      description: "Interprets the request, scopes the work, and assigns agents.",
      task: "Mapped the request to auth middleware and session tests"
    },
    {
      key: "explorer",
      name: "Explorer",
      initials: "EX",
      role: "Repository context",
      description: "Reads files, traces flows, and gathers relevant context.",
      task: "Read 18 files across auth, middleware, and tests"
    },
    {
      key: "planner",
      name: "Planner",
      initials: "PL",
      role: "Implementation plan",
      description: "Turns context into a bounded, reviewable plan.",
      task: "Plan approved with five implementation steps"
    },
    {
      key: "coder",
      name: "Coder",
      initials: "CD",
      role: "Implementation",
      description: "Edits files and keeps changes inside the approved scope.",
      task: "Editing src/server/auth/session.ts"
    },
    {
      key: "debugger",
      name: "Debugger",
      initials: "DB",
      role: "Verification",
      description: "Runs tests, traces failures, and verifies behavior.",
      task: "Queued after the Coder finishes"
    },
    {
      key: "reviewer",
      name: "Reviewer",
      initials: "RV",
      role: "Change review",
      description: "Reviews the diff against the task and project conventions.",
      task: "Queued after verification"
    }
  ];

  NEXUS.threadActivity = {
    "auth-refresh": {
      statuses: ["done", "done", "done", "working", "waiting", "waiting"],
      tasks: [
        "Mapped the request to auth middleware and session tests",
        "Read 18 files across auth, middleware, and tests",
        "Plan approved with five implementation steps",
        "Editing src/server/auth/session.ts",
        "Queued after the Coder finishes",
        "Queued after verification"
      ],
      tool: {
        command: "npm test -- auth",
        state: "Running",
        output: "PASS  tests/auth/session.test.ts\nPASS  tests/middleware/require-session.test.ts\nRUNS  tests/auth/refresh.test.ts"
      }
    },
    "upload-pipeline": {
      statuses: ["done", "working", "done", "working", "waiting", "waiting"],
      tasks: [
        "Split the work into storage, UI, and verification",
        "Tracing the upload adapter and progress events",
        "Resumable upload plan approved",
        "Implementing chunk recovery in src/lib/upload.ts",
        "Waiting for the storage adapter contract",
        "Waiting for implementation"
      ],
      tool: {
        command: "pnpm test upload",
        state: "Queued",
        output: "Waiting for Coder to finish the upload adapter changes."
      }
    },
    "usage-export": {
      statuses: ["done", "done", "done", "done", "done", "done"],
      tasks: [
        "Scoped the export to existing usage records",
        "Read the usage query and dashboard components",
        "Plan approved with three implementation steps",
        "Added the CSV export boundary",
        "8 of 8 export checks passed",
        "No blocking issues found"
      ],
      tool: {
        command: "pnpm test usage",
        state: "Passed",
        output: "PASS  tests/usage-export.test.ts\nTest Files  1 passed\nTests       8 passed"
      }
    },
    "checkout-tests": {
      statuses: ["done", "done", "done", "failed", "waiting", "waiting"],
      tasks: [
        "Scoped the flaky test investigation",
        "Read the checkout integration test and mock",
        "Plan approved with four diagnostic steps",
        "Payment mock did not resolve within the timeout",
        "Verification stopped",
        "Review not started"
      ],
      tool: {
        command: "npm test -- checkout",
        state: "Failed",
        output: "FAIL  tests/checkout.integration.test.ts\nTimeoutError: payment mock did not resolve within 120000ms"
      }
    },
    "telemetry-schema": {
      statuses: ["done", "done", "done", "done", "done", "done"],
      tasks: [
        "Scoped the schema review",
        "Read telemetry contracts and dashboard queries",
        "Review plan approved",
        "No edits required",
        "Schema references checked",
        "Three unused fields documented"
      ],
      tool: {
        command: "rg \"trackEvent|telemetry\" src",
        state: "Passed",
        output: "No blocking issues found. 3 unused field references identified."
      }
    }
  };

  NEXUS.agentActivityMap = {
    active: ["done", "done", "done", "working", "waiting", "waiting"],
    multi: ["done", "working", "done", "working", "waiting", "waiting"],
    completed: ["done", "done", "done", "done", "done", "done"],
    failed: ["done", "done", "done", "failed", "waiting", "waiting"],
    empty: ["idle", "idle", "idle", "idle", "idle", "idle"]
  };

  NEXUS.threadFiles = {
    "auth-refresh": [
      { status: "M", path: "src/server/auth/session.ts", add: 36, del: 12 },
      { status: "M", path: "src/middleware/require-session.ts", add: 12, del: 5 },
      { status: "A", path: "tests/auth/refresh.test.ts", add: 44, del: 0 }
    ],
    "upload-pipeline": [
      { status: "M", path: "src/lib/upload.ts", add: 88, del: 17 },
      { status: "A", path: "src/lib/upload-recovery.ts", add: 52, del: 0 }
    ],
    "usage-export": [
      { status: "M", path: "src/app/usage/page.tsx", add: 19, del: 4 },
      { status: "M", path: "src/lib/usage/export.ts", add: 61, del: 2 },
      { status: "A", path: "tests/usage-export.test.ts", add: 38, del: 0 }
    ],
    "checkout-tests": [
      { status: "M", path: "tests/checkout.integration.test.ts", add: 7, del: 9 }
    ],
    "telemetry-schema": [],
    "demo-onboarding": [],
    "smara-import": [
      { status: "M", path: "internal/ingest/retry.go", add: 45, del: 22 }
    ],
    "mediscan-report": [
      { status: "M", path: "src/features/reports/compare.tsx", add: 74, del: 11 }
    ]
  };

  NEXUS.defaultResponses = {
    "auth-refresh":
      "I consolidated refresh handling inside `getSession()` and removed the duplicated refresh paths from the route handlers. Existing cookie names and rotation semantics are unchanged.",
    "usage-export":
      "The usage dashboard now exports the current date range as CSV. The file includes provider, model, agent, task, session duration, input tokens, output tokens, and estimated cost.",
    "telemetry-schema":
      "The telemetry schema still contains three fields that are no longer read by the dashboard: `legacy_session_id`, `request_source`, and `render_mode`. I documented them without changing the event contract.",
    "demo-onboarding":
      "The onboarding review is complete. Two focus issues were found: focus escapes the project picker after selection, and the back action returns to the document start instead of the previous panel.",
    "checkout-tests":
      "The checkout test investigation stopped when the payment provider mock exceeded the verification timeout. The failure is isolated to the mock lifecycle and no product files were changed."
  };

  NEXUS.workspaceGroups = [
    {
      folder: "src",
      files: [
        { name: "server", type: "folder" },
        { name: "lib", type: "folder", changed: true },
        { name: "app", type: "folder" }
      ]
    },
    {
      folder: "src/server/auth",
      files: [
        { name: "session.ts", path: "src/server/auth/session.ts", changed: true },
        { name: "tokens.ts", path: "src/server/auth/tokens.ts" },
        { name: "guards.ts", path: "src/server/auth/guards.ts" }
      ]
    },
    {
      folder: "src/middleware",
      files: [
        { name: "require-session.ts", path: "src/middleware/require-session.ts", changed: true },
        { name: "rate-limit.ts", path: "src/middleware/rate-limit.ts" }
      ]
    },
    {
      folder: "src/lib",
      files: [
        { name: "db.ts", path: "src/lib/db.ts" },
        { name: "upload.ts", path: "src/lib/upload.ts" },
        { name: "telemetry.ts", path: "src/lib/telemetry.ts" }
      ]
    },
    {
      folder: "tests",
      files: [
        { name: "session.test.ts", path: "tests/auth/session.test.ts" },
        { name: "refresh.test.ts", path: "tests/auth/refresh.test.ts", changed: true },
        { name: "checkout.integration.test.ts", path: "tests/checkout.integration.test.ts", changed: true }
      ]
    }
  ];

  const k = (keyword) => `<span class="tok-key">${keyword}</span>`;
  const str = (value) => `<span class="tok-string">"${value}"</span>`;
  const type = (value) => `<span class="tok-type">${value}</span>`;
  const fn = (value) => `<span class="tok-fn">${value}</span>`;
  const num = (value) => `<span class="tok-num">${value}</span>`;
  const com = (value) => `<span class="tok-comment">// ${value}</span>`;
  const p = (value) => `<span class="tok-punct">${value}</span>`;
  const prop = (value) => `<span class="tok-prop">${value}</span>`;

  NEXUS.codeSamples = {
    "session.ts": [
      com("Centralized session refresh. All routes call this boundary."),
      `${k("import")} { cookies } ${k("from")} ${str("next/headers")}${p(";")}`,
      `${k("import")} { db } ${k("from")} ${str("@/lib/db")}${p(";")}`,
      `${k("import")} { rotateToken, verifyAccessToken } ${k("from")} ${str("@/lib/tokens")}${p(";")}`,
      "",
      `${k("export type")} ${type("Session")} ${p("= {")}`,
      `  ${prop("userId")}${p(":")} ${type("string")}${p(";")}`,
      `  ${prop("role")}${p(":")} ${str("owner")} ${p("|")} ${str("member")} ${p("|")} ${str("viewer")}${p(";")}`,
      `  ${prop("accessToken")}${p(":")} ${type("string")}${p(";")}`,
      `  ${prop("refreshToken")}${p(":")} ${type("string")}${p(";")}`,
      `${p("};")}`,
      "",
      `${k("const")} ${prop("ACCESS_WINDOW")} ${p("=")} ${num("60")} ${p("*")} ${num("5")}${p(";")}`,
      `${k("const")} ${prop("REFRESH_WINDOW")} ${p("=")} ${num("60")} ${p("*")} ${num("60")} ${p("*")} ${num("24")} ${p("*")} ${num("30")}${p(";")}`,
      "",
      `${k("export async function")} ${fn("getSession")}${p("():")} ${type("Promise")}${p("<")}${type("Session")} ${p("|")} ${type("null")}${p("> {")}`,
      `  ${k("const")} ${prop("store")} ${p("=")} ${fn("cookies")}${p("();")}`,
      `  ${k("const")} ${prop("access")} ${p("=")} ${prop("store")}${p(".")}${fn("get")}${p("(")}${str("nx_access")}${p(")?.")}${prop("value")}${p(";")}`,
      `  ${k("const")} ${prop("refresh")} ${p("=")} ${prop("store")}${p(".")}${fn("get")}${p("(")}${str("nx_refresh")}${p(")?.")}${prop("value")}${p(";")}`,
      "",
      `  ${k("if")} ${p("(!")}${prop("refresh")}${p(")")} ${k("return")} ${k("null")}${p(";")}`,
      "",
      `  ${k("if")} ${p("(")}${prop("access")} ${p("&&")} ${k("await")} ${fn("verifyAccessToken")}${p("(")}${prop("access")}${p(")) {")}`,
      `    ${k("return")} ${fn("decodeSession")}${p("(")}${prop("access")}${p(");")}`,
      `  ${p("}")}`,
      "",
      `  ${k("return")} ${fn("rotateSession")}${p("(")}${prop("refresh")}${p(");")}`,
      `${p("}")}`,
      "",
      `${k("async function")} ${fn("rotateSession")}${p("(")}${prop("refresh")}${p(":")} ${type("string")}${p(") {")}`,
      `  ${k("const")} ${prop("next")} ${p("=")} ${k("await")} ${fn("rotateToken")}${p("(")}${prop("refresh")}${p(");")}`,
      `  ${k("const")} ${prop("store")} ${p("=")} ${fn("cookies")}${p("();")}`,
      `  ${prop("store")}${p(".")}${fn("set")}${p("(")}${str("nx_access")}${p(", ")}${prop("next")}${p(".")}${prop("access")}${p(", {")}`,
      `    ${prop("httpOnly")}${p(":")} ${k("true")}${p(",")}`,
      `    ${prop("sameSite")}${p(":")} ${str("lax")}${p(",")}`,
      `    ${prop("maxAge")}${p(":")} ${prop("ACCESS_WINDOW")}`,
      `  ${p("});")}`,
      `  ${k("return")} ${fn("decodeSession")}${p("(")}${prop("next")}${p(".")}${prop("access")}${p(");")}`,
      `${p("}")}`
    ],
    "middleware.ts": [
      com("Route-level guard. Refresh is delegated to getSession()."),
      `${k("import")} { ${type("NextRequest")}, ${type("NextResponse")} } ${k("from")} ${str("next/server")}${p(";")}`,
      `${k("import")} { getSession } ${k("from")} ${str("@/server/auth/session")}${p(";")}`,
      "",
      `${k("const")} ${prop("PUBLIC_ROUTES")} ${p("=")} ${p("[")}${str("/login")}${p(", ")}${str("/health")}${p("];")}`,
      "",
      `${k("export async function")} ${fn("middleware")}${p("(")}${prop("request")}${p(":")} ${type("NextRequest")}${p(") {")}`,
      `  ${k("const")} ${prop("path")} ${p("=")} ${prop("request")}${p(".")}${prop("nextUrl")}${p(".")}${prop("pathname")}${p(";")}`,
      `  ${k("if")} ${p("(")}${prop("PUBLIC_ROUTES")}${p(".")}${fn("some")}${p("((")}${prop("route")}${p(") => ")}${prop("path")}${p(".")}${fn("startsWith")}${p("(")}${prop("route")}${p("))) {")}`,
      `    ${k("return")} ${type("NextResponse")}${p(".")}${fn("next")}${p("();")}`,
      `  ${p("}")}`,
      "",
      `  ${k("const")} ${prop("session")} ${p("=")} ${k("await")} ${fn("getSession")}${p("();")}`,
      `  ${k("if")} ${p("(!")}${prop("session")}${p(") {")}`,
      `    ${k("const")} ${prop("login")} ${p("=")} ${k("new")} ${type("URL")}${p("(")}${str("/login")}${p(", ")}${prop("request")}${p(".")}${prop("url")}${p(");")}`,
      `    ${prop("login")}${p(".")}${prop("searchParams")}${p(".")}${fn("set")}${p("(")}${str("next")}${p(", ")}${prop("path")}${p(");")}`,
      `    ${k("return")} ${type("NextResponse")}${p(".")}${fn("redirect")}${p("(")}${prop("login")}${p(");")}`,
      `  ${p("}")}`,
      "",
      `  ${k("const")} ${prop("headers")} ${p("=")} ${k("new")} ${type("Headers")}${p("(")}${prop("request")}${p(".")}${prop("headers")}${p(");")}`,
      `  ${prop("headers")}${p(".")}${fn("set")}${p("(")}${str("x-nexus-user")}${p(", ")}${prop("session")}${p(".")}${prop("userId")}${p(");")}`,
      `  ${k("return")} ${type("NextResponse")}${p(".")}${fn("next")}${p("({")} ${prop("request")}${p(": {")} ${prop("headers")} ${p("} });")}`,
      `${p("}")}`,
      "",
      `${k("export const")} ${prop("config")} ${p("=")} ${p("{")}`,
      `  ${prop("matcher")}${p(": [")}${str("/((?!_next/static|favicon.ico).*)")}${p("]")}`,
      `${p("};")}`
    ],
    "session.test.ts": [
      `${k("import")} { describe, expect, it, vi } ${k("from")} ${str("vitest")}${p(";")}`,
      `${k("import")} { getSession } ${k("from")} ${str("@/server/auth/session")}${p(";")}`,
      "",
      `${fn("describe")}${p("(")}${str("getSession")}${p(", () => {")}`,
      `  ${fn("it")}${p("(")}${str("returns an existing valid session")}${p(", async () => {")}`,
      `    ${k("const")} ${prop("session")} ${p("=")} ${k("await")} ${fn("getSession")}${p("();")}`,
      `    ${fn("expect")}${p("(")}${prop("session")}${p("?.userId).")}${fn("toBe")}${p("(")}${str("user_42")}${p(");")}`,
      `  ${p("});")}`,
      "",
      `  ${fn("it")}${p("(")}${str("refreshes an expired access token once")}${p(", async () => {")}`,
      `    ${fn("vi")}${p(".")}${fn("mock")}${p("(")}${str("@/lib/tokens")}${p(");")}`,
      `    ${k("const")} ${prop("session")} ${p("=")} ${k("await")} ${fn("getSession")}${p("();")}`,
      `    ${fn("expect")}${p("(")}${prop("session")}${p("?.accessToken).")}${fn("toBe")}${p("(")}${str("access_next")}${p(");")}`,
      `    ${fn("expect")}${p("(")}${fn("rotateToken")}${p(").")}${fn("toHaveBeenCalledTimes")}${p("(")}${num("1")}${p(");")}`,
      `  ${p("});")}`,
      "",
      `  ${fn("it")}${p("(")}${str("rejects a missing refresh token")}${p(", async () => {")}`,
      `    ${k("const")} ${prop("session")} ${p("=")} ${k("await")} ${fn("getSession")}${p("();")}`,
      `    ${fn("expect")}${p("(")}${prop("session")}${p(").")}${fn("toBeNull")}${p("();")}`,
      `  ${p("});")}`,
      `${p("});")}`
    ],
    "tokens.ts": [
      com("Token helpers shared by the auth boundary and tests."),
      `${k("import")} { jwtVerify, SignJWT } ${k("from")} ${str("jose")}${p(";")}`,
      "",
      `${k("const")} ${prop("ACCESS_SECRET")} ${p("=")} ${fn("readSecret")}${p("(")}${str("ACCESS_SECRET")}${p(");")}`,
      "",
      `${k("export async function")} ${fn("verifyAccessToken")}${p("(")}${prop("token")}${p(":")} ${type("string")}${p(") {")}`,
      `  ${k("try")} ${p("{")}`,
      `    ${k("await")} ${fn("jwtVerify")}${p("(")}${prop("token")}${p(", ")}${prop("ACCESS_SECRET")}${p(");")}`,
      `    ${k("return")} ${k("true")}${p(";")}`,
      `  ${p("}")} ${k("catch")} ${p("{")}`,
      `    ${k("return")} ${k("false")}${p(";")}`,
      `  ${p("}")}`,
      `${p("}")}`,
      "",
      `${k("export async function")} ${fn("rotateToken")}${p("(")}${prop("refresh")}${p(":")} ${type("string")}${p(") {")}`,
      `  ${k("const")} ${prop("payload")} ${p("=")} ${k("await")} ${fn("verifyRefresh")}${p("(")}${prop("refresh")}${p(");")}`,
      `  ${k("return")} ${fn("signAccessToken")}${p("(")}${prop("payload")}${p(");")}`,
      `${p("}")}`
    ],
    "require-session.ts": [
      `${k("import")} { getSession } ${k("from")} ${str("@/server/auth/session")}${p(";")}`,
      "",
      `${k("export async function")} ${fn("requireSession")}${p("() {")}`,
      `  ${k("const")} ${prop("session")} ${p("=")} ${k("await")} ${fn("getSession")}${p("();")}`,
      `  ${k("if")} ${p("(!")}${prop("session")}${p(")")} ${k("throw new")} ${type("Error")}${p("(")}${str("UNAUTHENTICATED")}${p(");")}`,
      `  ${k("return")} ${prop("session")}${p(";")}`,
      `${p("}")}`
    ]
  };

  NEXUS.fallbackCode = [
    com("File preview in the NEXUS.AI interface prototype."),
    `${k("export const")} ${prop("status")} ${p("=")} ${str("ready")}${p(";")}`,
    "",
    com("Open session.ts to inspect the active change.")
  ];

  NEXUS.changeFiles = [
    {
      id: "session",
      status: "M",
      statusLabel: "Modified",
      name: "session.ts",
      dir: "src/server/auth",
      path: "src/server/auth/session.ts",
      add: 36,
      del: 12,
      hunks: [
        {
          header: "@@ -18,6 +18,15 @@",
          lines: [
            { old: "18", next: "18", type: " ", text: `  const store = cookies();` },
            { old: "19", next: "19", type: " ", text: `  const access = store.get("nx_access")?.value;` },
            { old: "20", next: "20", type: " ", text: `  const refresh = store.get("nx_refresh")?.value;` },
            { old: "21", next: "21", type: "+", text: "" },
            { old: "", next: "22", type: "+", text: `  if (!refresh) return null;` },
            { old: "22", next: "23", type: "-", text: `  if (!access) return null;` },
            { old: "23", next: "24", type: " ", text: "" },
            { old: "24", next: "25", type: "+", text: `  if (access && await verifyAccessToken(access)) {` },
            { old: "25", next: "26", type: "+", text: `    return decodeSession(access);` },
            { old: "26", next: "27", type: "+", text: `  }` },
            { old: "27", next: "28", type: " ", text: "" },
            { old: "28", next: "29", type: "+", text: `  return rotateSession(refresh);` }
          ]
        },
        {
          header: "@@ -34,12 +43,18 @@",
          lines: [
            { old: "34", next: "43", type: " ", text: `async function rotateSession(refresh: string) {` },
            { old: "35", next: "44", type: "-", text: `  const access = await rotateToken(refresh);` },
            { old: "", next: "45", type: "+", text: `  const next = await rotateToken(refresh);` },
            { old: "36", next: "46", type: " ", text: `  const store = cookies();` },
            { old: "37", next: "47", type: " ", text: "" },
            { old: "38", next: "48", type: "-", text: `  store.set("nx_access", access);` },
            { old: "", next: "49", type: "+", text: `  store.set("nx_access", next.access, {` },
            { old: "", next: "50", type: "+", text: `    httpOnly: true,` },
            { old: "", next: "51", type: "+", text: `    sameSite: "lax",` },
            { old: "", next: "52", type: "+", text: `    maxAge: ACCESS_WINDOW` },
            { old: "", next: "53", type: "+", text: `  });` },
            { old: "39", next: "54", type: " ", text: "" },
            { old: "40", next: "55", type: "-", text: `  return decodeSession(access);` },
            { old: "", next: "56", type: "+", text: `  return decodeSession(next.access);` }
          ]
        }
      ]
    },
    {
      id: "middleware",
      status: "M",
      statusLabel: "Modified",
      name: "require-session.ts",
      dir: "src/middleware",
      path: "src/middleware/require-session.ts",
      add: 12,
      del: 5,
      hunks: [
        {
          header: "@@ -1,7 +1,12 @@",
          lines: [
            { old: "1", next: "1", type: " ", text: `import { getSession } from "@/server/auth/session";` },
            { old: "2", next: "2", type: " ", text: "" },
            { old: "3", next: "3", type: "-", text: `export function requireSession(request: Request) {` },
            { old: "", next: "4", type: "+", text: `export async function requireSession() {` },
            { old: "4", next: "5", type: "-", text: `  return request.headers.get("x-user");` },
            { old: "", next: "6", type: "+", text: `  const session = await getSession();` },
            { old: "", next: "7", type: "+", text: `  if (!session) throw new Error("UNAUTHENTICATED");` },
            { old: "", next: "8", type: "+", text: `  return session;` }
          ]
        }
      ]
    },
    {
      id: "test",
      status: "A",
      statusLabel: "Added",
      name: "refresh.test.ts",
      dir: "tests/auth",
      path: "tests/auth/refresh.test.ts",
      add: 44,
      del: 0,
      hunks: [
        {
          header: "@@ -0,0 +1,20 @@",
          lines: [
            { old: "", next: "1", type: "+", text: `import { describe, expect, it, vi } from "vitest";` },
            { old: "", next: "2", type: "+", text: `import { getSession } from "@/server/auth/session";` },
            { old: "", next: "3", type: "+", text: "" },
            { old: "", next: "4", type: "+", text: `describe("session refresh", () => {` },
            { old: "", next: "5", type: "+", text: `  it("refreshes an expired access token once", async () => {` },
            { old: "", next: "6", type: "+", text: `    vi.mock("@/lib/tokens");` },
            { old: "", next: "7", type: "+", text: `    const session = await getSession();` },
            { old: "", next: "8", type: "+", text: `    expect(session?.accessToken).toBe("access_next");` },
            { old: "", next: "9", type: "+", text: `    expect(rotateToken).toHaveBeenCalledTimes(1);` },
            { old: "", next: "10", type: "+", text: `  });` },
            { old: "", next: "11", type: "+", text: `});` }
          ]
        }
      ]
    },
    {
      id: "legacy",
      status: "D",
      statusLabel: "Deleted",
      name: "refresh-session.ts",
      dir: "src/server/auth",
      path: "src/server/auth/refresh-session.ts",
      add: 0,
      del: 31,
      hunks: [
        {
          header: "@@ -1,8 +0,0 @@",
          lines: [
            { old: "1", next: "", type: "-", text: `export async function refreshSession(request: Request) {` },
            { old: "2", next: "", type: "-", text: `  const oldToken = request.headers.get("x-refresh-token");` },
            { old: "3", next: "", type: "-", text: `  if (!oldToken) return null;` },
            { old: "4", next: "", type: "-", text: `  return rotateToken(oldToken);` },
            { old: "5", next: "", type: "-", text: `}` },
            { old: "6", next: "", type: "-", text: "" },
            { old: "7", next: "", type: "-", text: `// Refresh now lives in src/server/auth/session.ts.` },
            { old: "8", next: "", type: "-", text: `// Kept here temporarily for the migration.` }
          ]
        }
      ]
    },
    {
      id: "schema",
      status: "R",
      statusLabel: "Renamed",
      name: "auth-session.ts",
      dir: "src/server/auth",
      path: "src/server/auth/auth-session.ts",
      add: 4,
      del: 4,
      hunks: [
        {
          header: "@@ -1,8 +1,8 @@",
          lines: [
            { old: "1", next: "1", type: " ", text: `export type AuthSession = {` },
            { old: "2", next: "2", type: " ", text: `  userId: string;` },
            { old: "3", next: "3", type: " ", text: `  role: "owner" | "member" | "viewer";` },
            { old: "4", next: "4", type: "-", text: `  token: string;` },
            { old: "", next: "5", type: "+", text: `  accessToken: string;` },
            { old: "", next: "6", type: "+", text: `  refreshToken: string;` },
            { old: "5", next: "7", type: " ", text: `};` }
          ]
        }
      ]
    }
  ];

  NEXUS.settingsSections = [
    { id: "general", label: "General", icon: "sliders", group: "Application" },
    { id: "appearance", label: "Appearance", icon: "sun", group: "Application" },
    { id: "projects", label: "Projects", icon: "folder", group: "Application" },
    { id: "workspace", label: "Workspace", icon: "code", group: "Application" },
    { id: "agents", label: "Agents", icon: "workflow", group: "Intelligence" },
    { id: "models", label: "Models", icon: "cpu", group: "Intelligence" },
    { id: "providers", label: "API Providers", icon: "key", group: "Intelligence" },
    { id: "usage", label: "Usage", icon: "chart", group: "Intelligence" },
    { id: "security", label: "Security", icon: "shield", group: "System" },
    { id: "terminal", label: "Terminal", icon: "terminal", group: "System" },
    { id: "git", label: "Git", icon: "branch", group: "System" },
    { id: "notifications", label: "Notifications", icon: "bell", group: "System" },
    { id: "about", label: "About", icon: "info", group: "System" }
  ];

  NEXUS.models = [
    {
      provider: "OpenAI",
      providerId: "openai",
      mark: "OA",
      items: [
        { name: "GPT-4o", context: "128k context", default: true },
        { name: "GPT-4o-mini", context: "128k context" }
      ]
    },
    {
      provider: "Google Gemini",
      providerId: "gemini",
      mark: "GG",
      items: [
        { name: "Gemini 2.5 Pro", context: "1M context" },
        { name: "Gemini 2.5 Flash", context: "1M context" }
      ]
    }
  ];

  NEXUS.usage = {
    "7d": {
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      requests: [184, 226, 201, 268, 312, 154, 247],
      input: [174000, 208000, 182000, 244000, 286000, 132000, 221000],
      output: [42000, 51000, 46000, 59000, 71000, 33000, 54000],
      cost: [9.2, 11.4, 10.1, 13.2, 15.1, 7.4, 12.6],
      latency: 38
    },
    "30d": {
      labels: ["Sep 27", "Sep 30", "Oct 3", "Oct 6", "Oct 9", "Oct 12", "Oct 15", "Oct 18", "Oct 21", "Oct 24"],
      requests: [842, 917, 1004, 886, 1126, 1238, 1097, 1304, 1268, 1412],
      input: [712000, 806000, 892000, 764000, 984000, 1082000, 921000, 1126000, 1094000, 1221000],
      output: [186000, 205000, 228000, 194000, 252000, 281000, 239000, 292000, 284000, 318000],
      cost: [38.2, 42.7, 45.9, 39.4, 50.8, 56.1, 48.9, 60.4, 58.1, 64.7],
      latency: 41
    },
    "90d": {
      labels: ["Aug 1", "Aug 9", "Aug 17", "Aug 25", "Sep 2", "Sep 10", "Sep 18", "Sep 26", "Oct 4", "Oct 12", "Oct 20", "Oct 26"],
      requests: [3182, 3408, 3664, 3291, 4078, 4326, 3984, 4672, 4891, 5124, 5462, 5730],
      input: [2638000, 2824000, 3057000, 2723000, 3441000, 3652000, 3368000, 3921000, 4104000, 4328000, 4582000, 4811000],
      output: [712000, 754000, 812000, 726000, 912000, 968000, 884000, 1036000, 1089000, 1142000, 1208000, 1274000],
      cost: [142.4, 151.8, 165.1, 148.9, 186.4, 198.7, 182.3, 210.2, 219.8, 230.4, 243.1, 256.8],
      latency: 44
    }
  };

  NEXUS.modelUsage = [
    { mark: "O", model: "GPT-4o", provider: "OpenAI", requests: 1264, tokens: 1642000, cost: "41.32", share: 58 },
    { mark: "O", model: "GPT-4o-mini", provider: "OpenAI", requests: 486, tokens: 418000, cost: "7.14", share: 20 },
    { mark: "G", model: "Gemini 2.5 Pro", provider: "Google", requests: 312, tokens: 392000, cost: "9.18", share: 16 },
    { mark: "G", model: "Gemini 2.5 Flash", provider: "Google", requests: 142, tokens: 128000, cost: "2.41", share: 6 }
  ];

  NEXUS.agentUsage = [
    { key: "coder", initials: "CD", name: "Coder", share: "42%" },
    { key: "debugger", initials: "DB", name: "Debugger", share: "21%" },
    { key: "explorer", initials: "EX", name: "Explorer", share: "16%" },
    { key: "planner", initials: "PL", name: "Planner", share: "11%" },
    { key: "reviewer", initials: "RV", name: "Reviewer", share: "6%" },
    { key: "coordinator", initials: "CO", name: "Coordinator", share: "4%" }
  ];

  NEXUS.recentSessions = [
    {
      session: "ses_84f2a1",
      task: "Refactor auth middleware",
      agent: "Coder",
      model: "GPT-4o",
      duration: "01:18",
      tokens: "84.2k"
    },
    {
      session: "ses_71c8de",
      task: "Export usage as CSV",
      agent: "Coder",
      model: "GPT-4o",
      duration: "02:06",
      tokens: "61.7k"
    },
    {
      session: "ses_3b91aa",
      task: "Inspect telemetry schema",
      agent: "Explorer",
      model: "Gemini 2.5 Pro",
      duration: "00:36",
      tokens: "28.4k"
    },
    {
      session: "ses_0d4e77",
      task: "Fix flaky checkout tests",
      agent: "Debugger",
      model: "GPT-4o-mini",
      duration: "03:44",
      tokens: "41.9k"
    }
  ];

  NEXUS.initialTerminalEntries = [
    {
      id: "term-1",
      ai: true,
      command: "npm run build",
      cwd: "~/Developer/nexux",
      state: "completed",
      output: [
        { text: "> nexux@2.1.0 build", tone: "muted" },
        { text: "> next build", tone: "muted" },
        { text: "", tone: "muted" },
        { text: "▲ Next.js 15.2.3", tone: "info" },
        { text: "✓ Compiled successfully in 1.8s", tone: "ok" },
        { text: "✓ Collecting page data", tone: "ok" },
        { text: "✓ Generating static pages (14/14)", tone: "ok" },
        { text: "", tone: "muted" },
        { text: "Route (app)                    Size     First Load JS", tone: "muted" },
        { text: "/                              1.4 kB          96 kB", tone: "muted" },
        { text: "/projects                      2.1 kB         112 kB", tone: "muted" },
        { text: "/usage                         3.8 kB         124 kB", tone: "muted" },
        { text: "", tone: "muted" },
        { text: "✓ Build completed · exit code 0 · 2.4s", tone: "ok" }
      ]
    },
    {
      id: "term-2",
      ai: false,
      command: "git status --short",
      cwd: "~/Developer/nexux",
      state: "completed",
      output: [
        { text: " M src/server/auth/session.ts", tone: "warn" },
        { text: " M src/middleware/require-session.ts", tone: "warn" },
        { text: "?? tests/auth/refresh.test.ts", tone: "ok" }
      ]
    }
  ];

  NEXUS.terminalHistory = [];

  NEXUS.contextFiles = [
    { name: "session.ts", path: "src/server/auth/session.ts", changed: true },
    { name: "require-session.ts", path: "src/middleware/require-session.ts", changed: true },
    { name: "refresh.test.ts", path: "tests/auth/refresh.test.ts", changed: true },
    { name: "tokens.ts", path: "src/server/auth/tokens.ts" },
    { name: "upload.ts", path: "src/lib/upload.ts" },
    { name: "telemetry.ts", path: "src/lib/telemetry.ts" }
  ];

  NEXUS.icons = {
    file: "file",
    folder: "folder"
  };

  NEXUS.helpers = {
    escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    },
    icon(name, extraClass) {
      const cls = extraClass ? `od-icon ${extraClass}` : "od-icon";
      return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
    },
    formatTokens(value) {
      if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
      if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
      return String(value);
    },
    formatCost(value) {
      return `$${Number(value).toFixed(2)}`;
    },
    projectById(id) {
      return NEXUS.projects.find((project) => project.id === id) || NEXUS.projects[0];
    },
    threadById(id) {
      return NEXUS.threads.find((thread) => thread.id === id) || null;
    },
    threadsForProject(id) {
      return NEXUS.threads.filter((thread) => thread.projectId === id);
    },
    statusTone(status) {
      if (status === "running" || status === "Working") return "is-working";
      if (status === "complete" || status === "Completed" || status === "Active") return "is-success";
      if (status === "failed" || status === "Failed") return "is-danger";
      if (status === "waiting" || status === "Review") return "is-warning";
      return "is-idle";
    },
    statusLabel(status) {
      const map = {
        running: "Working",
        complete: "Completed",
        failed: "Failed",
        waiting: "Waiting",
        active: "Active",
        archived: "Archived",
        paused: "Paused",
        review: "Review"
      };
      return map[status] || status;
    },
    totalTokens(record) {
      return record.input.reduce((sum, value) => sum + value, 0) + record.output.reduce((sum, value) => sum + value, 0);
    },
    sum(values) {
      return values.reduce((total, value) => total + value, 0);
    }
  };

  NEXUS.currentTheme = () => {
    const pref = NEXUS.state.themePreference;
    return pref === "system" ? systemTheme() : pref;
  };
})();
