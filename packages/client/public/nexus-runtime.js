/* NEXUS.AI 2.1 — live runtime bridge between the redesigned interface and the local API. */
(function () {
  "use strict";

  const NEXUS = (window.NEXUS = window.NEXUS || {});
  const H = NEXUS.helpers;
  const S = () => NEXUS.state;

  const VERSION = "2.1.0";
  const TOKEN =
    window.__NEXUS_API_TOKEN__ ||
    (function () {
      try {
        return new URLSearchParams(window.location.search).get("token") || "";
      } catch (error) {
        return "";
      }
    })();

  const AGENT_ORDER = ["coordinator", "explorer", "planner", "coder", "debugger", "reviewer"];
  const AGENT_NAMES = {
    coordinator: "Coordinator",
    explorer: "Explorer",
    planner: "Planner",
    coder: "Coder",
    debugger: "Debugger",
    reviewer: "Reviewer",
  };
  const TERMINAL_STATES = new Set(["completed", "failed", "cancelled"]);
  const EVENT_TYPES = [
    "task_started",
    "task_progress",
    "task_heartbeat",
    "agent_started",
    "agent_message",
    "tool_started",
    "tool_completed",
    "file_changed",
    "command_started",
    "command_completed",
    "test_failed",
    "agent_completed",
    "task_completed",
    "task_failed",
    "task_cancelled",
  ];

  const runtime = {
    live: false,
    raw: null,
    records: [],
    sessionById: new Map(),
    threadById: new Map(),
    streams: new Map(),
    polls: new Map(),
    lastRender: 0,
    renderTimer: null,
    bootError: null,
  };

  NEXUS.version = VERSION;
  NEXUS.live = false;

  /* --------------------------------------------------------------------- */
  /* HTTP                                                                  */
  /* --------------------------------------------------------------------- */

  async function api(path, options) {
    const opts = options || {};
    const headers = Object.assign({ Accept: "application/json" }, opts.headers || {});
    if (opts.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    if (TOKEN) headers["X-Nexus-Token"] = TOKEN;
    const response = await fetch(path, Object.assign({}, opts, { headers }));
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (error) {
      data = { raw: text };
    }
    if (!response.ok) {
      const message = (data && (data.error || data.message)) || `Request failed (${response.status})`;
      const err = new Error(message);
      err.status = response.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  const secs = (ms) => `${String(Math.floor(ms / 1000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

  function formatDuration(ms) {
    const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function relativeTime(timestamp) {
    if (!timestamp) return "unknown";
    const delta = Math.max(0, Date.now() - Number(timestamp));
    if (delta < 45_000) return "just now";
    if (delta < 3_600_000) return `${Math.max(1, Math.round(delta / 60_000))}m`;
    if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h`;
    if (delta < 7 * 86_400_000) return `${Math.round(delta / 86_400_000)}d`;
    return new Date(Number(timestamp)).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function timeOf(timestamp) {
    if (!timestamp) return "--:--";
    return new Date(Number(timestamp)).toTimeString().slice(0, 5);
  }

  function normalizePath(value) {
    return String(value || "")
      .replace(/\\/g, "/")
      .replace(/\/+$/, "")
      .toLowerCase();
  }

  function filePathOf(file) {
    if (!file) return "";
    if (typeof file === "string") return file;
    return file.relativePath || file.filePath || file.path || file.file || "";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function markFor(provider) {
    return provider === "openai" ? "OA" : provider === "gemini" ? "GG" : String(provider || "AI").slice(0, 2).toUpperCase();
  }

  function statusForTask(task) {
    if (task.status === "completed") return "complete";
    if (task.status === "failed" || task.status === "cancelled") return "failed";
    return "running";
  }

  function kindForTask(task) {
    if (task.status === "completed") return "completed";
    if (task.status === "failed" || task.status === "cancelled") return "failed";
    return task.activeAgents && task.activeAgents.length > 1 ? "multi" : "active";
  }

  function agentIndexFor(task) {
    const taskStatus = task.status === "complete" ? "completed" : task.status;
    const role = task.currentAgentRole || (task.activeAgents || []).map((a) => a.role).filter(Boolean).pop();
    const idx = AGENT_ORDER.indexOf(role);
    if (idx >= 0) return idx;
    const stage = String(task.stage || "").toLowerCase();
    if (/review/.test(stage)) return 5;
    if (/verif|test|debug/.test(stage)) return 4;
    if (/implement|edit|code|write/.test(stage)) return 3;
    if (/plan/.test(stage)) return 2;
    if (/explor|read|context/.test(stage)) return 1;
    return taskStatus === "completed" ? 5 : 0;
  }

  function activityFor(task) {
    const taskStatus = task.status === "complete" ? "completed" : task.status;
    const index = agentIndexFor(task);
    const statuses = AGENT_ORDER.map((_, i) => {
      if (taskStatus === "completed") return "done";
      if (taskStatus === "failed" || taskStatus === "cancelled") {
        if (i < index) return "done";
        if (i === index) return "failed";
        return "waiting";
      }
      if (taskStatus === "pending") return i === index ? "waiting" : "idle";
      if (i < index) return "done";
      if (i === index) return "working";
      return "waiting";
    });
    const stage = task.stage || taskStatus;
    const tasks = AGENT_ORDER.map((role, i) => {
      if (taskStatus === "completed") return i === 0 ? (task.resultSummary || "Task completed") : `${AGENT_NAMES[role]} finished`;
      if (taskStatus === "failed" && i === index) return task.error || `${AGENT_NAMES[role]} failed`;
      if (i < index) return `${AGENT_NAMES[role]} finished`;
      if (i === index) return `${AGENT_NAMES[role]} · ${stage}`;
      return `${AGENT_NAMES[role]} queued`;
    });
    const changed = Array.isArray(task.changedFiles) ? task.changedFiles : [];
    return {
      statuses,
      tasks,
      tool: {
        command: task.stage ? String(task.stage) : "No active tool",
        state:
          taskStatus === "completed"
            ? "Passed"
            : taskStatus === "failed" || taskStatus === "cancelled"
              ? "Stopped"
              : taskStatus === "running"
                ? "Running"
                : "Queued",
        output:
          task.error ||
          (changed.length
            ? `${changed.length} file${changed.length === 1 ? "" : "s"} changed in this task.`
            : "No tool output has been recorded yet."),
      },
    };
  }

  /* --------------------------------------------------------------------- */
  /* Mapping                                                               */
  /* --------------------------------------------------------------------- */

  function mapProjects(workspaces, tasks, sessions) {
    const taskCounts = new Map();
    const sessionById = new Map((sessions || []).map((session) => [session.id, session]));
    runtime.sessionById = sessionById;
    for (const task of tasks) {
      const session = sessionById.get(task.sessionId);
      const path = session && session.workspacePath;
      if (!path) continue;
      const key = normalizePath(path);
      taskCounts.set(key, (taskCounts.get(key) || 0) + 1);
    }
    return (workspaces || []).map((workspace) => {
      const key = normalizePath(workspace.path);
      return {
        id: workspace.id,
        name: workspace.name,
        path: workspace.path,
        branch: workspace.branch || "local",
        status: "Active",
        tasks: taskCounts.get(key) || 0,
        files: runtime.fileCounts && runtime.fileCounts.has(key) ? runtime.fileCounts.get(key) : null,
        last: relativeTime(workspace.lastOpenedAt || workspace.createdAt),
        description: `Local workspace · ${workspace.path}`,
        languages: [],
        remote: workspace.path,
        baseBranch: workspace.branch || "main",
        createdAt: workspace.createdAt,
        lastOpenedAt: workspace.lastOpenedAt,
      };
    });
  }

  function projectForTask(task, projects) {
    const session = runtime.sessionById.get(task.sessionId);
    const sessionPath = session && session.workspacePath;
    if (sessionPath) {
      const key = normalizePath(sessionPath);
      const match = projects.find((project) => normalizePath(project.path) === key);
      if (match) return match;
    }
    return projects[0] || null;
  }

  function mapThreads(tasks, projects) {
    runtime.threadById = new Map();
    const sorted = [...(tasks || [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 100);
    return sorted.map((task) => {
      const project = projectForTask(task, projects);
      const status = statusForTask(task);
      const now = Date.now();
      const started = task.startedAt || task.createdAt || now;
      const ended = task.completedAt || (status === "running" ? now : task.updatedAt || now);
      const detail =
        task.resultSummary ||
        task.error ||
        (status === "running"
          ? `Stage: ${task.stage || "running"}${task.currentAgentRole ? ` · ${AGENT_NAMES[task.currentAgentRole] || task.currentAgentRole}` : ""}`
          : `Stage: ${task.stage || task.status}`);
      const thread = {
        id: task.id,
        taskId: task.id,
        sessionId: task.sessionId,
        projectId: project ? project.id : null,
        title: (task.prompt || "Untitled task").replace(/\s+/g, " ").trim().slice(0, 72) || "Untitled task",
        status,
        kind: kindForTask(task),
        updated: relativeTime(task.updatedAt || task.completedAt || task.createdAt),
        branch: project ? project.branch : "local",
        prompt: task.prompt || "",
        detail,
        duration: formatDuration(Math.max(0, ended - started)),
        progress:
          status === "complete"
            ? "Completed"
            : status === "failed"
              ? task.status === "cancelled"
                ? "Cancelled"
                : "Failed"
              : `Stage: ${task.stage || "running"}`,
        startedAt: started,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt || task.completedAt,
        completedAt: task.completedAt,
        tokens: task.totalTokens || 0,
        provider: task.providerMetadata && task.providerMetadata.provider,
        model: task.providerMetadata && task.providerMetadata.model,
        resultSummary: task.resultSummary,
        error: task.error,
        changedFiles: Array.isArray(task.changedFiles) ? task.changedFiles : [],
        activeAgents: Array.isArray(task.activeAgents) ? task.activeAgents : [],
        stage: task.stage,
        currentAgentRole: task.currentAgentRole,
        cancelled: task.status === "cancelled",
      };
      if (status === "failed") {
        const error = String(task.error || (task.status === "cancelled" ? "Task cancelled by the user." : "Task failed."));
        const lines = error.split(/\r?\n/);
        thread.errorTitle = task.status === "cancelled" ? "Execution cancelled" : lines[0].slice(0, 120);
        thread.errorBody = lines.slice(1).join(" ").trim() || lines[0];
        thread.errorDetail = error;
      }
      return thread;
    });
  }

  function hydrateMessages(threads, tasks) {
    const taskById = new Map((tasks || []).map((task) => [task.id, task]));
    const messages = {};
    const responses = {};
    for (const thread of threads) {
      const task = taskById.get(thread.id) || {};
      const list = [{ role: "user", text: thread.prompt, time: timeOf(thread.createdAt) }];
      if (task.resultSummary) {
        list.push({ role: "agent", text: task.resultSummary, time: timeOf(task.completedAt || task.updatedAt) });
        responses[thread.id] = task.resultSummary;
      } else if (thread.detail) {
        responses[thread.id] = thread.detail;
      }
      messages[thread.id] = list;
    }
    S().threadMessages = messages;
    NEXUS.defaultResponses = responses;
  }

  function buildUsageBuckets(records, days, bucketCount) {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
    const start = end - days * 86_400_000 + 1;
    const span = (end - start + 1) / bucketCount;
    const labels = [];
    for (let i = 0; i < bucketCount; i += 1) {
      const point = new Date(start + span * i + span / 2);
      labels.push(
        days <= 7
          ? point.toLocaleDateString("en-US", { weekday: "short" })
          : point.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      );
    }
    const requests = new Array(bucketCount).fill(0);
    const input = new Array(bucketCount).fill(0);
    const output = new Array(bucketCount).fill(0);
    const cost = new Array(bucketCount).fill(0);
    const latencyTotals = new Array(bucketCount).fill(0);
    const latencyCounts = new Array(bucketCount).fill(0);
    for (const record of records) {
      const ts = Number(record.timestamp || 0);
      if (ts < start || ts > end) continue;
      const index = Math.min(bucketCount - 1, Math.max(0, Math.floor((ts - start) / span)));
      requests[index] += 1;
      input[index] += Number(record.inputTokens || 0);
      output[index] += Number(record.outputTokens || 0);
      cost[index] += Number(record.estimatedCostUsd || 0);
      if (record.durationMs) {
        latencyTotals[index] += Number(record.durationMs);
        latencyCounts[index] += 1;
      }
    }
    const latency =
      latencyCounts.reduce((sum, value) => sum + value, 0) > 0
        ? Math.round(latencyTotals.reduce((sum, value) => sum + value, 0) / latencyCounts.reduce((sum, value) => sum + value, 0))
        : 0;
    return {
      labels,
      requests,
      input,
      output,
      cost: cost.map((value) => Math.round(value * 1_000_000) / 1_000_000),
      latency,
    };
  }

  function recordsInRange(records, days) {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
    const start = end - days * 86_400_000 + 1;
    return records.filter((record) => {
      const timestamp = Number(record.timestamp || 0);
      return timestamp >= start && timestamp <= end;
    });
  }

  function buildModelUsage(records) {
    const groups = new Map();
    const providers = new Map();
    for (const record of records) {
      const model = record.model || "unknown";
      if (record.provider && !providers.has(model)) providers.set(model, record.provider);
      const entry = groups.get(model) || { requests: 0, tokens: 0, cost: 0 };
      entry.requests += 1;
      entry.tokens += Number(record.totalTokens || 0);
      entry.cost += Number(record.estimatedCostUsd || 0);
      groups.set(model, entry);
    }
    const total = records.length;
    const max = Math.max(1, ...Array.from(groups.values()).map((entry) => entry.requests));
    return Array.from(groups.entries())
      .map(([model, entry]) => {
        const provider = providers.get(model) || "";
        return {
          mark: provider ? markFor(provider).slice(0, 1) : "•",
          provider: provider ? (provider === "openai" ? "OpenAI" : provider === "gemini" ? "Google" : provider) : "Unknown",
          providerId: provider,
          model,
          requests: entry.requests,
          tokens: entry.tokens,
          cost: entry.cost.toFixed(2),
          share: total ? Math.round((entry.requests / total) * 100) : 0,
          ratio: Math.round((entry.requests / max) * 100),
        };
      })
      .sort((a, b) => b.requests - a.requests);
  }

  function buildAgentUsage(records) {
    const groups = new Map();
    for (const record of records) {
      const agent = record.agent || "unknown";
      groups.set(agent, (groups.get(agent) || 0) + 1);
    }
    const total = records.length;
    const max = Math.max(1, ...Array.from(groups.values()));
    return Array.from(groups.entries())
      .map(([agent, requests]) => ({
        key: agent,
        initials: (AGENT_NAMES[agent] || agent || "AI").slice(0, 2).toUpperCase(),
        name: AGENT_NAMES[agent] || agent,
        requests,
        share: total ? Math.round((requests / total) * 100) : 0,
        ratio: Math.round((requests / max) * 100),
      }))
      .sort((a, b) => b.requests - a.requests);
  }

  function mapUsage(records, summary) {
    const safeRecords = Array.isArray(records) ? records : [];
    runtime.records = safeRecords;
    NEXUS.records = safeRecords;
    NEXUS.usage = {
      "7d": buildUsageBuckets(safeRecords, 7, 7),
      "30d": buildUsageBuckets(safeRecords, 30, 10),
      "90d": buildUsageBuckets(safeRecords, 90, 12),
    };

    const totalRequests = Number(summary && summary.totalRequests) || safeRecords.length;
    const totalInput = Number(summary && summary.totalInputTokens) || 0;
    const totalOutput = Number(summary && summary.totalOutputTokens) || 0;
    const totalTokens = Number(summary && summary.totalTokens) || totalInput + totalOutput;
    const totalCost = Number(summary && summary.totalEstimatedCostUsd) || 0;
    const success = safeRecords.filter((record) => record.status === "success").length;
    const durations = safeRecords
      .map((record) => Number(record.durationMs || 0))
      .filter((value) => value > 0)
      .sort((a, b) => a - b);
    const p95 = durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] : 0;
    const providerSet = new Set(safeRecords.map((record) => record.provider).filter(Boolean));
    NEXUS.usageStats = {
      totalRequests,
      totalInput,
      totalOutput,
      totalTokens,
      totalCost,
      successRate: safeRecords.length ? Math.round((success / safeRecords.length) * 1000) / 10 : 0,
      inputPct: totalTokens ? Math.round((totalInput / totalTokens) * 100) : 0,
      outputPct: totalTokens ? 100 - Math.round((totalInput / totalTokens) * 100) : 0,
      providerCount: providerSet.size,
      p95,
      providers: [...providerSet],
    };

    NEXUS.modelUsage = buildModelUsage(safeRecords);
    NEXUS.agentUsage = buildAgentUsage(safeRecords);
    NEXUS.modelUsageByRange = {
      "7d": buildModelUsage(recordsInRange(safeRecords, 7)),
      "30d": buildModelUsage(recordsInRange(safeRecords, 30)),
      "90d": buildModelUsage(recordsInRange(safeRecords, 90)),
    };
    NEXUS.agentUsageByRange = {
      "7d": buildAgentUsage(recordsInRange(safeRecords, 7)),
      "30d": buildAgentUsage(recordsInRange(safeRecords, 30)),
      "90d": buildAgentUsage(recordsInRange(safeRecords, 90)),
    };

    const usageByTask = (summary && summary.byTask) || {};
    const latestRecords = [...safeRecords].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    NEXUS.recentSessions = latestRecords.slice(0, 6).map((record) => ({
      session: record.sessionId || "unknown",
      task: (record.taskId || "unknown").replace(/^task_/, "").slice(0, 26),
      agent: AGENT_NAMES[record.agent] || record.agent || "Unknown",
      model: record.model || "unknown",
      duration: formatDuration(record.durationMs || 0),
      tokens: H.formatTokens(record.totalTokens || 0),
      taskId: record.taskId,
    }));
    NEXUS.usageByTask = usageByTask;
  }

  function applyProviders(data) {
    const providers = (data && data.providers) || {};
    const routing = (data && data.routingTable) || {};
    const next = {};
    for (const id of Object.keys(providers)) {
      const provider = providers[id];
      next[id] = {
        id,
        name: provider.name || id,
        mark: markFor(id),
        connected: Boolean(provider.configured) || provider.status === "VALID",
        editing: false,
        testing: false,
        default: Boolean(routing.coordinator && routing.coordinator.provider === id),
        masked: provider.maskedKey || "",
        lastChecked: provider.configured ? "Live" : "",
        error: "",
        models: Array.isArray(provider.models) ? provider.models.slice() : [],
        defaultModel: provider.defaultModel,
      };
    }
    S().providers = next;
    NEXUS.providerStatus = data || null;
    NEXUS.models = Object.values(next)
      .filter((provider) => provider.connected)
      .map((provider) => ({
        provider: provider.name,
        providerId: provider.id,
        mark: provider.mark,
        items: provider.models.map((name) => ({ name, context: provider.defaultModel === name ? "default" : "" })),
      }));
    const selected =
      (routing.coordinator && routing.coordinator.model) ||
      (NEXUS.models[0] && NEXUS.models[0].items[0] && NEXUS.models[0].items[0].name) ||
      "unknown";
    S().selectedModel = selected;
    const modelRouting = {};
    for (const role of AGENT_ORDER) {
      modelRouting[role] = (routing[role] && routing[role].model) || selected;
    }
    S().modelRouting = modelRouting;
    NEXUS.routingTable = routing;
  }

  function applyThreadActivity(threads) {
    const activity = {};
    const threadFiles = {};
    for (const thread of threads) {
      activity[thread.id] = activityFor(thread);
      threadFiles[thread.id] = (thread.changedFiles || []).map((file) => {
        const path = filePathOf(file);
        return { status: "M", path, add: 0, del: 0 };
      });
    }
    NEXUS.threadActivity = activity;
    NEXUS.threadFiles = threadFiles;
  }

  function syncChangeFiles(thread) {
    const files = (thread && thread.changedFiles) || [];
    const seen = new Set();
    NEXUS.changeFiles = files
      .map((file, index) => {
        const path = filePathOf(file);
        if (!path || seen.has(path)) return null;
        seen.add(path);
        const parts = path.replace(/\\/g, "/").split("/");
        const name = parts.pop() || path;
        return {
          id: `${index}-${name}`,
          status: "M",
          statusLabel: "Modified",
          name,
          dir: parts.join("/") || ".",
          path,
          add: 0,
          del: 0,
          hunks: [],
        };
      })
      .filter(Boolean);
    S().changesFilter = "all";
    S().selectedChange = NEXUS.changeFiles[0] ? NEXUS.changeFiles[0].id : null;
    if (thread && thread.id) {
      NEXUS.threadFiles[thread.id] = files.map((file, index) => {
        const path = filePathOf(file);
        return { status: "M", path, add: 0, del: 0, id: `${index}-${path}` };
      });
    }
  }

  function updateChrome() {
    const active = NEXUS.threads.filter((thread) => thread.status === "running").length;
    const stateElement = document.querySelector(".topbar-state");
    if (stateElement) {
      stateElement.innerHTML = `<span class="state-dot${active ? " is-live" : ""}" aria-hidden="true"></span><span>${active ? "Agents working" : "Agents ready"}</span>`;
    }
    const runtimeState = document.querySelector(".chat-status");
    if (runtimeState && S().selectedThread) {
      const thread = H.threadById(S().selectedThread);
      if (thread) {
        runtimeState.innerHTML = `<span class="status-dot ${thread.status === "running" ? "is-working" : thread.status === "failed" ? "is-danger" : "is-success"}" aria-hidden="true"></span>${thread.status === "running" ? "Agents working" : thread.status === "failed" ? "Failed" : "Completed"}`;
      }
    }
  }

  function renderNow() {
    runtime.lastRender = Date.now();
    if (NEXUS.ui && typeof NEXUS.ui.renderAll === "function") {
      NEXUS.ui.renderAll({ preserveScroll: true });
    }
    updateChrome();
  }

  function scheduleRender() {
    if (runtime.renderTimer) return;
    runtime.renderTimer = window.setTimeout(() => {
      runtime.renderTimer = null;
      renderNow();
    }, 180);
  }

  function toast(title, message, type) {
    if (NEXUS.ui && typeof NEXUS.ui.toast === "function") NEXUS.ui.toast(title, message, type);
    else if (window.console) console.info(`[NEXUS] ${title}: ${message}`);
  }

  function announce(message) {
    if (NEXUS.ui && typeof NEXUS.ui.announce === "function") NEXUS.ui.announce(message);
  }

  function hideBoot() {
    const boot = document.getElementById("nexusBoot");
    if (boot) boot.remove();
  }

  function showBootError(error) {
    const boot = document.getElementById("nexusBoot");
    if (!boot) return;
    boot.classList.add("is-error");
    const title = boot.querySelector("span:nth-of-type(1)");
    const detail = boot.querySelector(".nexusBootDetail");
    if (title) title.textContent = "The interface could not reach the NEXUS runtime.";
    if (detail) {
      detail.textContent = `${error && error.message ? error.message : "Unknown error"} — start the server with a valid API token and reload.`;
    }
  }

  function clearMockData() {
    NEXUS.projects = [];
    NEXUS.threads = [];
    NEXUS.threadActivity = {};
    NEXUS.threadFiles = {};
    NEXUS.defaultResponses = {};
    NEXUS.changeFiles = [];
    NEXUS.workspaceGroups = [];
    NEXUS.contextFiles = [];
    NEXUS.codeSamples = {};
    NEXUS.modelUsage = [];
    NEXUS.agentUsage = [];
    NEXUS.recentSessions = [];
    NEXUS.usage = {
      "7d": { labels: [], requests: [], input: [], output: [], cost: [], latency: 0 },
      "30d": { labels: [], requests: [], input: [], output: [], cost: [], latency: 0 },
      "90d": { labels: [], requests: [], input: [], output: [], cost: [], latency: 0 },
    };
    NEXUS.usageStats = { totalRequests: 0, totalTokens: 0, totalCost: 0, successRate: 0, inputPct: 0, outputPct: 0, providerCount: 0, p95: 0 };
    S().providers = {};
    S().threadMessages = {};
    S().terminalEntries = [];
  }

  /* --------------------------------------------------------------------- */
  /* Workspace                                                             */
  /* --------------------------------------------------------------------- */

  function flattenTree(node, groups, counter, depth) {
    if (!node || depth > 6) return;
    const currentDepth = depth || 0;
    if (node.isDirectory && Array.isArray(node.children)) {
      const files = node.children.filter((child) => !child.isDirectory);
      if (files.length) {
        const folder = node.relativePath && node.relativePath !== "." ? node.relativePath : node.name || ".";
        groups.push({
          folder,
          files: files.map((file) => ({
            name: file.name,
            path: file.relativePath || file.path || file.name,
            type: "file",
            changed: false,
            size: file.size,
          })),
        });
        counter.count += files.length;
      }
      for (const child of node.children) {
        if (child.isDirectory) flattenTree(child, groups, counter, currentDepth + 1);
      }
    }
  }

  function setCode(name, content) {
    const lines = String(content == null ? "" : content).split(/\r?\n/);
    NEXUS.codeSamples[name] = lines.map((line) => escapeHtml(line));
  }

  async function loadWorkspace(project, options) {
    if (!project || !project.path) return;
    const silent = options && options.silent;
    if (!silent) toast("Opening workspace", project.path);
    try {
      await api("/api/workspaces/open", {
        method: "POST",
        body: JSON.stringify({ targetPath: project.path }),
      });
      const treeResponse = await api(`/api/workspaces/tree?workspace=${encodeURIComponent(project.path)}&depth=6`);
      const groups = [];
      const counter = { count: 0 };
      flattenTree(treeResponse.tree, groups, counter, 0);
      NEXUS.workspaceGroups = groups.slice(0, 60);
      const allFiles = groups.flatMap((group) => group.files).filter((file) => file && file.name);
      NEXUS.contextFiles = allFiles.slice(0, 30);
      if (runtime.fileCounts) runtime.fileCounts.set(normalizePath(project.path), counter.count);
      project.files = counter.count;
      const open = allFiles.slice(0, 3);
      S().openFiles = open.map((file) => file.name);
      if (open[0]) {
        S().workspaceFile = open[0].name;
        await loadFile(project, open[0].name, open[0].path, true);
      }
      if (!silent) {
        toast("Workspace ready", `${counter.count} files indexed in ${project.name}.`);
        renderNow();
      }
    } catch (error) {
      NEXUS.workspaceGroups = [];
      NEXUS.contextFiles = [];
      if (!silent) toast("Workspace error", error.message, "error");
      throw error;
    }
  }

  async function loadFile(project, name, path, silent) {
    const target = project || H.projectById(S().selectedProject);
    if (!target) return;
    const relative = path || (NEXUS.contextFiles.find((file) => file.name === name) || {}).path || name;
    try {
      const response = await api(
        `/api/workspaces/file?workspace=${encodeURIComponent(target.path)}&file=${encodeURIComponent(relative)}`
      );
      setCode(name, response.content);
      if (!silent) {
        S().workspaceFile = name;
        if (!S().openFiles.includes(name)) S().openFiles = [...S().openFiles, name].slice(-6);
        renderNow();
      }
      return response;
    } catch (error) {
      if (!silent) toast("Unable to read file", `${name}: ${error.message}`, "error");
      throw error;
    }
  }

  /* --------------------------------------------------------------------- */
  /* Task lifecycle                                                        */
  /* --------------------------------------------------------------------- */

  function renameThread(thread, newId) {
    const oldId = thread.id;
    if (!newId || oldId === newId) return;
    thread.id = newId;
    thread.taskId = newId;
    if (S().selectedThread === oldId) S().selectedThread = newId;
    if (S().threadMessages[oldId]) {
      S().threadMessages[newId] = S().threadMessages[oldId];
      delete S().threadMessages[oldId];
    }
    if (NEXUS.defaultResponses[oldId]) {
      NEXUS.defaultResponses[newId] = NEXUS.defaultResponses[oldId];
      delete NEXUS.defaultResponses[oldId];
    }
    if (NEXUS.threadActivity[oldId]) {
      NEXUS.threadActivity[newId] = NEXUS.threadActivity[oldId];
      delete NEXUS.threadActivity[oldId];
    }
    if (NEXUS.threadFiles[oldId]) {
      NEXUS.threadFiles[newId] = NEXUS.threadFiles[oldId];
      delete NEXUS.threadFiles[oldId];
    }
  }

  function applyTaskToThread(thread, task) {
    if (!thread || !task) return;
    thread.status = statusForTask(task);
    thread.kind = kindForTask(task);
    thread.stage = task.stage;
    thread.currentAgentRole = task.currentAgentRole;
    thread.updated = relativeTime(task.updatedAt || task.completedAt || task.createdAt);
    thread.tokens = task.totalTokens || thread.tokens || 0;
    thread.changedFiles = Array.isArray(task.changedFiles) ? task.changedFiles : thread.changedFiles || [];
    thread.activeAgents = Array.isArray(task.activeAgents) ? task.activeAgents : thread.activeAgents || [];
    const started = task.startedAt || task.createdAt || thread.startedAt || Date.now();
    const ended = task.completedAt || (thread.status === "running" ? Date.now() : task.updatedAt || Date.now());
    thread.startedAt = started;
    thread.duration = formatDuration(Math.max(0, ended - started));
    thread.detail =
      task.resultSummary ||
      task.error ||
      (thread.status === "running"
        ? `Stage: ${task.stage || "running"}${task.currentAgentRole ? ` · ${AGENT_NAMES[task.currentAgentRole] || task.currentAgentRole}` : ""}`
        : `Stage: ${task.stage || task.status}`);
    thread.progress =
      thread.status === "complete"
        ? "Completed"
        : thread.status === "failed"
          ? task.status === "cancelled"
            ? "Cancelled"
            : "Failed"
          : `Stage: ${task.stage || "running"}`;
    if (thread.status === "failed") {
      const error = String(task.error || (task.status === "cancelled" ? "Task cancelled by the user." : "Task failed."));
      const lines = error.split(/\r?\n/);
      thread.errorTitle = task.status === "cancelled" ? "Execution cancelled" : lines[0].slice(0, 120);
      thread.errorBody = lines.slice(1).join(" ").trim() || lines[0];
      thread.errorDetail = error;
    } else {
      delete thread.errorTitle;
      delete thread.errorBody;
      delete thread.errorDetail;
    }
    NEXUS.threadActivity[thread.id] = activityFor(task);
    if (task.resultSummary) NEXUS.defaultResponses[thread.id] = task.resultSummary;
    syncChangeFiles(thread);
  }

  function failThread(thread, message) {
    thread.status = "failed";
    thread.kind = "failed";
    thread.progress = "Failed";
    thread.detail = message || "The coordinator could not start this task.";
    thread.errorTitle = "Task failed";
    thread.errorBody = thread.detail;
    thread.errorDetail = thread.detail;
    thread.updated = "just now";
    NEXUS.threadActivity[thread.id] = activityFor(thread);
    const list = S().threadMessages[thread.id] || [{ role: "user", text: thread.prompt, time: timeOf(thread.createdAt) }];
    list.push({ role: "agent", text: thread.detail, time: timeOf(Date.now()) });
    S().threadMessages[thread.id] = list;
    scheduleRender();
    toast("Task failed", thread.detail, "error");
  }

  function closeStream(taskId) {
    const stream = runtime.streams.get(taskId);
    if (stream) {
      try {
        stream.close();
      } catch (error) {
        /* already closed */
      }
      runtime.streams.delete(taskId);
    }
    const poll = runtime.polls.get(taskId);
    if (poll) {
      window.clearInterval(poll);
      runtime.polls.delete(taskId);
    }
  }

  function handleTaskEvent(taskId, event) {
    const thread = H.threadById(taskId);
    if (!thread || !event) return;
    const type = event.type;
    if (type === "task_started") {
      thread.status = "running";
      thread.kind = "active";
      thread.detail = "Coordinator accepted the task.";
      thread.progress = "Stage: routing";
    } else if (type === "task_progress") {
      thread.stage = event.stage || thread.stage;
      thread.currentAgentRole = event.agentRole || thread.currentAgentRole;
      thread.status = statusForTask({ status: event.status || "running" });
      thread.progress = `Stage: ${event.stage || "running"}`;
      if (event.message) thread.detail = event.message;
      NEXUS.threadActivity[taskId] = activityFor({
        status: event.status || "running",
        stage: event.stage,
        currentAgentRole: event.agentRole,
        changedFiles: thread.changedFiles,
        error: thread.error,
        resultSummary: thread.resultSummary,
      });
    } else if (type === "agent_started") {
      thread.currentAgentRole = event.agentRole || thread.currentAgentRole;
      thread.detail = `${AGENT_NAMES[event.agentRole] || event.agentRole || "Agent"} started: ${event.goal || "working"}`;
      NEXUS.threadActivity[taskId] = activityFor({
        status: "running",
        stage: thread.stage,
        currentAgentRole: event.agentRole,
        changedFiles: thread.changedFiles,
        error: thread.error,
      });
    } else if (type === "agent_message") {
      const list = S().threadMessages[taskId] || [{ role: "user", text: thread.prompt, time: timeOf(thread.createdAt) }];
      list.push({
        role: "agent",
        text: `${AGENT_NAMES[event.agentRole] || "Agent"}: ${event.content || ""}`,
        time: timeOf(event.timestamp || Date.now()),
      });
      S().threadMessages[taskId] = list.slice(-40);
    } else if (type === "tool_started" || type === "tool_completed") {
      const activity = NEXUS.threadActivity[taskId] || activityFor(thread);
      activity.tool = {
        command: event.toolName || "tool",
        state: type === "tool_started" ? "Running" : event.success === false ? "Failed" : "Passed",
        output:
          event.outputSummary ||
          event.error ||
          `${event.toolName || "Tool"} ${type === "tool_started" ? "started" : "completed"}.`,
      };
      NEXUS.threadActivity[taskId] = activity;
    } else if (type === "file_changed") {
      const file = event.file || {};
      const path = filePathOf(event.file);
      if (path && !thread.changedFiles.some((entry) => filePathOf(entry) === path)) {
        thread.changedFiles.push({ path, changeType: file.changeType || "modified" });
      }
      syncChangeFiles(thread);
    } else if (type === "task_completed") {
      thread.status = "complete";
      thread.kind = "completed";
      thread.progress = "Completed";
      thread.detail = event.summary || thread.detail || "Task completed.";
      thread.resultSummary = event.summary;
      thread.completedAt = event.timestamp || Date.now();
      thread.duration = formatDuration(Number(event.totalDurationMs || (thread.completedAt - (thread.startedAt || thread.completedAt))));
      NEXUS.defaultResponses[taskId] = event.summary || thread.detail;
      NEXUS.threadActivity[taskId] = activityFor({ status: "completed", resultSummary: event.summary, changedFiles: thread.changedFiles });
      closeStream(taskId);
      refreshUsage();
    } else if (type === "task_failed") {
      thread.status = "failed";
      thread.kind = "failed";
      thread.progress = "Failed";
      thread.detail = event.error || "Task failed.";
      thread.errorTitle = "Execution failed";
      thread.errorBody = thread.detail;
      thread.errorDetail = thread.detail;
      NEXUS.threadActivity[taskId] = activityFor({ status: "failed", error: thread.detail, changedFiles: thread.changedFiles });
      closeStream(taskId);
      refreshUsage();
    } else if (type === "task_cancelled") {
      thread.status = "failed";
      thread.kind = "failed";
      thread.progress = "Cancelled";
      thread.detail = event.reason || "Task cancelled.";
      thread.errorTitle = "Execution cancelled";
      thread.errorBody = thread.detail;
      thread.errorDetail = thread.detail;
      thread.cancelled = true;
      NEXUS.threadActivity[taskId] = activityFor({ status: "cancelled", error: thread.detail, changedFiles: thread.changedFiles });
      closeStream(taskId);
    }
    scheduleRender();
  }

  function watchTask(taskId, thread) {
    closeStream(taskId);
    if (!TOKEN) {
      pollTask(taskId, thread, 0);
      return;
    }
    try {
      const source = new EventSource(`/api/tasks/${encodeURIComponent(taskId)}/events?token=${encodeURIComponent(TOKEN)}`);
      runtime.streams.set(taskId, source);
      for (const type of EVENT_TYPES) {
        source.addEventListener(type, (event) => {
          try {
            handleTaskEvent(taskId, JSON.parse(event.data));
          } catch (error) {
            /* Ignore malformed events. */
          }
        });
      }
      source.onerror = () => {
        if (TERMINAL_STATES.has(thread.status === "complete" ? "completed" : thread.status === "failed" ? "failed" : "running")) {
          closeStream(taskId);
          return;
        }
        source.close();
        runtime.streams.delete(taskId);
        pollTask(taskId, thread, 0);
      };
    } catch (error) {
      pollTask(taskId, thread, 0);
    }
  }

  function pollTask(taskId, thread, attempt) {
    if (runtime.polls.has(taskId)) return;
    const tick = async () => {
      try {
        const response = await api(`/api/tasks/${encodeURIComponent(taskId)}`);
        if (response && response.task) {
          applyTaskToThread(thread, response.task);
          scheduleRender();
          if (TERMINAL_STATES.has(response.task.status)) {
            closeStream(taskId);
            refreshUsage();
          }
        }
      } catch (error) {
        if (attempt > 4) closeStream(taskId);
      }
    };
    tick();
    runtime.polls.set(taskId, window.setInterval(tick, 2500));
  }

  async function submitTask(thread, prompt, projectId, mode) {
    if (!runtime.live) return;
    const project = H.projectById(projectId || thread.projectId) || H.projectById(S().selectedProject);
    if (!project || !project.path) {
      failThread(thread, "No workspace is selected. Add or open a workspace first.");
      return;
    }
    thread.projectId = project.id;
    thread.status = "running";
    thread.kind = "active";
    thread.startedAt = Date.now();
    thread.detail = "Submitting the task to the coordinator…";
    thread.progress = "Stage: queued";
    NEXUS.threadActivity[thread.id] = activityFor({ status: "pending", stage: "queued", changedFiles: [] });
    S().selectedProject = project.id;
    S().selectedThread = thread.id;
    scheduleRender();
    try {
      const body = {
        prompt,
        workspacePath: project.path,
      };
      if (thread.sessionId) body.sessionId = thread.sessionId;
      if (S().selectedModel && S().selectedModel !== "unknown") body.model = S().selectedModel;
      const response = await api("/api/tasks", { method: "POST", body: JSON.stringify(body) });
      const task = response && response.task;
      if (!task) throw new Error((response && response.error) || "The server did not return a task.");
      if (!response.success) {
        renameThread(thread, task.id);
        thread.sessionId = task.sessionId;
        applyTaskToThread(thread, task);
        if (thread.status !== "failed") failThread(thread, response.error || task.error || "Task could not start.");
        scheduleRender();
        return;
      }
      renameThread(thread, task.id);
      thread.sessionId = task.sessionId;
      applyTaskToThread(thread, task);
      S().selectedThread = thread.id;
      const messages = S().threadMessages[thread.id] || [];
      if (!messages.some((message) => message.role === "user" && message.text === prompt)) {
        messages.unshift({ role: "user", text: prompt, time: timeOf(Date.now()) });
      }
      S().threadMessages[thread.id] = messages;
      watchTask(thread.id, thread);
      scheduleRender();
      toast("Task started", `${project.name} · coordinator is assembling the agents.`);
      announce(`Task started in ${project.name}.`);
    } catch (error) {
      failThread(thread, error.message);
    }
  }

  function sendMessage(thread, text) {
    if (!thread) return;
    const projectId = thread.projectId || S().selectedProject;
    const next = NEXUS.ui && typeof NEXUS.ui.createThread === "function" ? NEXUS.ui.createThread(text, projectId, S().agentMode || "build") : null;
    if (next) {
      S().threadMessages[next.id] = [{ role: "user", text, time: timeOf(Date.now()) }];
      S().selectedThread = next.id;
      S().selectedProject = projectId;
      S().view = "chat";
      renderNow();
      scrollChat();
    } else {
      submitTask(
        {
          id: `task-local-${Date.now()}`,
          projectId,
          prompt: text,
          title: text.slice(0, 72),
          status: "running",
          kind: "active",
          updated: "just now",
          branch: H.projectById(projectId).branch,
          detail: "Submitting the task…",
          duration: "00:00",
          progress: "Stage: queued",
          startedAt: Date.now(),
          changedFiles: [],
        },
        text,
        projectId,
        S().agentMode || "build"
      );
    }
  }

  function scrollChat() {
    window.setTimeout(() => {
      const scroller = document.getElementById("chatScroll");
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }, 40);
  }

  function cancelTask(thread) {
    if (!thread) return;
    const openConfirm = NEXUS.ui && NEXUS.ui.openConfirm;
    const run = async () => {
      try {
        await api(`/api/tasks/${encodeURIComponent(thread.id)}/cancel`, { method: "POST" });
        thread.status = "failed";
        thread.kind = "failed";
        thread.progress = "Cancelled";
        thread.detail = "Execution stopped by the user.";
        thread.errorTitle = "Execution cancelled";
        thread.errorBody = thread.detail;
        thread.errorDetail = "ExecutionStopped: user requested stop";
        thread.cancelled = true;
        NEXUS.threadActivity[thread.id] = activityFor({ status: "cancelled", error: thread.detail, changedFiles: thread.changedFiles });
        closeStream(thread.id);
        renderNow();
        toast("Execution stopped", "The coordinator cancelled the active task.", "error");
      } catch (error) {
        toast("Unable to stop task", error.message, "error");
      }
    };
    if (typeof openConfirm === "function") {
      openConfirm({
        eyebrow: "Active run",
        title: "Stop this execution?",
        body: `The coordinator will stop ${thread.title}. Files already changed stay in the working tree for review.`,
        detail: "Partial changes remain uncommitted.",
        confirmLabel: "Stop execution",
        danger: true,
        onConfirm: run,
      });
    } else {
      run();
    }
  }

  function retryTask(thread) {
    if (!thread) return;
    const next = NEXUS.ui && typeof NEXUS.ui.createThread === "function" ? NEXUS.ui.createThread(thread.prompt, thread.projectId, "build") : null;
    if (next) {
      S().selectedThread = next.id;
      S().view = "chat";
      renderNow();
      toast("Execution restarted", `${thread.title} is running again.`);
    }
  }

  /* --------------------------------------------------------------------- */
  /* Terminal                                                              */
  /* --------------------------------------------------------------------- */

  async function runTerminalCommand(command) {
    const raw = String(command || "").trim();
    if (!raw || S().terminalBusy) return;
    if (raw === "clear" || raw === "restart") return;
    const project = H.projectById(S().selectedProject) || NEXUS.projects[0];
    if (!project) {
      toast("No workspace", "Open a workspace before running a command.", "error");
      return;
    }
    S().terminalHistory.push(raw);
    S().terminalHistoryIndex = S().terminalHistory.length;
    const entry = {
      id: `term-${Date.now()}`,
      ai: raw.startsWith("@") || raw.startsWith("nexus "),
      command: raw,
      cwd: project.path,
      state: "running",
      output: [],
    };
    S().terminalEntries.push(entry);
    S().terminalBusy = true;
    renderNow();
    scrollTerminal();
    try {
      await api("/api/workspaces/open", { method: "POST", body: JSON.stringify({ targetPath: project.path }) });
      const response = await api("/api/workspaces/terminal", {
        method: "POST",
        body: JSON.stringify({ command: raw, workingDir: project.path }),
      });
      const data = response.data || {};
      const output = [];
      const stdout = String(data.stdout || "").replace(/\r/g, "");
      const stderr = String(data.stderr || "").replace(/\r/g, "");
      if (stdout) {
        for (const line of stdout.split("\n").slice(0, 400)) output.push({ text: line, tone: "muted" });
      }
      if (stderr) {
        for (const line of stderr.split("\n").slice(0, 400)) output.push({ text: line, tone: "err" });
      }
      if (!output.length) {
        output.push({ text: `exit code ${data.exitCode == null ? 0 : data.exitCode}`, tone: response.success ? "ok" : "err" });
      }
      entry.output = output;
      entry.state = "completed";
      if (!response.success && data.exitCode !== 0) announce("Command failed.");
    } catch (error) {
      entry.output = [{ text: error.message, tone: "err" }];
      entry.state = "completed";
      announce("Command failed.");
    } finally {
      S().terminalBusy = false;
      renderNow();
      scrollTerminal();
      focusTerminal();
    }
  }

  function scrollTerminal() {
    window.setTimeout(() => {
      const scroller = document.querySelector(".terminal-scroll");
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }, 40);
  }

  function focusTerminal() {
    if (S().view !== "terminal") return;
    const input = document.getElementById("terminalInput");
    if (input && !S().terminalBusy) input.focus();
  }

  /* --------------------------------------------------------------------- */
  /* Providers                                                             */
  /* --------------------------------------------------------------------- */

  async function refreshProviders(options) {
    const data = await api("/api/providers/status");
    applyProviders(data);
    if (!(options && options.silent)) renderNow();
    return data;
  }

  function connectProvider(id) {
    const provider = S().providers[id];
    if (!provider) return;
    const input = document.querySelector(`[data-provider-key="${id}"]`);
    const key = String((input && input.value) || "").trim();
    if (!key) {
      provider.error = "Enter an API key to connect this provider.";
      renderNow();
      return;
    }
    if (key.length < 12) {
      provider.error = "That key looks too short. Paste the full provider key and try again.";
      provider.editing = true;
      renderNow();
      return;
    }
    provider.error = "";
    provider.testing = true;
    provider.editing = true;
    renderNow();
    (async () => {
      try {
        await api("/api/providers/credentials", {
          method: "POST",
          body: JSON.stringify({ provider: id, apiKey: key }),
        });
        const validation = await api("/api/providers/validate", {
          method: "POST",
          body: JSON.stringify({ provider: id }),
        });
        if (!validation.success) {
          throw new Error((validation.result && validation.result.message) || "The provider rejected this key.");
        }
        await refreshProviders({ silent: true });
        const live = S().providers[id];
        if (live) {
          live.testing = false;
          live.editing = false;
          live.lastChecked = "Just now";
        }
        renderNow();
        toast("Provider connected", `${provider.name} is ready to route requests.`);
      } catch (error) {
        const live = S().providers[id] || provider;
        live.testing = false;
        live.editing = true;
        live.connected = false;
        live.error = error.message;
        renderNow();
        toast("Connection failed", error.message, "error");
      }
    })();
  }

  function testProvider(id) {
    const provider = S().providers[id];
    if (!provider) return;
    provider.testing = true;
    provider.error = "";
    renderNow();
    (async () => {
      try {
        const validation = await api("/api/providers/validate", {
          method: "POST",
          body: JSON.stringify({ provider: id }),
        });
        provider.testing = false;
        if (!validation.success) throw new Error((validation.result && validation.result.message) || "Validation failed.");
        provider.lastChecked = "Just now";
        renderNow();
        toast("Connection healthy", `${provider.name} responded successfully.`);
      } catch (error) {
        provider.testing = false;
        provider.error = error.message;
        renderNow();
        toast("Connection failed", error.message, "error");
      }
    })();
  }

  function disconnectProvider(id) {
    const provider = S().providers[id];
    if (!provider) return;
    const run = async () => {
      try {
        await api("/api/providers/credentials", {
          method: "POST",
          body: JSON.stringify({ provider: id, apiKey: "" }),
        });
        await refreshProviders({ silent: true });
        renderNow();
        toast("Provider disconnected", `${provider.name} was removed from routing.`);
      } catch (error) {
        toast("Unable to disconnect", error.message, "error");
      }
    };
    if (NEXUS.ui && NEXUS.ui.openConfirm) {
      NEXUS.ui.openConfirm({
        eyebrow: "Provider",
        title: `Disconnect ${provider.name}?`,
        body: "New turns will not be routed to this provider. Existing threads keep their recorded model.",
        confirmLabel: "Disconnect",
        danger: true,
        onConfirm: run,
      });
    } else {
      run();
    }
  }

  function setDefaultProvider(id) {
    const provider = S().providers[id];
    if (!provider) return;
    Object.values(S().providers).forEach((entry) => {
      entry.default = entry.id === id;
    });
    if (!provider.models.includes(S().selectedModel)) S().selectedModel = provider.models[0];
    renderNow();
    toast("Default provider updated", `${provider.name} is the default for this session. Server routing is managed by the model table.`);
  }

  function rotateKeys() {
    const run = async () => {
      try {
        await api("/api/providers/credentials", { method: "POST", body: JSON.stringify({ openaiApiKey: "", geminiApiKey: "" }) });
        await refreshProviders({ silent: true });
        renderNow();
        toast("Keys cleared", "Provider credentials were removed. Add a key to reconnect.");
      } catch (error) {
        toast("Unable to rotate keys", error.message, "error");
      }
    };
    if (NEXUS.ui && NEXUS.ui.openConfirm) {
      NEXUS.ui.openConfirm({
        eyebrow: "Credentials",
        title: "Clear all provider keys?",
        body: "Every saved provider credential will be cleared. Connected providers stay configured until the next request, then require a new key.",
        confirmLabel: "Clear keys",
        danger: true,
        onConfirm: run,
      });
    } else {
      run();
    }
  }

  /* --------------------------------------------------------------------- */
  /* Usage                                                                 */
  /* --------------------------------------------------------------------- */

  async function refreshUsage(options) {
    try {
      const [summary, records] = await Promise.all([api("/api/usage/summary"), api("/api/usage/records")]);
      mapUsage(records && records.records, summary && summary.summary);
      if (!(options && options.silent)) renderNow();
    } catch (error) {
      if (!(options && options.silent)) toast("Usage unavailable", error.message, "error");
    }
  }

  async function setUsageRange(range) {
    S().usageRange = range;
    S().usageLoading = true;
    renderNow();
    await refreshUsage({ silent: true });
    S().usageLoading = false;
    renderNow();
    announce(`Usage range set to ${range === "7d" ? "7 days" : range === "30d" ? "30 days" : "90 days"}.`);
  }

  function usageCsv() {
    const columns = [
      "requestId",
      "sessionId",
      "taskId",
      "agent",
      "provider",
      "model",
      "inputTokens",
      "outputTokens",
      "totalTokens",
      "estimatedCostUsd",
      "durationMs",
      "status",
      "timestamp",
    ];
    const rows = [columns.join(",")];
    for (const record of NEXUS.records || []) {
      rows.push(
        columns
          .map((column) => {
            const value = record[column];
            return `"${String(value == null ? "" : value).replace(/"/g, '""')}"`;
          })
          .join(",")
      );
    }
    return rows.join("\n");
  }

  function exportUsage() {
    const csv = usageCsv();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nexus-usage-${S().usageRange}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Usage exported", `nexus-usage-${S().usageRange}.csv was downloaded.`);
  }

  /* --------------------------------------------------------------------- */
  /* Project / workspace actions                                           */
  /* --------------------------------------------------------------------- */

  function openProject(projectId) {
    const project = H.projectById(projectId);
    if (!project) return;
    S().selectedProject = project.id;
    if (!S().expandedProjects.includes(project.id)) S().expandedProjects.push(project.id);
    S().view = "project";
    renderNow();
    loadWorkspace(project).catch((error) => toast("Workspace unavailable", error.message, "error"));
  }

  async function createProject(name, path, branch) {
    const response = await api("/api/workspaces/open", { method: "POST", body: JSON.stringify({ targetPath: path }) });
    const workspace = response.workspace || {};
    const project = {
      id: workspace.id || `ws_${Date.now()}`,
      name: workspace.name || name || path.split(/[\\/]/).pop(),
      path: workspace.path || path,
      branch: branch || "local",
      status: "Active",
      tasks: 0,
      files: 0,
      last: "Just now",
      description: `Local workspace · ${workspace.path || path}`,
      languages: [],
      remote: workspace.path || path,
      baseBranch: branch || "main",
      createdAt: workspace.createdAt || Date.now(),
      lastOpenedAt: workspace.lastOpenedAt || Date.now(),
    };
    NEXUS.projects.push(project);
    S().selectedProject = project.id;
    if (!S().expandedProjects.includes(project.id)) S().expandedProjects.push(project.id);
    await loadWorkspace(project, { silent: true });
    renderNow();
    toast("Project added", `${project.name} is ready.`);
    return project;
  }

  function syncChanges(thread) {
    syncChangeFiles(thread || H.threadById(S().selectedThread));
    scheduleRender();
  }

  function commitChanges() {
    toast("Commit is not available in the web UI", "Run git from the terminal. The 2.1 API exposes workspace files and terminal commands, not git commits.");
  }

  /* --------------------------------------------------------------------- */
  /* Bootstrap                                                             */
  /* --------------------------------------------------------------------- */

  async function bootstrap() {
    try {
      const [providers, workspaces, tasks, sessions, usageSummary, usageRecords, active] = await Promise.all([
        api("/api/providers/status"),
        api("/api/workspaces"),
        api("/api/tasks?limit=120"),
        api("/api/sessions"),
        api("/api/usage/summary"),
        api("/api/usage/records"),
        api("/api/tasks/active"),
      ]);
      runtime.raw = { providers, workspaces, tasks, sessions, usageSummary, usageRecords, active };
      const workspaceList = (workspaces && workspaces.workspaces) || [];
      const taskList = (tasks && tasks.tasks) || [];
      const sessionList = (sessions && sessions.sessions) || [];
      runtime.fileCounts = new Map();

      applyProviders(providers);
      const projects = mapProjects(workspaceList, taskList, sessionList);
      const threads = mapThreads(taskList, projects);
      NEXUS.projects = projects;
      NEXUS.threads = threads;
      hydrateMessages(threads, taskList);
      applyThreadActivity(threads);
      mapUsage(usageRecords && usageRecords.records, usageSummary && usageSummary.summary);
      NEXUS.activeTasks = (active && active.activeTasks) || [];

      const preferred =
        projects.find((project) => project.name.toLowerCase() === "nexux") ||
        projects.find((project) => normalizePath(project.path).endsWith("/nexux")) ||
        projects[0];
      S().selectedProject = preferred ? preferred.id : null;
      S().expandedProjects = preferred ? [preferred.id] : [];
      const running = threads.find((thread) => thread.status === "running");
      const completed = threads.filter((thread) => thread.status === "complete");
      const selected = running || completed.find((thread) => thread.changedFiles.length) || completed[0] || threads[0];
      S().selectedThread = selected ? selected.id : null;
      S().view = "home";
      S().terminalEntries = [];
      S().terminalHistory = [];
      S().terminalHistoryIndex = 0;
      S().usageLoading = false;
      S().settings.shell = /^win/i.test(navigator.platform) ? "powershell" : "/bin/zsh";
      syncChanges(selected);

      if (preferred) {
        try {
          await loadWorkspace(preferred, { silent: true });
        } catch (error) {
          /* The dashboard still works without a file tree. */
        }
      }

      runtime.live = true;
      NEXUS.live = true;
      NEXUS.actions.live = true;
      hideBoot();
      return true;
    } catch (error) {
      runtime.live = false;
      NEXUS.live = false;
      runtime.bootError = error;
      clearMockData();
      showBootError(error);
      return false;
    }
  }

  NEXUS.actions = {
    live: false,
    api,
    submitTask,
    sendMessage,
    cancelTask,
    retryTask,
    runTerminalCommand,
    connectProvider,
    testProvider,
    disconnectProvider,
    setDefaultProvider,
    rotateKeys,
    refreshProviders,
    refreshUsage,
    setUsageRange,
    exportUsage,
    usageCsv,
    openFile: (name, path) => {
      const project = H.projectById(S().selectedProject);
      S().workspaceFile = name;
      if (name && !S().openFiles.includes(name)) S().openFiles = [...S().openFiles, name].slice(-6);
      if (project) loadFile(project, name, path, false).catch(() => {});
    },
    openProject,
    createProject,
    loadWorkspace,
    syncChanges,
    commitChanges,
    clearMockData,
    refreshAll: async () => {
      await Promise.all([refreshProviders({ silent: true }), refreshUsage({ silent: true })]);
      renderNow();
    },
  };

  NEXUS.bootstrap = bootstrap;
  NEXUS.runtime = runtime;
  NEXUS.api = api;
  NEXUS.toast = toast;
})();
