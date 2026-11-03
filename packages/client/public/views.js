/* NEXUS.AI — screen renderers */
(function () {
  "use strict";

  const NEXUS = window.NEXUS;
  if (!NEXUS) return;

  const H = NEXUS.helpers;
  const esc = H.escapeHtml;
  const icon = H.icon;
  const state = () => NEXUS.state;

  const plainText = (value) =>
    String(value == null ? "" : value)
      .replace(/\*/g, "")
      .replace(/`/g, "")
      .replace(/^#+\s*/gm, "")
      .replace(/\r/g, "")
      .trim();

  const richText = (value) =>
    esc(value)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");

  const clip = (value, max = 140) => {
    const text = plainText(value);
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  };

  const statusLabel = (value) => {
    const labels = {
      done: "Done",
      working: "Working",
      waiting: "Waiting",
      failed: "Failed",
      idle: "Idle",
      running: "Working",
      complete: "Completed",
      Active: "Active",
      Review: "Review",
      Paused: "Paused",
      M: "Modified",
      A: "Added",
      D: "Deleted",
      R: "Renamed"
    };
    return labels[value] || value;
  };

  const statusTone = (value) => {
    if (value === "working" || value === "running") return "is-working";
    if (value === "done" || value === "complete" || value === "Active") return "is-success";
    if (value === "failed") return "is-danger";
    if (value === "waiting" || value === "Review") return "is-warning";
    return "is-idle";
  };

  const badge = (label, tone) =>
    `<span class="badge${tone ? ` badge-${tone}` : ""}">${esc(label)}</span>`;

  const thread = () => H.threadById(state().selectedThread);
  const project = () => H.projectById(state().selectedProject);
  const totalIndexed = () => NEXUS.projects.reduce((sum, item) => sum + (Number(item.files) || 0), 0);

  const threadActivity = (item) => {
    if (!item) return NEXUS.agentActivityMap.empty;
    if (NEXUS.threadActivity[item.id]) return NEXUS.threadActivity[item.id];
    return NEXUS.agentActivityMap[item.kind] || NEXUS.agentActivityMap.empty;
  };

  const activityStatuses = (item) => threadActivity(item).statuses || NEXUS.agentActivityMap.empty;
  const activityTasks = (item) => threadActivity(item).tasks || NEXUS.agents.map((agent) => agent.task);
  const activityTool = (item) => threadActivity(item).tool || null;

  const fileIcon = (name) => {
    if (!name) return "file";
    if (/\.tsx?$/.test(name)) return "code";
    if (/\.css$/.test(name)) return "sliders";
    if (/\.json$/.test(name)) return "box";
    return "file";
  };

  const dateLabel = () => {
    try {
      return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
    } catch (error) {
      return "Today";
    }
  };

  /* --------------------------------------------------------------------- */
  /* Sidebar                                                               */
  /* --------------------------------------------------------------------- */

  const R = (NEXUS.render = {});

  R.sidebar = function sidebar() {
    const s = state();
    const query = s.projectSearch.trim().toLowerCase();

    const groups = NEXUS.projects
      .map((item) => {
        const threads = H.threadsForProject(item.id);
        const projectMatch = item.name.toLowerCase().includes(query) || item.path.toLowerCase().includes(query);
        const matchingThreads = threads.filter((entry) => entry.title.toLowerCase().includes(query));
        if (query && !projectMatch && !matchingThreads.length) return "";
        const visibleThreads = query && !projectMatch ? matchingThreads : threads;
        const expanded = query ? true : s.expandedProjects.includes(item.id);
        const current = s.selectedProject === item.id;

        const threadRows = expanded
          ? `<div class="thread-list">
              ${visibleThreads
                .map(
                  (entry) => `
                <button class="thread-row${s.selectedThread === entry.id ? " is-active" : ""}" type="button" data-action="open-thread" data-thread="${esc(entry.id)}" aria-current="${s.selectedThread === entry.id ? "true" : "false"}">
                  <span class="thread-state-dot is-${esc(entry.status)}" aria-hidden="true"></span>
                  <span class="thread-title">${esc(entry.title)}</span>
                  <span class="thread-time">${esc(entry.updated)}</span>
                </button>`
                )
                .join("")}
            </div>
            <div class="project-meta">
              <span>${icon("branch")}${esc(item.branch)}</span>
              <span>${icon("files")}${item.tasks} tasks</span>
            </div>`
          : "";

        return `
          <div class="project-group">
            <div class="project-row${current ? " is-current" : ""}">
              <button class="project-toggle" type="button" data-action="toggle-project" data-project="${esc(item.id)}" aria-expanded="${expanded}" aria-label="${expanded ? "Collapse" : "Expand"} ${esc(item.name)}">
                ${icon(expanded ? "chevron-down" : "chevron-right")}
              </button>
              <button class="project-main" type="button" data-action="open-project" data-project="${esc(item.id)}">
                ${icon("folder")}
                <span class="project-name">${esc(item.name)}</span>
                <span class="project-branch-dot" aria-hidden="true"></span>
              </button>
            </div>
            ${threadRows}
          </div>`;
      })
      .filter(Boolean)
      .join("");

    return `
      <div class="sidebar-inner">
        <div class="sidebar-head">
          <div class="sidebar-workspace">
            <strong>Workspace</strong>
            <span>nexus.local</span>
          </div>
          <div class="topbar-actions">
            <button class="sidebar-head-action" type="button" data-action="new-chat" aria-label="Start a blank chat" data-tooltip="Blank chat">${icon("chat")}</button>
            <button class="sidebar-head-action" type="button" data-action="new-task" aria-label="Start a task" data-tooltip="New task">${icon("plus")}</button>
          </div>
        </div>
        <label class="sidebar-search">
          <span class="sr-only">Search projects and threads</span>
          ${icon("search")}
          <input id="projectSearchInput" type="search" placeholder="Search workspace…" value="${esc(s.projectSearch)}" autocomplete="off" spellcheck="false">
        </label>
        <div class="sidebar-scroll">
          <div class="sidebar-section">
            <div class="sidebar-section-head">
              <span class="sidebar-label">Projects</span>
              <button class="sidebar-head-action" type="button" data-action="new-project" aria-label="Add project" data-tooltip="Add project">${icon("plus")}</button>
            </div>
            ${groups || `<div class="sidebar-empty">No projects or threads match “${esc(s.projectSearch)}”.</div>`}
          </div>
        </div>
        <div class="sidebar-foot">
          <div class="sidebar-progress">
            <span>Context index</span>
            <span>84 files · 62%</span>
          </div>
          <div class="sidebar-progress-bar" aria-hidden="true"><span></span></div>
          <button class="sidebar-new-project" type="button" data-action="new-project">${icon("plus")}New project</button>
        </div>
      </div>`;
  };

  /* --------------------------------------------------------------------- */
  /* Context panel                                                         */
  /* --------------------------------------------------------------------- */

  const contextTools = [
    { id: "agents", label: "Agents", icon: "workflow" },
    { id: "files", label: "Files", icon: "files" },
    { id: "changes", label: "Changes", icon: "diff" },
    { id: "git", label: "Git", icon: "branch" },
    { id: "terminal", label: "Terminal", icon: "terminal" },
    { id: "usage", label: "Usage", icon: "chart" },
    { id: "settings", label: "Settings", icon: "sliders" }
  ];

  const contextTitles = {
    agents: "Agent runtime",
    files: "Context files",
    changes: "Thread changes",
    git: "Repository",
    terminal: "Recent commands",
    usage: "Usage snapshot",
    settings: "Quick settings"
  };

  const contextStatus = (status) => {
    const labels = { done: "Done", working: "Working", waiting: "Queued", failed: "Failed", idle: "Idle" };
    return `<span class="status-inline"><span class="status-dot ${statusTone(status)}" aria-hidden="true"></span><span>${labels[status] || status}</span></span>`;
  };

  const renderContextBody = () => {
    const s = state();
    const current = thread();
    const statuses = activityStatuses(current);
    const tasks = activityTasks(current);

    if (s.contextTool === "agents") {
      return `
        <div class="context-titlebar">
          <h2>Agents</h2>
          <div class="context-titlebar-actions">
            <button class="sidebar-head-action" type="button" data-action="open-agents-settings" aria-label="Configure agents">${icon("settings")}</button>
          </div>
        </div>
        <div class="context-scroll">
          ${NEXUS.agents
            .map(
              (agent, index) => `
            <div class="context-agent">
              <span class="context-agent-mark" aria-hidden="true">${esc(agent.initials)}</span>
              <div class="context-agent-body">
                <div class="context-agent-line">
                  <span class="context-agent-name">${esc(agent.name)}</span>
                  ${contextStatus(statuses[index] || "idle")}
                </div>
                <p class="context-agent-task">${esc(clip(tasks[index] || agent.task))}</p>
              </div>
            </div>`
            )
            .join("")}
          <div class="context-card">
            <p class="context-card-title">${current ? esc(current.title) : "No active thread"}</p>
            <p>${current ? esc(clip(current.detail, 260)) : "Select a thread to see the agent runtime and execution plan."}</p>
          </div>
        </div>`;
    }

    if (s.contextTool === "files") {
      return `
        <div class="context-titlebar">
          <h2>Files</h2>
          <div class="context-titlebar-actions">
            <button class="sidebar-head-action" type="button" data-action="open-workspace" aria-label="Open workspace">${icon("code")}</button>
          </div>
        </div>
        <div class="context-scroll">
          <div class="context-section-label"><span>In context</span><span>${NEXUS.contextFiles.length}</span></div>
          ${NEXUS.contextFiles
            .map(
              (file) => `
            <button class="context-file${s.workspaceFile === file.name ? " is-selected" : ""}" type="button" data-action="open-file" data-file="${esc(file.name)}" data-path="${esc(file.path)}">
              ${icon(fileIcon(file.name))}
              <span class="context-file-name">${esc(file.name)}</span>
              ${file.changed ? '<span class="thread-state-dot is-running" aria-label="Changed"></span>' : ""}
            </button>`
            )
            .join("")}
          <div class="context-card">
            <p class="context-card-title">Retrieval scope</p>
            <p>${NEXUS.contextFiles.length} files are available from the active workspace index. Open a file to load its live contents.</p>
          </div>
        </div>`;
    }

    if (s.contextTool === "changes") {
      const files = current ? NEXUS.threadFiles[current.id] || [] : [];
      return `
        <div class="context-titlebar">
          <h2>Changes</h2>
          <div class="context-titlebar-actions">
            <button class="sidebar-head-action" type="button" data-action="open-changes" aria-label="Open changes view">${icon("arrow-up-right")}</button>
          </div>
        </div>
        <div class="context-scroll">
          ${
            files.length
              ? `<div class="context-mini-changes">
                  ${files
                    .map(
                      (file) => `
                    <button class="context-change-row" type="button" data-action="open-change" data-change="${esc(file.path || "")}">
                      <span class="change-letter is-${file.status.toLowerCase()}">${esc(file.status)}</span>
                      <span class="change-path">${esc(file.path)}</span>
                      <span class="change-stats"><span class="add">+${file.add}</span> <span class="del">−${file.del}</span></span>
                    </button>`
                    )
                    .join("")}
                </div>`
              : `<div class="context-empty">${icon("diff")}<p>No working-tree changes for this thread yet.</p></div>`
          }
          <div class="context-card">
            <p class="context-card-title">${current ? esc(current.progress) : "No active execution"}</p>
            <p>${current ? esc(clip(current.detail || "Waiting for the coordinator.", 180)) : "Select a thread to inspect its working tree."} Changes remain uncommitted on <span class="mono">${current ? esc(current.branch) : "local"}</span>.</p>
          </div>
        </div>`;
    }

    if (s.contextTool === "git") {
      const item = current || thread();
      return `
        <div class="context-titlebar">
          <h2>Repository</h2>
          <div class="context-titlebar-actions">
            <button class="sidebar-head-action" type="button" data-action="open-git-settings" aria-label="Git settings">${icon("settings")}</button>
          </div>
        </div>
        <div class="context-scroll">
          <div class="context-git-row"><span class="context-git-label">Branch</span><span class="context-git-value">${item ? esc(item.branch) : "local"}</span></div>
          <div class="context-git-row"><span class="context-git-label">Base</span><span class="context-git-value">${esc((item && item.baseBranch) || "unknown")}</span></div>
          <div class="context-git-row"><span class="context-git-label">Path</span><span class="context-git-value mono">${esc(item ? item.path : "")}</span></div>
          <div class="context-git-row"><span class="context-git-label">Changed files</span><span class="context-git-value">${NEXUS.changeFiles.length}</span></div>
          <div class="context-card">
            <p class="context-card-title">Git metadata</p>
            <p>Commit history and ahead/behind counts are not exposed by the local API. Run git from the terminal to inspect them.</p>
          </div>
        </div>`;
    }

    if (s.contextTool === "terminal") {
      const last = s.terminalEntries[s.terminalEntries.length - 1];
      return `
        <div class="context-titlebar">
          <h2>Recent commands</h2>
          <div class="context-titlebar-actions">
            <button class="sidebar-head-action" type="button" data-action="open-terminal" aria-label="Open terminal">${icon("arrow-up-right")}</button>
          </div>
        </div>
        <div class="context-scroll">
          <div class="context-section-label"><span>Session</span><span>${esc(state().settings.shell || "shell")}</span></div>
          ${
            last
              ? `<div class="context-card">
                  <p class="context-card-title mono">${esc(last.command)}</p>
                  <p>${last.state === "running" ? "Running…" : "Completed · exit code 0"}</p>
                </div>`
              : `<div class="context-empty">${icon("terminal")}<p>No commands in the current session.</p></div>`
          }
          <div class="context-section-label"><span>Pinned</span></div>
          <button class="context-nav-button" type="button" data-action="run-command" data-command="npm test">${icon("play")}npm test</button>
          <button class="context-nav-button" type="button" data-action="run-command" data-command="git status --short">${icon("branch")}git status --short</button>
          <button class="context-nav-button" type="button" data-action="run-command" data-command="npm run build">${icon("box")}npm run build</button>
        </div>`;
    }

    if (s.contextTool === "usage") {
      const usage = NEXUS.usage[s.usageRange];
      const total = usage.cost.reduce((sum, value) => sum + value, 0);
      const requests = H.sum(usage.requests);
      return `
        <div class="context-titlebar">
          <h2>Usage snapshot</h2>
          <div class="context-titlebar-actions">
            <button class="sidebar-head-action" type="button" data-action="open-usage" aria-label="Open usage">${icon("arrow-up-right")}</button>
          </div>
        </div>
        <div class="context-scroll">
          <div class="context-section-label"><span>Last ${esc(s.usageRange)}</span><span>${usage.labels.length} points</span></div>
          <div class="context-git-row"><span class="context-git-label">Requests</span><span class="context-git-value">${requests.toLocaleString("en-US")}</span></div>
          <div class="context-git-row"><span class="context-git-label">Total tokens</span><span class="context-git-value">${H.formatTokens(H.totalTokens(usage))}</span></div>
          <div class="context-git-row"><span class="context-git-label">Estimated cost</span><span class="context-git-value">${H.formatCost(total)}</span></div>
          <div class="context-git-row"><span class="context-git-label">Avg latency</span><span class="context-git-value">${usage.latency} ms</span></div>
          <div class="context-card">
            <p class="context-card-title">Forecast</p>
            <p>At the current rate, monthly spend is projected to be $248.40, 21% below the workspace budget.</p>
          </div>
        </div>`;
    }

    return `
      <div class="context-titlebar">
        <h2>Quick settings</h2>
        <div class="context-titlebar-actions">
          <button class="sidebar-head-action" type="button" data-action="open-settings" aria-label="Open all settings">${icon("arrow-up-right")}</button>
        </div>
      </div>
      <div class="context-scroll">
        <div class="context-section-label"><span>Approval policy</span></div>
        <div class="context-card">
          <p class="context-card-title">Workspace approval</p>
          <p>Writes and shell commands require approval for sensitive paths.</p>
        </div>
        <div class="context-section-label"><span>Session</span></div>
        <button class="context-nav-button" type="button" data-action="open-settings" data-section="appearance">${icon("sun")}Appearance</button>
        <button class="context-nav-button" type="button" data-action="open-settings" data-section="providers">${icon("key")}API providers</button>
        <button class="context-nav-button" type="button" data-action="open-settings" data-section="security">${icon("shield")}Security</button>
        <button class="context-nav-button" type="button" data-action="open-command">${icon("command")}Command palette</button>
      </div>`;
  };

  R.context = function context() {
    const s = state();
    return `
      <div class="context-head">
        <span class="context-head-title">Context</span>
        <button class="sidebar-head-action" type="button" data-action="toggle-context" aria-label="Hide context panel">${icon("x")}</button>
      </div>
      <div class="context-tools" role="toolbar" aria-label="Context tools">
        ${contextTools
          .map(
            (tool) => `
          <button class="context-tool" type="button" data-context-tool="${tool.id}" aria-label="${tool.label}" aria-pressed="${s.contextTool === tool.id}" data-tooltip="${tool.label}">
            ${icon(tool.icon)}
          </button>`
          )
          .join("")}
      </div>
      <div class="context-body">${renderContextBody()}</div>`;
  };

  /* --------------------------------------------------------------------- */
  /* Shared fragments                                                      */
  /* --------------------------------------------------------------------- */

  const sparkline = (values) => {
    const width = 132;
    const height = 42;
    const series = Array.isArray(values) && values.length ? values : [0];
    const max = Math.max.apply(null, series);
    const min = Math.min.apply(null, series);
    const step = width / series.length;
    const range = Math.max(1, max - min);
    const points = series
      .map((value, index) => {
        const x = step * index + step / 2;
        const y = height - 4 - ((value - min) / range) * (height - 12);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    const bars = series
      .map((value, index) => {
        const barHeight = Math.max(3, ((value - min) / range) * (height - 14) + 4);
        return `<rect class="spark-bar" x="${(step * index + step * 0.25).toFixed(1)}" y="${(height - barHeight).toFixed(1)}" width="${(step * 0.5).toFixed(1)}" height="${barHeight.toFixed(1)}" rx="1"></rect>`;
      })
      .join("");
    return `<svg class="mini-spark" viewBox="0 0 ${width} ${height}" role="img" aria-label="Seven day trend"><g>${bars}</g><polyline class="spark-line" points="${points}"></polyline></svg>`;
  };

  const projectTableRow = (item) => `
    <button class="project-table-row" type="button" data-action="open-project" data-project="${esc(item.id)}">
      <span class="project-table-main">
        <span class="project-table-mark" aria-hidden="true">${esc(item.name.slice(0, 2).toUpperCase())}</span>
        <span class="project-table-name"><strong>${esc(item.name)}</strong><span>${esc(item.path)}</span></span>
      </span>
      <span class="project-table-branch">${icon("branch")}${esc(item.branch)}</span>
      <span class="project-table-number">${item.tasks} tasks</span>
      <span class="project-table-number">${item.files == null ? "—" : `${item.files} files`}</span>
      <span class="project-table-last">${esc(item.last)}</span>
    </button>`;

  const projectStatusBadge = (status) => {
    const tones = { Active: "success", Review: "warning", Paused: "neutral" };
    return badge(status, tones[status] || "neutral");
  };

  const progressLines = (languages, compact) => `
    <div class="progress-lines">
      ${languages
        .map((entry) => {
          const parts = entry.split(" ");
          const value = parseInt(parts[parts.length - 1], 10) || 0;
          return `<div class="progress-line"><span>${esc(parts.slice(0, -1).join(" "))}</span><span class="progress-track"><span style="width:${value}%"></span></span><span>${value}%</span></div>`;
        })
        .join("")}
    </div>`;

  /* --------------------------------------------------------------------- */
  /* Home                                                                  */
  /* --------------------------------------------------------------------- */

  R.home = function home() {
    const s = state();
    const running = NEXUS.threads.filter((item) => item.status === "running");
    const focus = running[0] || NEXUS.threads.filter((item) => item.status === "complete").find((item) => (item.changedFiles || []).length) || NEXUS.threads.find((item) => item.status === "complete") || NEXUS.threads[0] || null;
    const statuses = focus ? activityStatuses(focus) : NEXUS.agentActivityMap.empty;
    const tasks = focus ? activityTasks(focus) : NEXUS.agents.map((agent) => agent.task || "Idle");
    const usage = NEXUS.usage["7d"] || { labels: [], requests: [], input: [], output: [], cost: [], latency: 0 };
    const lastCost = usage.cost.length ? usage.cost[usage.cost.length - 1] : 0;
    const todayRequests = usage.requests.length ? usage.requests[usage.requests.length - 1] : 0;
    const working = statuses.filter((value) => value === "working").length;
    const activeAgents = statuses.filter((value) => value === "working" || value === "done").length;
    const needsReview = NEXUS.threads.filter((item) => item.status === "complete").length;
    const focusLabel = !focus ? "" : focus.status === "running" ? "Active execution" : focus.status === "failed" ? "Latest execution" : "Completed execution";
    const focusDetail = focus ? plainText(focus.detail).replace(/\s+/g, " ").trim() : "";
    const shortDetail = focusDetail.length > 260 ? `${focusDetail.slice(0, 260)}…` : focusDetail;

    if (!focus) {
      return `
        <div class="view">
          <div class="view-scroll">
            <div class="home">
              <header class="home-header">
                <div>
                  <span class="eyebrow">${esc(dateLabel())}</span>
                  <h1 class="page-title">Workspace overview</h1>
                  <p class="page-subtitle">No tasks have been recorded in this workspace yet. Start a task to bring the coordinator online.</p>
                </div>
                <div class="home-header-side">
                  <button class="btn btn-primary" type="button" data-action="new-task">${icon("plus")}New task</button>
                </div>
              </header>
              <div class="empty-state is-centered">
                <span class="empty-mark">${icon("workflow")}</span>
                <h3>No executions recorded</h3>
                <p>The coordinator has not run a task in this workspace yet.</p>
                <button class="btn btn-primary" type="button" data-action="new-task">${icon("plus")}Start a task</button>
              </div>
            </div>
          </div>
        </div>`;
    }

    const agentRows = NEXUS.agents
      .map((agent, index) => {
        const status = statuses[index] || "idle";
        return `
          <div class="agent-progress-row">
            <span class="agent-square" aria-hidden="true">${esc(agent.initials)}</span>
            <span class="agent-name">${esc(agent.name)}</span>
            <span class="agent-task">${esc(clip(tasks[index] || agent.task, 72))}</span>
            <span class="agent-row-status"><span class="status-dot ${statusTone(status)}" aria-hidden="true"></span>${statusLabel(status)}</span>
          </div>`;
      })
      .join("");

    return `
      <div class="view">
        <div class="view-scroll">
          <div class="home">
            <header class="home-header">
              <div>
                <span class="eyebrow">${esc(dateLabel())}</span>
                <h1 class="page-title">Workspace overview</h1>
                <p class="page-subtitle">${running.length ? `${running.length} execution${running.length === 1 ? "" : "s"} in flight. The coordinator is streaming live status from the local runtime.` : "No executions are running. Start a task to begin a coordinated run."}</p>
              </div>
              <div class="home-header-side">
                <span class="home-date">LOCAL · ${esc(new Date().toTimeString().slice(0, 5))}</span>
                <button class="btn btn-secondary" type="button" data-action="open-changes">${icon("diff")}Review changes</button>
                <button class="btn btn-primary" type="button" data-action="new-task">${icon("plus")}New task</button>
              </div>
            </header>

            <section class="metrics-strip" aria-label="Workspace metrics">
              <div class="metric">
                <div class="metric-label"><span>${focus.status === "running" ? "Active agents" : "Agents engaged"}</span><span class="status-dot ${statusTone(focus.status)}" aria-hidden="true"></span></div>
                <span class="metric-value">${activeAgents}<small> / ${NEXUS.agents.length}</small></span>
                <div class="metric-foot">${working} working · ${Math.max(0, activeAgents - working)} ready</div>
              </div>
              <div class="metric">
                <div class="metric-label"><span>In flight</span>${icon("workflow")}</div>
                <span class="metric-value">${running.length}<small> threads</small></span>
                <div class="metric-foot">${needsReview} completed · ${NEXUS.threads.length} recorded</div>
              </div>
              <div class="metric">
                <div class="metric-label"><span>Indexed files</span>${icon("files")}</div>
                <span class="metric-value">${totalIndexed()}<small> files</small></span>
                <div class="metric-foot">Active workspace index</div>
              </div>
              <div class="metric">
                <div class="metric-label"><span>Spend today</span>${icon("chart")}</div>
                <span class="metric-value">$${Number(lastCost || 0).toFixed(2)}<small> USD</small></span>
                <div class="metric-foot">${todayRequests} requests today</div>
              </div>
            </section>

            <div class="home-grid">
              <div class="home-main-col">
                <section class="panel focus-panel" aria-labelledby="focusTitle">
                  <div class="focus-panel-top">
                    <div>
                      <div class="focus-kicker"><span class="status-dot ${statusTone(focus.status)}" aria-hidden="true"></span>${focusLabel} · ${esc(focus.duration)}</div>
                      <h2 class="focus-title" id="focusTitle">${esc(focus.title)}</h2>
                      <p class="focus-brief">${esc(shortDetail)}</p>
                      <div class="focus-meta">
                        <span>${icon("branch")}${esc(focus.branch)}</span>
                        <span>${icon("check")}${esc(focus.progress)}</span>
                        <span>${icon("clock")}Updated ${esc(focus.updated)}</span>
                      </div>
                    </div>
                    <button class="btn btn-secondary btn-sm" type="button" data-action="open-thread" data-thread="${esc(focus.id)}">Open thread</button>
                  </div>
                  <div class="focus-agents">
                    <div class="agent-progress">${agentRows}</div>
                  </div>
                  <div class="focus-footer">
                    <span class="focus-footer-note">${icon("bolt")}${esc(shortDetail || "No active tool output.")}</span>
                    <div class="modal-actions">
                      ${focus.status === "running" ? `<button class="btn btn-ghost btn-sm" type="button" data-action="stop-task">${icon("stop")}Stop</button>` : ""}
                      <button class="btn btn-secondary btn-sm" type="button" data-action="open-changes">Review diff</button>
                    </div>
                  </div>
                </section>

                <section class="panel home-projects-panel" aria-labelledby="projectsTitle">
                  <div class="panel-head">
                    <h2 id="projectsTitle">Projects</h2>
                    <button class="section-link" type="button" data-view="projects">View all ${icon("chevron-right")}</button>
                  </div>
                  <div class="project-table-head" aria-hidden="true">
                    <span>Project</span><span>Branch</span><span>Tasks</span><span>Files</span><span>Last active</span>
                  </div>
                  ${NEXUS.projects.map(projectTableRow).join("")}
                </section>
              </div>

              <aside class="home-side-col" aria-label="Workspace side panels">
                <section class="panel">
                  <div class="panel-section">
                    <div class="side-panel-title">
                      <h2>Agent runtime</h2>
                      <button class="section-link" type="button" data-action="open-agents-settings">Configure</button>
                    </div>
                    <div class="runtime-mini-list">
                      ${NEXUS.agents
                        .map((agent, index) => {
                          const status = statuses[index] || "idle";
                          return `<div class="runtime-mini-row">
                            <span class="runtime-mini-mark" aria-hidden="true">${esc(agent.initials)}</span>
                            <span class="runtime-mini-name">${esc(agent.name)}</span>
                            <span class="runtime-mini-state">${statusLabel(status)}</span>
                            <span class="status-dot ${statusTone(status)}" aria-hidden="true"></span>
                          </div>`;
                        })
                        .join("")}
                    </div>
                  </div>
                  <div class="panel-section">
                    <div class="side-panel-title">
                      <h2>Usage</h2>
                      <button class="section-link" type="button" data-action="open-usage">Details ${icon("chevron-right")}</button>
                    </div>
                    <div class="usage-mini">
                      <div>
                        <span class="usage-mini-number">$${H.sum(usage.cost).toFixed(2)}</span>
                        <span class="usage-mini-label">Last 7 days · ${H.formatTokens(H.totalTokens(usage))} tokens</span>
                      </div>
                      ${sparkline(usage.requests)}
                    </div>
                  </div>
                  <div class="panel-section">
                    <div class="side-panel-title"><h2>Quick actions</h2></div>
                    <div class="quick-list">
                      <button class="quick-action" type="button" data-action="new-task">${icon("plus")}Start a task<kbd>N</kbd></button>
                      <button class="quick-action" type="button" data-action="open-command">${icon("command")}Command palette<kbd>⌘K</kbd></button>
                      <button class="quick-action" type="button" data-action="open-terminal">${icon("terminal")}Open terminal<kbd>⌃\`</kbd></button>
                      <button class="quick-action" type="button" data-action="open-workspace">${icon("code")}Workspace<kbd>W</kbd></button>
                    </div>
                  </div>
                </section>
              </aside>
            </div>
          </div>
        </div>
      </div>`;
  };

  /* --------------------------------------------------------------------- */
  /* Projects                                                              */
  /* --------------------------------------------------------------------- */

  R.projects = function projects() {
    const s = state();
    const filter = s.projectFilter;
    const items = NEXUS.projects.filter((item) => filter === "all" || item.status.toLowerCase() === filter);
    const counts = {
      all: NEXUS.projects.length,
      active: NEXUS.projects.filter((item) => item.status === "Active").length,
      review: NEXUS.projects.filter((item) => item.status === "Review").length,
      paused: NEXUS.projects.filter((item) => item.status === "Paused").length
    };

    return `
      <div class="view">
        <div class="view-scroll">
          <div class="page is-wide">
            <header class="page-header">
              <div class="page-header-main">
                <span class="eyebrow">Library</span>
                <h1 class="page-title">Projects</h1>
                <p class="page-subtitle">Repositories available to the coordinator, their active branches, and the work in progress.</p>
              </div>
              <div class="page-header-side">
                <button class="btn btn-secondary" type="button" data-action="open-command">${icon("search")}Find project</button>
                <button class="btn btn-primary" type="button" data-action="new-project">${icon("plus")}New project</button>
              </div>
            </header>

            <section class="project-summary-strip" aria-label="Project totals">
              <div class="project-summary-cell"><span>Projects</span><strong>${NEXUS.projects.length}</strong></div>
              <div class="project-summary-cell"><span>In flight</span><strong>${NEXUS.threads.filter((item) => item.status === "running").length}</strong></div>
              <div class="project-summary-cell"><span>Indexed files</span><strong>${totalIndexed()}</strong></div>
              <div class="project-summary-cell"><span>Awaiting review</span><strong>${NEXUS.threads.filter((item) => item.status === "complete").length}</strong></div>
            </section>

            <div class="projects-toolbar">
              <div class="filter-group" role="group" aria-label="Filter projects">
                ${[
                  ["all", "All"],
                  ["active", "Active"],
                  ["review", "Review"],
                  ["paused", "Paused"]
                ]
                  .map(
                    ([key, label]) =>
                      `<button class="filter-button" type="button" data-project-filter="${key}" aria-pressed="${filter === key}">${label} <span class="muted">${counts[key]}</span></button>`
                  )
                  .join("")}
              </div>
              <span class="meta-row">${icon("database")}${totalIndexed()} files indexed · synced from the local runtime</span>
            </div>

            ${
              items.length
                ? `<div class="panel">
                    <div class="projects-list-head" aria-hidden="true">
                      <span>Project</span><span>Path</span><span>Branch</span><span>Tasks</span><span>Last active</span><span>Status</span>
                    </div>
                    ${items
                      .map(
                        (item) => `
                      <button class="projects-row${s.selectedProject === item.id ? " is-selected" : ""}" type="button" data-action="open-project" data-project="${esc(item.id)}">
                        <span class="project-identity">
                          <span class="project-icon">${icon("folder")}</span>
                          <span class="project-identity-copy"><strong>${esc(item.name)}</strong><span>${item.files == null ? "Not indexed" : `${item.files} files`} · ${esc(item.remote)}</span></span>
                        </span>
                        <span class="project-path">${esc(item.path)}</span>
                        <span class="project-branch">${icon("branch")}${esc(item.branch)}</span>
                        <span class="project-count">${item.tasks}</span>
                        <span class="project-last">${esc(item.last)}</span>
                        <span>${projectStatusBadge(item.status)}</span>
                      </button>`
                      )
                      .join("")}
                  </div>`
                : `<div class="empty-state is-centered">
                    <span class="empty-mark">${icon("folder")}</span>
                    <h3>No ${esc(filter)} projects</h3>
                    <p>There are no repositories with this status. Clear the filter or add another project.</p>
                    <button class="btn btn-secondary" type="button" data-project-filter="all">Show all projects</button>
                  </div>`
            }
          </div>
        </div>
      </div>`;
  };

  /* --------------------------------------------------------------------- */
  /* Project overview                                                      */
  /* --------------------------------------------------------------------- */

  R.project = function projectOverview() {
    const item = project();
    const threads = H.threadsForProject(item.id);

    return `
      <div class="view">
        <div class="view-scroll">
          <div class="page is-wide">
            <button class="back-link" type="button" data-view="projects">${icon("arrow-left")}All projects</button>
            <header class="page-header">
              <div class="page-header-main">
                <span class="eyebrow">Project</span>
                <h1 class="page-title">${esc(item.name)}</h1>
                <p class="page-subtitle">${esc(item.description)}</p>
                <div class="project-hero-meta">
                  <span class="meta-row">${icon("branch")}${esc(item.branch)}</span>
                  <span class="meta-row">${icon("globe")}${esc(item.remote)}</span>
                  <span class="meta-row">${icon("folder")}${esc(item.path)}</span>
                  <span class="meta-row">${icon("clock")}Active ${esc(item.last)}</span>
                </div>
              </div>
              <div class="project-hero-actions">
                <button class="btn btn-secondary" type="button" data-action="open-workspace" data-project="${esc(item.id)}">${icon("code")}Open workspace</button>
                <button class="btn btn-primary" type="button" data-action="new-task" data-project="${esc(item.id)}">${icon("plus")}New task</button>
              </div>
            </header>

            <section class="project-summary-strip" aria-label="Project summary">
              <div class="project-summary-cell"><span>Open tasks</span><strong>${threads.filter((entry) => entry.status === "running").length}</strong></div>
              <div class="project-summary-cell"><span>Threads</span><strong>${threads.length}</strong></div>
              <div class="project-summary-cell"><span>Indexed files</span><strong>${item.files == null ? "—" : item.files}</strong></div>
              <div class="project-summary-cell"><span>Last activity</span><strong>${esc(item.last)}</strong></div>
            </section>

            <div class="overview-grid">
              <div class="stack-16">
                <section class="panel thread-list-panel" aria-labelledby="threadsTitle">
                  <div class="panel-head">
                    <h2 id="threadsTitle">Threads</h2>
                    <button class="section-link" type="button" data-action="new-chat">Start blank chat ${icon("chevron-right")}</button>
                  </div>
                  ${
                    threads.length
                      ? threads
                          .map(
                            (entry) => `
                        <button class="overview-thread" type="button" data-action="open-thread" data-thread="${esc(entry.id)}">
                          <span class="thread-state-dot is-${esc(entry.status)}" aria-hidden="true"></span>
                          <span class="overview-thread-body">
                            <strong>${esc(entry.title)}</strong>
                            <span>${esc(clip(entry.detail, 120))}</span>
                          </span>
                          <span class="overview-thread-meta">${esc(entry.updated)} · ${esc(entry.progress)}</span>
                        </button>`
                          )
                          .join("")
                      : `<div class="empty-state is-centered">
                          <span class="empty-mark">${icon("chat")}</span>
                          <h3>No threads yet</h3>
                          <p>Start a task and the coordinator will open a thread for this project.</p>
                          <button class="btn btn-primary" type="button" data-action="new-task">${icon("plus")}Start task</button>
                        </div>`
                  }
                </section>

                <section class="panel">
                  <div class="panel-head">
                    <h2>Recent activity</h2>
                    <button class="section-link" type="button" data-action="open-usage">Usage ${icon("chevron-right")}</button>
                  </div>
                  <div class="panel-body">
                    <div class="progress-lines">
                      <div class="progress-line"><span>Checks passed</span><span class="progress-track"><span style="width:56%"></span></span><span>56%</span></div>
                      <div class="progress-line"><span>Context coverage</span><span class="progress-track"><span style="width:78%"></span></span><span>78%</span></div>
                      <div class="progress-line"><span>Thread completion</span><span class="progress-track"><span style="width:64%"></span></span><span>64%</span></div>
                    </div>
                  </div>
                </section>
              </div>

              <aside class="stack-16">
                <section class="panel">
                  <div class="panel-head"><h2>Repository</h2><span class="badge badge-neutral">Git</span></div>
                  <div class="panel-body">
                    <div class="repo-summary">
                      <div class="repo-row"><span>Remote</span><strong>${esc(item.remote)}</strong></div>
                      <div class="repo-row"><span>Base branch</span><strong>${esc(item.baseBranch)}</strong></div>
                      <div class="repo-row"><span>Working branch</span><strong>${esc(item.branch)}</strong></div>
                      <div class="repo-row"><span>Working tree</span><strong>3 modified · 1 added</strong></div>
                      <div class="repo-row"><span>Last commit</span><strong>41m ago</strong></div>
                    </div>
                  </div>
                </section>
                <section class="panel">
                  <div class="panel-head"><h2>Languages</h2><span class="muted">Indexed</span></div>
                  <div class="panel-body">${progressLines(item.languages)}</div>
                </section>
                <section class="panel">
                  <div class="panel-head"><h2>Settings</h2><button class="section-link" type="button" data-action="open-settings" data-section="projects">Open ${icon("chevron-right")}</button></div>
                  <div class="panel-body">
                    <div class="inline-note">${icon("shield")}<span>Writes to this repository require approval under the workspace policy.</span></div>
                  </div>
                </section>
              </aside>
            </div>
          </div>
        </div>
      </div>`;
  };

  /* --------------------------------------------------------------------- */
  /* Chat                                                                  */
  /* --------------------------------------------------------------------- */

  const executionIcon = (status) => {
    if (status === "done") return "check";
    if (status === "working") return "loader";
    if (status === "failed") return "alert";
    if (status === "waiting") return "clock";
    return "more";
  };

  const renderExecution = (item) => {
    const statuses = activityStatuses(item);
    const tasks = activityTasks(item);
    const tool = activityTool(item);

    return `
      <section class="execution" aria-label="Agent execution">
        <div class="execution-head">
          <div class="execution-head-main">
            <span class="execution-symbol">${icon("workflow")}</span>
            <div>
              <h3>Agent execution</h3>
              <p>${esc(item.progress)} · coordinator assigned ${NEXUS.agents.filter((agent, index) => statuses[index] !== "waiting" && statuses[index] !== "idle").length} agents</p>
            </div>
          </div>
          <div class="execution-head-meta">
            <span>${icon("clock")}${esc(item.duration)}</span>
            ${badge(statusLabel(item.status), item.status === "running" ? "accent" : item.status === "failed" ? "danger" : "success")}
          </div>
        </div>
        <div class="execution-body">
          <div class="agent-timeline">
            ${NEXUS.agents
              .map((agent, index) => {
                const status = statuses[index] || "idle";
                const detail =
                  status === "working"
                    ? `<span>${icon("loader")} active</span>`
                    : status === "done"
                      ? `<span>${icon("check")} complete</span>`
                      : status === "failed"
                        ? `<span>${icon("alert")} blocked</span>`
                        : `<span>queued</span>`;
                return `
                  <div class="agent-step is-${status}">
                    <span class="agent-step-mark">${icon(executionIcon(status))}</span>
                    <div class="agent-step-body">
                      <div class="agent-step-title">${esc(agent.name)} <span>${esc(agent.role)}</span></div>
                      <p class="agent-step-desc">${esc(clip(tasks[index] || agent.task, 90))}</p>
                      <div class="agent-step-detail">${detail}</div>
                    </div>
                    <span class="agent-step-status is-${status}">${statusLabel(status)}</span>
                  </div>`;
              })
              .join("")}
          </div>
          ${
            tool
              ? `<div class="tool-call">
                  <div class="tool-call-head">${icon("terminal")}<span>${esc(tool.command)}</span><span class="muted">${esc(tool.state)}</span></div>
                  <div class="tool-call-body">${esc(tool.output)
                    .split("\n")
                    .map((line) => `<div class="${line.startsWith("PASS") || line.startsWith("✓") ? "is-ok" : line.startsWith("FAIL") ? "" : "is-dim"}">${line || "&nbsp;"}</div>`)
                    .join("")}</div>
                </div>`
              : ""
          }
          <div class="verification">
            ${
              item.status === "failed"
                ? `<span class="verification-chip is-warning">${icon("alert")}Verification stopped</span><span class="verification-chip">${icon("alert")}Execution failed</span>`
                : item.status === "complete"
                  ? `<span class="verification-chip">${icon("check")}Execution completed</span><span class="verification-chip">${icon("diff")}Review recorded changes</span>`
                  : `<span class="verification-chip is-warning">${icon("clock")}${esc(item.progress)}</span><span class="verification-chip">${icon("loader")}Live events streaming</span>`
            }
          </div>
        </div>
        <div class="execution-foot">
          <span class="execution-foot-left">${icon("branch")}${esc(item.branch)}<span class="meta-dot"></span><span>${esc(item.progress)}</span></div>
          <div class="execution-foot-right">
            <button class="btn btn-ghost btn-sm" type="button" data-action="open-changes">View changes</button>
            ${
              item.status === "running"
                ? `<button class="btn btn-secondary btn-sm" type="button" data-action="stop-task">${icon("stop")}Stop</button>`
                : `<button class="btn btn-secondary btn-sm" type="button" data-action="open-changes">Review diff</button>`
            }
          </div>
        </div>
      </section>`;
  };

  const messageHead = (author, time, target) =>
    `<div class="chat-message-head"><span class="chat-message-author">${esc(author)}</span><span class="chat-message-time">${esc(time)}</span>${target ? `<span class="badge badge-neutral">${esc(target)}</span>` : ""}</div>`;

  const fileChanges = (item) => {
    const files = NEXUS.threadFiles[item.id] || [];
    if (!files.length) return "";
    const add = files.reduce((sum, file) => sum + file.add, 0);
    const del = files.reduce((sum, file) => sum + file.del, 0);
    return `
      <section class="chat-file-changes" aria-label="Changed files">
        <div class="chat-file-changes-head">
          <span>${files.length} file${files.length === 1 ? "" : "s"} changed · <span class="chat-file-stats"><span class="add">+${add}</span> <span class="del">−${del}</span></span></span>
          <button class="section-link" type="button" data-action="open-changes">Review ${icon("chevron-right")}</button>
        </div>
        ${files
          .map(
            (file) => `
          <div class="chat-file-row">
            <span class="change-letter is-${file.status.toLowerCase()}" aria-hidden="true">${esc(file.status)}</span>
            <span class="chat-file-path">${esc(file.path)}</span>
            <span class="chat-file-stats"><span class="add">+${file.add}</span> <span class="del">−${file.del}</span></span>
          </div>`
          )
          .join("")}
      </section>`;
  };

  const threadMessages = (item) => {
    const messages = state().threadMessages[item.id] || [];
    const pending = state().pendingThread === item.id;
    return `
      ${messages
        .map(
          (message) => `
        <div class="chat-message${message.role === "user" ? " is-user" : ""}">
          ${messageHead(message.role === "user" ? "You" : "Coordinator", message.time)}
          <div class="chat-message-body"><p>${richText(message.text)}</p></div>
        </div>`
        )
        .join("")}
      ${
        pending
          ? `<div class="loading-label">${icon("loader")}Coordinator is drafting a response…</div>`
          : ""
      }`;
  };

  const chatActions = (item) => `
    <div class="chat-actions">
      <button class="btn btn-secondary btn-sm" type="button" data-action="open-changes">${icon("diff")}Open changes</button>
      <button class="btn btn-secondary btn-sm" type="button" data-action="copy-summary" data-thread="${esc(item.id)}">${icon("copy")}Copy summary</button>
      ${
        item.status === "failed"
          ? `<button class="btn btn-primary btn-sm" type="button" data-action="retry-thread" data-thread="${esc(item.id)}">${icon("refresh")}Retry execution</button>`
          : ""
      }
    </div>`;

  const threadBody = (item) => {
    const response = NEXUS.defaultResponses[item.id];
    const isFailed = item.status === "failed";
    const messages = [];

    messages.push(`<div class="chat-divider">Execution · ${esc(item.duration)}</div>`);
    messages.push(renderExecution(item));

    if (item.status === "complete") {
      messages.push(fileChanges(item));
    } else if (isFailed) {
      messages.push(`
        <div class="chat-message">
          ${messageHead("Coordinator", item.updated || "", "Blocked")}
          <div class="chat-message-body">
            <div class="error-panel chat-error">
              <div class="error-panel-head">
                ${icon("alert-circle")}
                <div>
                  <h3>${esc(item.errorTitle || "Execution failed")}</h3>
                  <p>${esc(item.errorBody || item.detail)}</p>
                </div>
              </div>
              <details>
                <summary>Show diagnostic log</summary>
                <pre class="error-log">${esc(item.errorDetail || "No diagnostic output was captured.")}</pre>
              </details>
              <div class="error-actions">
                <button class="btn btn-primary btn-sm" type="button" data-action="retry-thread" data-thread="${esc(item.id)}">${icon("refresh")}Retry execution</button>
                <button class="btn btn-secondary btn-sm" type="button" data-action="open-terminal">${icon("terminal")}Open terminal</button>
              </div>
            </div>
          </div>
        </div>`);
    } else {
      messages.push(`
        <div class="chat-message">
          ${messageHead("Coordinator", item.updated || "", "In progress")}
          <div class="chat-message-body">
            <p>${esc(plainText(response || item.detail || "The coordinator is assembling the execution plan."))}</p>
            <p>${icon("loader")} Waiting for the next runtime event.</p>
          </div>
        </div>`);
      messages.push(fileChanges(item));
    }

    return messages.join("");
  };

  const composer = (item) => {
    const s = state();
    const running = item && item.status === "running";
    const models = NEXUS.models
      .flatMap((group) => group.items.map((entry) => ({ name: entry.name, providerId: group.providerId })))
      .map(
        (entry) =>
          `<option value="${esc(entry.name)}"${s.selectedModel === entry.name ? " selected" : ""}>${esc(entry.name)}</option>`
      )
      .join("");

    return `
      <div class="chat-composer-wrap">
        <form class="chat-composer${s.composerError ? " has-error" : ""}" id="chatForm" novalidate>
          <div class="composer-context">
            <span>${icon("branch")}${esc(item ? item.branch : project().branch)}</span>
            <span>${icon("shield")}Approval required for writes</span>
          </div>
          ${
            s.attachments.length
              ? `<div class="composer-attachments">
                  ${s.attachments
                    .map(
                      (file, index) => `
                    <span class="attachment-chip">${icon("paperclip")}${esc(file)}<button type="button" data-action="remove-attachment" data-index="${index}" aria-label="Remove ${esc(file)}">${icon("x")}</button></span>`
                    )
                    .join("")}
                </div>`
              : ""
          }
          <label class="sr-only" for="composerInput">Message the coordinator</label>
          <textarea class="composer-textarea" id="composerInput" name="message" rows="2" placeholder="${running ? "Add guidance while the agents work…" : "Describe the next change, ask a question, or paste a trace…"}" aria-invalid="${s.composerError ? "true" : "false"}">${esc(s.composerDraft)}</textarea>
          <div class="composer-toolbar">
            <div class="composer-tools">
              <button class="composer-icon" type="button" data-action="attach-file" aria-label="Attach file" data-tooltip="Attach file">${icon("paperclip")}</button>
              <input type="file" id="chatFileInput" hidden multiple>
              <button class="composer-icon" type="button" data-action="mention-agent" aria-label="Mention an agent" data-tooltip="Mention agent">${icon("at")}</button>
              <select class="composer-select" data-composer-mode aria-label="Agent mode">
                <option value="build">Build</option>
                <option value="plan">Plan</option>
                <option value="review">Review</option>
              </select>
              <select class="composer-select" data-composer-model aria-label="Model">
                ${models}
              </select>
            </div>
            <div class="composer-actions">
              ${
                running
                  ? `<button class="composer-stop" type="button" data-action="stop-task">${icon("stop")}Stop</button>`
                  : ""
              }
              <button class="composer-send" type="submit" aria-label="Send message">${icon("send")}</button>
            </div>
          </div>
        </form>
        <div class="composer-bottom-note">Enter to send · Shift+Enter for a new line · ${esc(s.selectedModel)}</div>
      </div>`;
  };

  const chatEmpty = () => `
    <div class="chat-view">
      <div class="chat-contextbar">
        <div class="chat-context-main">
          <span class="chat-context-title">New thread</span>
          <span class="chat-context-branch">${icon("branch")}${esc(project().branch)}</span>
        </div>
        <div class="chat-context-actions">
          <button class="chat-model-button" type="button" data-action="open-model">${icon("cpu")}${esc(state().selectedModel)}</button>
        </div>
      </div>
      <div class="chat-scroll">
        <div class="chat-empty">
          <span class="chat-empty-mark">${icon("bolt")}</span>
          <h1>What should we build?</h1>
          <p>Describe an outcome and the coordinator will assemble the right agents. You can ask for a plan first, or let the team implement and verify the change.</p>
          <div class="chat-suggestions">
            <button class="chat-suggestion" type="button" data-suggestion="Review the current working tree for regressions and missing tests. Do not change files yet.">${icon("shield")}<span>Review the current diff for regressions</span></button>
            <button class="chat-suggestion" type="button" data-suggestion="Run the test suite in this workspace and report every failure with the file and line number.">${icon("flask")}<span>Run the tests and report failures</span></button>
            <button class="chat-suggestion" type="button" data-suggestion="Explain the architecture of this workspace, the main entry points, and how the packages depend on each other.">${icon("box")}<span>Explain the workspace architecture</span></button>
            <button class="chat-suggestion" type="button" data-suggestion="Find the highest-impact small improvement in this workspace, implement it, and verify the change.">${icon("bolt")}<span>Implement one small improvement</span></button>
          </div>
        </div>
      </div>
      ${composer(null)}
    </div>`;

  R.chat = function chat() {
    const item = thread();
    if (!item) return `<div class="view">${chatEmpty()}</div>`;

    return `
      <div class="view">
        <div class="chat-view">
          <div class="chat-contextbar">
            <div class="chat-context-main">
              <span class="chat-context-title">${esc(item.title)}</span>
              ${badge(statusLabel(item.status), item.status === "running" ? "accent" : item.status === "failed" ? "danger" : "success")}
              <span class="chat-context-branch">${icon("branch")}${esc(item.branch)}</span>
            </div>
            <div class="chat-context-actions">
              <button class="chat-model-button" type="button" data-action="open-model">${icon("cpu")}${esc(state().selectedModel)}</button>
              <span class="chat-status"><span class="status-dot ${statusTone(item.status)}" aria-hidden="true"></span>${item.status === "running" ? "Agents working" : statusLabel(item.status)}</span>
              <button class="icon-button" type="button" data-action="open-command" aria-label="Thread actions">${icon("more")}</button>
            </div>
          </div>
          <div class="chat-scroll" id="chatScroll">
            <div class="chat-thread">
              ${threadMessages(item)}
              ${threadBody(item)}
              ${chatActions(item)}
            </div>
          </div>
          ${composer(item)}
        </div>
      </div>`;
  };

  /* --------------------------------------------------------------------- */
  /* Workspace / IDE                                                       */
  /* --------------------------------------------------------------------- */

  const codeFor = (name) => NEXUS.codeSamples[name] || [`// ${name || "No file selected"} is not loaded.`, "// Choose a file from the explorer to read it from the workspace."];

  const filePathFor = (name) => {
    const match = NEXUS.contextFiles.find((file) => file.name === name);
    if (match) return match.path;
    const changed = NEXUS.changeFiles.find((file) => file.name === name);
    if (changed) return changed.path;
    return name || "untitled";
  };

  const renderCode = (name) => {
    const lines = codeFor(name);
    const active = 1;
    return lines
      .map(
        (line, index) => `
        <div class="code-line${index + 1 === active ? " is-active" : ""}">
          <span class="line-number" aria-hidden="true">${index + 1}</span>
          <span class="line-code">${line || "&nbsp;"}</span>
        </div>`
      )
      .join("");
  };

  const ideBottom = () => {
    const s = state();
    if (s.ideBottom === "problems") {
      return `<div class="ide-empty">${icon("check")}<span>No diagnostics have been reported by the runtime.</span></div>`;
    }
    if (s.ideBottom === "output") {
      const stats = NEXUS.usageStats || {};
      return `<div class="ide-output-title">Runtime output</div>
        <div class="ide-terminal-line"><span class="dim">NEXUS ${NEXUS.version} · ${NEXUS.projects.length} workspaces · ${NEXUS.threads.length} tasks</span></div>
        <div class="ide-terminal-line"><span class="ok">✓ ${stats.totalRequests || 0} provider requests recorded</span></div>
        <div class="ide-terminal-line"><span class="dim">${stats.totalTokens || 0} tokens · $${Number(stats.totalCost || 0).toFixed(4)} estimated</span></div>`;
    }
    const entries = (state().terminalEntries || []).slice(-6);
    if (!entries.length) {
      return `<div class="ide-empty">${icon("terminal")}<span>No commands run in this session. Open the terminal to start a shell.</span></div>`;
    }
    return entries
      .map((entry) => {
        const head = `<div class="ide-terminal-line"><span class="prompt">❯</span><span class="dim">${esc(entry.cwd || "")}</span><span>${esc(entry.command)}</span></div>`;
        const output = (entry.output || [])
          .slice(-4)
          .map((line) => `<div class="ide-terminal-line"><span class="${line.tone === "err" ? "err" : "dim"}">${esc(line.text)}</span></div>`)
          .join("");
        return head + output;
      })
      .join("");
  };

  R.workspace = function workspace() {
    const s = state();
    const item = project();
    const files = s.openFiles.length ? s.openFiles : ["README.md"];

    return `
      <div class="view">
        <div class="workspace-view">
          <header class="ide-header">
            <div class="ide-header-main">
              <span class="ide-project">${esc(item.name)}</span>
              <span class="ide-separator">/</span>
              <span class="ide-branch">${icon("branch")}${esc(item.branch)}</span>
              <span class="ide-sync"><span class="status-dot is-success" aria-hidden="true"></span>${item.files == null ? "Index not loaded" : `${item.files} files indexed`}</span>
            </div>
            <div class="ide-header-actions">
              <button class="btn btn-ghost btn-sm" type="button" data-action="open-terminal">${icon("terminal")}Terminal</button>
              <button class="btn btn-secondary btn-sm" type="button" data-action="open-changes">${icon("diff")}Changes</button>
              <button class="btn btn-primary btn-sm" type="button" data-action="new-task">${icon("plus")}Task</button>
            </div>
          </header>

          <div class="ide-layout">
            <aside class="ide-explorer" aria-label="File explorer">
              <div class="ide-panel-head">
                <span class="ide-panel-title">Explorer</span>
                <button class="sidebar-head-action" type="button" data-action="open-command" aria-label="Find file">${icon("search")}</button>
              </div>
              <div class="ide-explorer-scroll">
                ${NEXUS.workspaceGroups
                  .map(
                    (group) => `
                  <div class="tree-folder-row">${icon("chevron-down")}${icon("folder")}<strong>${esc(group.folder)}</strong></div>
                  ${group.files
                    .filter((file) => file.type !== "folder")
                    .map(
                      (file) => `
                    <button class="tree-file${file.path && file.name === s.workspaceFile ? " is-active" : ""}" type="button" data-action="open-file" data-file="${esc(file.name)}" data-path="${esc(file.path || "")}">
                      ${icon(fileIcon(file.name))}
                      <span class="tree-file-name">${esc(file.name)}</span>
                      ${file.changed ? '<span class="tree-file-badge" aria-label="Changed"></span>' : ""}
                    </button>`
                    )
                    .join("")}
                `
                  )
                  .join("")}
              </div>
            </aside>

            <section class="ide-editor" aria-label="Code editor">
              <div class="editor-tabs" role="tablist" aria-label="Open files">
                ${files
                  .map(
                    (file) => `
                  <div class="editor-tab${s.workspaceFile === file ? " is-active" : ""}" role="tab" tabindex="0" aria-selected="${s.workspaceFile === file}" data-action="open-file" data-file="${esc(file)}">
                    ${icon(fileIcon(file))}
                    <span>${esc(file)}</span>
                    ${NEXUS.changeFiles.some((change) => change.name === file) ? '<span class="editor-tab-dot" aria-label="Modified"></span>' : ""}
                    <button class="editor-tab-close" type="button" data-action="close-file" data-file="${esc(file)}" aria-label="Close ${esc(file)}">${icon("x")}</button>
                  </div>`
                  )
                  .join("")}
              </div>
              <div class="editor-breadcrumb">${filePathFor(s.workspaceFile).split("/").filter(Boolean).map((part) => `<span>${esc(part)}</span>`).join("<span>/</span>")}</div>
              <div class="editor-code-scroll">
                <div class="code-block">${renderCode(s.workspaceFile)}</div>
              </div>
              <div class="editor-statusbar">
                <div class="editor-status-left"><span class="status-dot is-success" aria-hidden="true"></span><span>${esc((s.workspaceFile.split(".").pop() || "text").toUpperCase())}</span><span>Ln 1, Col 1</span><span>UTF-8</span></div>
                <div class="editor-status-right"><span>UTF-8</span><span>${esc(item.branch)}</span><span>${esc(s.selectedModel)}</span></div>
              </div>
            </section>

            <aside class="ide-ai" aria-label="NEXUS assistant">
              <div class="ide-panel-head">
                <span class="ide-panel-title">NEXUS</span>
                <button class="sidebar-head-action" type="button" data-action="open-chat" aria-label="Open full thread">${icon("external")}</button>
              </div>
              <div class="ide-ai-scroll">
                <div class="ide-ai-status">
                  ${icon("bolt")}
                  <p><strong>${s.selectedThread ? esc((H.threadById(s.selectedThread) || {}).progress || "Ready") : "Workspace ready"}</strong>${s.selectedThread ? esc(clip((H.threadById(s.selectedThread) || {}).detail || "", 220)) : "Select a thread to stream live agent activity."}</p>
                </div>
                <div class="ide-ai-section">
                  <div class="ide-ai-section-title"><span>Workspace context</span><span>${NEXUS.contextFiles.length}</span></div>
                  ${
                    NEXUS.contextFiles.length
                      ? NEXUS.contextFiles
                          .slice(0, 3)
                          .map(
                            (file) => `<div class="suggestion-card">
                    <div class="suggestion-card-head">${icon(fileIcon(file.name))}${esc(file.name)}</div>
                    <p class="mono">${esc(file.path)}</p>
                    <div class="suggestion-actions"><button class="btn btn-ghost btn-sm" type="button" data-action="open-file" data-file="${esc(file.name)}" data-path="${esc(file.path)}">Open</button></div>
                  </div>`
                          )
                          .join("")
                      : `<div class="context-empty">${icon("folder")}<p>No files indexed for this workspace.</p></div>`
                  }
                </div>
                <div class="ide-ai-input">
                  <label class="sr-only" for="ideAiInput">Ask about this file</label>
                  <textarea id="ideAiInput" rows="2" placeholder="Ask about this file…"></textarea>
                  <div class="ide-ai-input-row"><span>${esc(s.selectedModel)} · ${esc(item.branch)}</span><button class="btn btn-primary btn-sm" type="button" data-action="ide-send">${icon("send")}Ask</button></div>
                </div>
              </div>
            </aside>
          </div>

          <div class="ide-bottom">
            <div class="ide-bottom-tabs">
              <div class="ide-bottom-tabgroup" role="tablist" aria-label="Editor panel">
                <button class="ide-bottom-tab" type="button" role="tab" data-ide-bottom="terminal" aria-selected="${s.ideBottom === "terminal"}">Terminal</button>
                <button class="ide-bottom-tab" type="button" role="tab" data-ide-bottom="problems" aria-selected="${s.ideBottom === "problems"}">Problems</button>
                <button class="ide-bottom-tab" type="button" role="tab" data-ide-bottom="output" aria-selected="${s.ideBottom === "output"}">Output</button>
              </div>
              <span class="ide-bottom-tab-note">${esc(s.settings.shell || "shell")} · ${esc(item.name)}</span>
            </div>
            <div class="ide-bottom-content">${ideBottom()}</div>
          </div>
        </div>
      </div>`;
  };

  /* --------------------------------------------------------------------- */
  /* Terminal                                                              */
  /* --------------------------------------------------------------------- */

  const terminalEntry = (entry) => {
    const output = (entry.output || [])
      .map((line) => `<div class="terminal-output"><span class="${esc(line.tone || "muted")}">${esc(line.text) || "&nbsp;"}</span></div>`)
      .join("");
    return `
      <div class="terminal-entry" data-entry="${esc(entry.id)}">
        <div class="terminal-command-line">
          ${entry.ai ? `<span class="terminal-ai-label">${icon("bolt")}NEXUS</span>` : ""}
          <span class="terminal-prompt-symbol">❯</span>
          <span class="terminal-path">${esc(entry.cwd)}</span>
          <span>${esc(entry.command)}</span>
        </div>
        ${output}
        ${entry.state === "running" ? '<div class="terminal-output"><span class="info">Running…</span></div>' : ""}
      </div>`;
  };

  R.terminal = function terminal() {
    const s = state();
    const entries = s.terminalEntries;
    const item = project();
    const last = entries[entries.length - 1];
    const shell = s.settings.shell || "shell";
    return `
      <div class="view">
        <div class="terminal-page">
          <header class="page-header">
            <div class="page-header-main">
              <span class="eyebrow">Session</span>
              <h1 class="page-title">Terminal</h1>
              <p class="page-subtitle">A shared shell for the workspace. Agent commands are marked and remain reviewable.</p>
            </div>
            <div class="page-header-side">
              <button class="btn btn-secondary" type="button" data-action="new-session">${icon("refresh")}New session</button>
              <button class="btn btn-primary" type="button" data-action="run-task">${icon("play")}Run task</button>
            </div>
          </header>
          <div class="terminal-summary">
            <span><span class="status-dot ${s.terminalBusy ? "is-working" : "is-success"}" aria-hidden="true"></span>${s.terminalBusy ? "Command running" : "Session active"}</span>
            <span>${icon("terminal")}${esc(shell)}</span>
            <span>${icon("folder")}${esc(item ? item.path : "no workspace")}</span>
            <span>${entries.length} command${entries.length === 1 ? "" : "s"}</span>
          </div>
          <div class="terminal-frame">
            <div class="terminal-bar">
              <div class="terminal-bar-left">
                <span class="terminal-session"><span class="status-dot" aria-hidden="true"></span>${esc(item ? item.name : "NEXUS")} — ${esc(shell)}</span>
                <span class="terminal-bar-note">${esc(item ? item.path : "no workspace")}</span>
              </div>
              <div class="terminal-bar-right">
                <button class="terminal-bar-button" type="button" data-action="clear-terminal" aria-label="Clear terminal">${icon("trash")}</button>
                <button class="terminal-bar-button" type="button" data-action="restart-terminal" aria-label="Restart session">${icon("refresh")}</button>
                <button class="terminal-bar-button" type="button" data-action="open-command" aria-label="Command palette">${icon("more")}</button>
              </div>
            </div>
            <div class="terminal-body" id="terminalBody">
              ${
                entries.length
                  ? entries.map(terminalEntry).join("")
                  : `<div class="terminal-empty">${icon("terminal")}<p>Session is ready. Type a command to begin.</p></div>`
              }
            </div>
            <form class="terminal-input-row" id="terminalForm">
              <span class="terminal-input-prompt">❯ ${esc(item ? item.path : "~")}</span>
              <label class="sr-only" for="terminalInput">Terminal command</label>
              <input class="terminal-input" id="terminalInput" type="text" placeholder="Type a command…" autocomplete="off" spellcheck="false" ${s.terminalBusy ? "disabled" : ""}>
              <button class="terminal-run-button" type="submit" ${s.terminalBusy ? "disabled" : ""}>${icon("play")}Run</button>
            </form>
            <div class="terminal-statusline">
              <span><span class="status-dot ${last ? (last.state === "running" ? "is-working" : "is-success") : ""}" aria-hidden="true"></span>${last ? (last.state === "running" ? "running" : "completed") : "ready"}</span>
              <span>${esc(s.selectedModel)}</span>
              <span>UTF-8 · ${esc(shell)}</span>
            </div>
          </div>
        </div>
      </div>`;
  };

  /* --------------------------------------------------------------------- */
  /* Changes                                                               */
  /* --------------------------------------------------------------------- */

  const diffStatusLetter = (status) => `<span class="change-letter is-${status.toLowerCase()}">${esc(status)}</span>`;

  const diffPanel = (change) => {
    if (!change) {
      return `
        <div class="diff-panel">
          <div class="diff-empty">${icon("diff")}<p>Select a file to review its changes.</p></div>
        </div>`;
    }
    return `
      <section class="diff-panel" aria-label="Diff for ${esc(change.name)}">
        <div class="diff-panel-head">
          <div class="diff-file-title">
            ${icon("file")}
            <strong>${esc(change.name)}</strong>
            <span>${esc(change.dir)}</span>
            ${badge(change.statusLabel, change.status === "A" ? "success" : change.status === "D" ? "danger" : "warning")}
          </div>
          <div class="diff-head-actions">
            <button class="btn btn-ghost btn-sm" type="button" data-action="copy-path" data-path="${esc(change.path)}">${icon("copy")}Copy path</button>
            <button class="btn btn-secondary btn-sm" type="button" data-action="open-file" data-file="${esc(change.name)}" data-path="${esc(change.path)}">${icon("code")}<span>Open file</span></button>
            <button class="btn btn-secondary btn-sm" type="button" data-action="approve-file" data-file="${esc(change.name)}">${icon("check")}<span>Approve</span></button>
          </div>
        </div>
        <div class="diff-scroll">
          ${
            change.hunks.length
              ? change.hunks
                  .map(
                    (hunk) => `
                <div class="diff-hunk">
                  <div class="diff-hunk-head"><span>${esc(hunk.header)}</span><span>${esc(change.path)}</span></div>
                  <div class="diff-code">
                    ${hunk.lines
                      .map(
                        (line) => `
                      <div class="diff-line${line.type === "+" ? " is-add" : line.type === "-" ? " is-del" : ""}">
                        <span class="ln" aria-hidden="true">${esc(line.old) || ""}</span>
                        <span class="ln" aria-hidden="true">${esc(line.next) || ""}</span>
                        <span class="marker" aria-hidden="true">${line.type === " " ? "" : line.type}</span>
                        <span class="code">${esc(line.text) || "&nbsp;"}</span>
                      </div>`
                      )
                      .join("")}
                  </div>
                </div>`
                  )
                  .join("")
              : `<div class="diff-empty">${icon("file")}<p>Diff hunks are not exposed by the local API. The runtime recorded this file as changed, but line-level content is unavailable.</p></div>`
          }
        </div>
      </section>`;
  };

  R.changes = function changes() {
    const s = state();
    const filters = [
      ["all", "All", NEXUS.changeFiles.length],
      ["M", "Modified", NEXUS.changeFiles.filter((file) => file.status === "M").length],
      ["A", "Added", NEXUS.changeFiles.filter((file) => file.status === "A").length],
      ["D", "Deleted", NEXUS.changeFiles.filter((file) => file.status === "D").length]
    ];
    const visible = NEXUS.changeFiles.filter((file) => s.changesFilter === "all" || file.status === s.changesFilter);
    const selected = NEXUS.changeFiles.find((file) => file.id === s.selectedChange || file.path === s.selectedChange) || visible[0];
    const add = NEXUS.changeFiles.reduce((sum, file) => sum + file.add, 0);
    const del = NEXUS.changeFiles.reduce((sum, file) => sum + file.del, 0);
    const current = thread();

    return `
      <div class="view">
        <div class="changes-page">
          <header class="page-header">
            <div class="page-header-main">
              <span class="eyebrow">Review</span>
              <h1 class="page-title">Changes</h1>
              <p class="page-subtitle">Inspect every hunk before it leaves the workspace. Approval is scoped to this change set.</p>
            </div>
            <div class="page-header-side">
              <button class="btn btn-secondary" type="button" data-action="open-workspace">${icon("code")}Open editor</button>
              <button class="btn btn-primary" type="button" data-action="commit-changes">${icon("branch")}Commit changes</button>
            </div>
          </header>
          <div class="change-summary">
            <span class="change-summary-item">${icon("branch")}${esc(current ? current.branch : "local")}</span>
            <span class="change-summary-item">${icon("files")}${NEXUS.changeFiles.length} files</span>
            <span class="change-summary-item"><span class="add">+${add}</span><span class="del">−${del}</span></span>
            <span class="change-summary-item">${icon("check")}${current ? esc(current.progress) : "No checks recorded"}</span>
          </div>
          <div class="changes-layout">
            <aside class="change-list" aria-label="Changed files">
              <div class="change-list-head">
                <div class="change-filter-row" role="group" aria-label="Filter changes">
                  ${filters
                    .map(
                      ([key, label, count]) =>
                        `<button class="change-filter" type="button" data-change-filter="${key}" aria-pressed="${s.changesFilter === key}">${label} ${count}</button>`
                    )
                    .join("")}
                </div>
              </div>
              <div class="change-list-scroll">
                ${
                  visible.length
                    ? visible
                        .map(
                          (file) => `
                      <button class="change-file-button${selected && selected.id === file.id ? " is-active" : ""}" type="button" data-action="select-change" data-change="${esc(file.id)}">
                        ${diffStatusLetter(file.status)}
                        <span class="change-file-copy"><span class="change-file-name">${esc(file.name)}</span><span class="change-file-dir">${esc(file.dir)}</span></span>
                        <span class="change-file-stats"><span class="add">+${file.add}</span> <span class="del">−${file.del}</span></span>
                      </button>`
                        )
                        .join("")
                    : `<div class="changes-empty">${icon("diff")}<p>No ${esc(s.changesFilter === "all" ? "" : s.changesFilter)} changes in this view.</p></div>`
                }
              </div>
            </aside>
            ${diffPanel(selected)}
          </div>
        </div>
      </div>`;
  };

  /* --------------------------------------------------------------------- */
  /* Usage                                                                 */
  /* --------------------------------------------------------------------- */

  const chartSvg = (usage) => {
    const width = 660;
    const height = 232;
    const left = 12;
    const right = 10;
    const top = 18;
    const bottom = 32;
    const plotW = width - left - right;
    const plotH = height - top - bottom;
    const requests = Array.isArray(usage.requests) && usage.requests.length ? usage.requests : [0];
    const costs = Array.isArray(usage.cost) && usage.cost.length ? usage.cost : [0];
    const labelsData = Array.isArray(usage.labels) && usage.labels.length ? usage.labels : ["No data"];
    const maxRequests = Math.max(1, Math.max.apply(null, requests));
    const maxCost = Math.max(1, Math.max.apply(null, costs));
    const step = plotW / requests.length;
    const barW = Math.max(8, step * 0.48);

    const grid = [0, 0.25, 0.5, 0.75, 1]
      .map((ratio) => {
        const y = top + plotH * ratio;
        const value = Math.round(maxRequests * (1 - ratio));
        return `<line class="chart-grid-line" x1="${left}" y1="${y.toFixed(1)}" x2="${width - right}" y2="${y.toFixed(1)}"></line>
          <text class="chart-axis-label" x="${left + 2}" y="${(y - 3).toFixed(1)}">${value}</text>`;
      })
      .join("");

    const bars = requests
      .map((value, index) => {
        const barH = Math.max(2, (value / maxRequests) * plotH);
        const x = left + index * step + (step - barW) / 2;
        const y = top + plotH - barH;
        return `<rect class="chart-bar${index === requests.length - 1 ? " is-emphasis" : ""}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="1.5"></rect>`;
      })
      .join("");

    const points = costs
      .map((value, index) => {
        const x = left + index * step + step / 2;
        const y = top + plotH - (value / maxCost) * (plotH * 0.82);
        return { x, y };
      });

    const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const dots = points
      .map((point, index) =>
        index === points.length - 1
          ? `<circle class="chart-dot" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.2"></circle>`
          : ""
      )
      .join("");
    const labels = labelsData
      .map((label, index) => {
        const x = left + index * step + step / 2;
        return `<text class="chart-axis-label" x="${x.toFixed(1)}" y="${height - 10}" text-anchor="middle">${esc(label)}</text>`;
      })
      .join("");

    return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Requests and estimated cost over ${esc(state().usageRange)}">
      ${grid}
      ${bars}
      <polyline class="chart-line" points="${line}"></polyline>
      ${dots}
      ${labels}
    </svg>`;
  };

  R.usage = function usageView() {
    const s = state();
    const usage = NEXUS.usage[s.usageRange] || { labels: [], requests: [], input: [], output: [], cost: [], latency: 0 };
    const stats = NEXUS.usageStats || {};
    const modelUsage = (NEXUS.modelUsageByRange && NEXUS.modelUsageByRange[s.usageRange]) || NEXUS.modelUsage || [];
    const agentUsage = (NEXUS.agentUsageByRange && NEXUS.agentUsageByRange[s.usageRange]) || NEXUS.agentUsage || [];
    const requests = H.sum(usage.requests);
    const tokens = H.totalTokens(usage);
    const cost = H.sum(usage.cost);
    const modelMax = Math.max(1, ...modelUsage.map((entry) => entry.requests));

    return `
      <div class="view">
        <div class="view-scroll">
          <div class="usage-page">
            <header class="page-header">
              <div class="page-header-main">
                <span class="eyebrow">Telemetry</span>
                <h1 class="page-title">Usage</h1>
                <p class="page-subtitle">Requests, tokens, and estimated spend across every provider and agent in this workspace.</p>
              </div>
              <div class="page-header-side">
                <div class="segmented" role="group" aria-label="Date range">
                  ${["7d", "30d", "90d"]
                    .map((range) => `<button type="button" data-usage-range="${range}" aria-pressed="${s.usageRange === range}">${range === "7d" ? "7 days" : range === "30d" ? "30 days" : "90 days"}</button>`)
                    .join("")}
                </div>
                <button class="btn btn-secondary" type="button" data-action="export-usage">${icon("download")}Export CSV</button>
              </div>
            </header>

            <section class="usage-metrics" aria-label="Usage totals">
              <div class="usage-metric">
                <div class="usage-metric-label"><span>Requests</span>${icon("bolt")}</div>
                <div class="usage-metric-value">${requests.toLocaleString("en-US")}</div>
                <div class="usage-metric-foot">${usage.labels.length} day${usage.labels.length === 1 ? "" : "s"} · ${stats.successRate == null ? "—" : `${stats.successRate}% success`}</div>
              </div>
              <div class="usage-metric">
                <div class="usage-metric-label"><span>Tokens</span>${icon("cpu")}</div>
                <div class="usage-metric-value">${H.formatTokens(tokens)}<small>total</small></div>
                <div class="usage-metric-foot">Input ${stats.inputPct == null ? "—" : `${stats.inputPct}%`} · output ${stats.outputPct == null ? "—" : `${stats.outputPct}%`}</div>
              </div>
              <div class="usage-metric">
                <div class="usage-metric-label"><span>Estimated cost</span>${icon("chart")}</div>
                <div class="usage-metric-value">${H.formatCost(cost)}<small>USD</small></div>
                <div class="usage-metric-foot">Billed across ${stats.providerCount || 0} provider${stats.providerCount === 1 ? "" : "s"}</div>
              </div>
              <div class="usage-metric">
                <div class="usage-metric-label"><span>Avg latency</span>${icon("clock")}</div>
                <div class="usage-metric-value">${usage.latency || "—"}<small>ms</small></div>
                <div class="usage-metric-foot">p95 ${stats.p95 ? `${stats.p95} ms` : "—"}</div>
              </div>
            </section>

            <div class="usage-chart-grid">
              <section class="panel usage-chart-panel" aria-labelledby="requestChartTitle">
                <div class="usage-chart-head">
                  <div><h2 id="requestChartTitle">Requests &amp; spend</h2><p>Daily volume with estimated cost overlay.</p></div>
                  <div class="chart-legend"><span><i></i>Requests</span><span><i class="secondary"></i>Cost</span></div>
                </div>
                <div class="chart-body">
                  ${
                    s.usageLoading
                      ? `<div class="stack-12"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line is-short"></div><div class="skeleton skeleton-block"></div></div>`
                      : chartSvg(usage)
                  }
                </div>
              </section>

              <section class="panel" aria-labelledby="modelSpendTitle">
                <div class="usage-chart-head"><div><h2 id="modelSpendTitle">Spend by model</h2><p>Share of requests in the selected range.</p></div></div>
                <div class="chart-body">
                  <table class="data-table">
                    <thead><tr><th>Model</th><th>Requests</th><th>Share</th></tr></thead>
                    <tbody>
                      ${modelUsage.length
                        ? modelUsage
                        .map(
                          (entry) => `
                        <tr>
                          <td><span class="model-cell"><span class="model-cell-mark">${esc(entry.mark)}</span>${esc(entry.model)}</span></td>
                          <td class="mono">${entry.requests.toLocaleString("en-US")}</td>
                          <td><span class="share-bar"><span style="width:${Math.round((entry.requests / modelMax) * 100)}%"></span></span> <span class="muted">${entry.share}%</span></td>
                        </tr>`
                        )
                        .join("")
                        : `<tr><td colspan="3" class="muted">No requests were recorded in this range.</td></tr>`}
                    </tbody>
                  </table>
                  <p class="usage-footnote">Costs are estimates based on public per-token pricing. Provider invoices remain authoritative.</p>
                </div>
              </section>
            </div>

            <div class="usage-lower-grid">
              <section class="panel usage-table-wrap" aria-labelledby="sessionsTitle">
                <div class="usage-table-head">
                  <h2 id="sessionsTitle">Recent sessions</h2>
                  <button class="section-link" type="button" data-action="open-command">View all ${icon("chevron-right")}</button>
                </div>
                <table class="data-table">
                  <thead><tr><th>Session</th><th>Task</th><th>Agent</th><th>Model</th><th>Duration</th><th>Tokens</th></tr></thead>
                  <tbody>
                    ${NEXUS.recentSessions
                      .map(
                        (entry) => `
                      <tr>
                        <td class="mono">${esc(entry.session)}</td>
                        <td>${esc(entry.task)}</td>
                        <td>${esc(entry.agent)}</td>
                        <td>${esc(entry.model)}</td>
                        <td class="mono">${esc(entry.duration)}</td>
                        <td class="mono">${esc(entry.tokens)}</td>
                      </tr>`
                      )
                      .join("")}
                  </tbody>
                </table>
              </section>

              <section class="panel" aria-labelledby="agentUsageTitle">
                <div class="usage-table-head"><h2 id="agentUsageTitle">Agent share</h2><span class="muted">${s.usageRange}</span></div>
                <div class="agent-usage-list">
                  ${agentUsage.length
                    ? agentUsage
                    .map(
                      (entry, index) => `
                    <div class="agent-usage-row${index === 0 ? " is-primary" : ""}">
                      <span class="agent-usage-name"><span class="agent-square">${esc(entry.initials)}</span>${esc(entry.name)}</span>
                      <span class="agent-usage-track"><span style="width:${parseInt(entry.share, 10)}%"></span></span>
                      <span class="agent-usage-share">${esc(entry.share)}</span>
                    </div>`
                    )
                    .join("")
                    : `<div class="context-empty">${icon("cpu")}<p>No agent activity in this range.</p></div>`}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>`;
  };

  /* --------------------------------------------------------------------- */
  /* Settings                                                              */
  /* --------------------------------------------------------------------- */

  const settingToggle = (key, label) => {
    const value = Boolean(state().settings[key]);
    return `<button class="toggle" type="button" role="switch" aria-checked="${value}" data-setting="${key}" aria-label="${esc(label)}"></button>`;
  };

  const settingSelect = (key, label, options) => `
    <select class="settings-select" data-setting="${key}" aria-label="${esc(label)}">
      ${options
        .map(([value, text]) => `<option value="${esc(value)}"${String(state().settings[key]) === value ? " selected" : ""}>${esc(text)}</option>`)
        .join("")}
    </select>`;

  const settingsRow = (title, desc, control) => `
    <div class="settings-row">
      <div class="settings-copy"><span class="settings-row-title">${esc(title)}</span><span class="settings-row-desc">${esc(desc)}</span></div>
      <div class="settings-control">${control}</div>
    </div>`;

  const settingsBlock = (title, desc, rows) => `
    <section class="settings-block">
      <div class="settings-block-head"><h2>${esc(title)}</h2>${desc ? `<p>${esc(desc)}</p>` : ""}</div>
      ${rows}
    </section>`;

  const themeChoices = () => `
    <div class="theme-choice-grid" role="group" aria-label="Theme">
      ${[
        ["dark", "Dark", ""],
        ["light", "Light", "is-light"],
        ["system", "System", "is-system"]
      ]
        .map(
          ([value, label, cls]) => `
        <button class="theme-choice" type="button" data-theme-pref="${value}" aria-pressed="${state().themePreference === value}">
          <span class="theme-preview ${cls}"><span class="theme-preview-rail"></span><span class="theme-preview-main"><i></i><i></i><i></i><i></i></span></span>
          <span class="theme-choice-label">${label}</span>
        </button>`
        )
        .join("")}
    </div>`;

  const modelOptions = (selected) =>
    NEXUS.models
      .flatMap((group) =>
        group.items.map((item) => {
          const provider = state().providers[group.providerId];
          const disabled = provider && !provider.connected ? " (not connected)" : "";
          return `<option value="${esc(item.name)}"${selected === item.name ? " selected" : ""}>${esc(item.name)}${disabled}</option>`;
        })
      )
      .join("");

  const maskKey = (key) => {
    const clean = String(key || "").trim();
    if (clean.length < 10) return "sk-••••••••••••••••4f2a";
    return `${clean.slice(0, 7)}${"•".repeat(18)}${clean.slice(-4)}`;
  };

  const providerCard = (provider) => {
    const editing = !provider.connected || provider.editing;
    const defaultBadge = provider.default ? badge("Default", "accent") : "";
    const stateBadge = provider.connected ? badge("Connected", "success") : badge("Not connected", "neutral");

    return `
      <article class="provider-card" aria-labelledby="provider-${esc(provider.id)}">
        <div class="provider-head">
          <div class="provider-identity">
            <span class="provider-mark" aria-hidden="true">${esc(provider.mark)}</span>
            <div class="provider-copy">
              <strong id="provider-${esc(provider.id)}">${esc(provider.name)} ${defaultBadge}</strong>
              <span>${provider.connected ? `Last checked ${esc(provider.lastChecked)}` : "Add an API key to route requests"}</span>
            </div>
          </div>
          <div class="provider-state">
            ${stateBadge}
            ${
              provider.connected && !provider.editing
                ? `<button class="btn btn-ghost btn-sm" type="button" data-provider-action="edit" data-provider="${esc(provider.id)}">Replace key</button>`
                : ""
            }
          </div>
        </div>
        <div class="provider-body">
          ${
            editing
              ? `<div>
                  <label class="provider-key-label" for="provider-key-${esc(provider.id)}">API key</label>
                  <div class="credential-row">
                    <input class="settings-input" style="flex:1;width:auto" id="provider-key-${esc(provider.id)}" type="password" placeholder="${provider.id === "openai" ? "sk-…" : "AIza…"}" autocomplete="off" spellcheck="false" data-provider-key="${esc(provider.id)}">
                  </div>
                  <p class="field-hint" style="margin-top:6px">Keys are stored locally and never included in prompts or logs.</p>
                </div>`
              : `<div>
                  <div class="provider-key-label"><span>API key</span><span class="badge badge-neutral">Encrypted</span></div>
                  <div class="credential-mask">${icon("lock")}${esc(provider.masked)}</div>
                </div>
                <div class="provider-meta-grid">
                  <span>${icon("check")}Verified ${esc(provider.lastChecked)}</span>
                  <span>${icon("shield")}Scoped key</span>
                  <span>${icon("database")}${provider.models.length} models enabled</span>
                </div>
                <div class="provider-models">
                  ${provider.models
                    .map(
                      (model) =>
                        `<span class="provider-model-chip${provider.default && model === state().selectedModel ? " is-default" : ""}">${esc(model)}</span>`
                    )
                    .join("")}
                </div>`
          }
          ${
            provider.error
              ? `<div class="provider-error">${icon("alert-circle")}<span>${esc(provider.error)}</span></div>`
              : ""
          }
          ${
            provider.testing
              ? `<div class="provider-loading">${icon("loader")}Testing connection…</div>`
              : ""
          }
          <div class="provider-footer">
            <div class="provider-footer-actions">
              ${
                editing
                  ? `<button class="btn btn-primary btn-sm" type="button" data-provider-action="connect" data-provider="${esc(provider.id)}" aria-busy="${provider.testing}">${icon(provider.testing ? "loader" : "check")}${provider.connected ? "Save key" : "Connect"}</button>
                     ${provider.connected ? `<button class="btn btn-ghost btn-sm" type="button" data-provider-action="cancel" data-provider="${esc(provider.id)}">Cancel</button>` : ""}`
                  : `<button class="btn btn-secondary btn-sm" type="button" data-provider-action="test" data-provider="${esc(provider.id)}" aria-busy="${provider.testing}">${icon(provider.testing ? "loader" : "refresh")}Test connection</button>
                     <button class="btn btn-ghost btn-sm" type="button" data-provider-action="default" data-provider="${esc(provider.id)}" ${provider.default ? "disabled" : ""}>${icon("check")}${provider.default ? "Default provider" : "Set as default"}</button>
                     <button class="btn btn-ghost btn-sm" type="button" data-provider-action="disconnect" data-provider="${esc(provider.id)}">Disconnect</button>`
              }
            </div>
            <span class="muted">${provider.id === "openai" ? "OpenAI API · platform.openai.com" : "Google AI Studio · aistudio.google.com"}</span>
          </div>
        </div>
      </article>`;
  };

  const renderSettingsContent = (section) => {
    const s = state();

    if (section === "appearance") {
      return `
        <div class="settings-page-head"><h1>Appearance</h1><p>Make the workspace feel right for long sessions. Theme changes apply immediately.</p></div>
        ${themeChoices()}
        ${settingsBlock(
          "Density & motion",
          "Controls spacing across lists, forms, and the editor.",
          settingsRow("Interface density", "Compact reduces vertical space in tables and panels.", settingSelect("density", "Interface density", [["comfortable", "Comfortable"], ["compact", "Compact"]])) +
            settingsRow("Reduce motion", "Minimize transitions and animated status indicators.", settingToggle("reduceMotion", "Reduce motion"))
        )}
        ${settingsBlock(
          "Code display",
          "Applied to the workspace editor.",
          settingsRow("Line wrap", "Wrap long lines instead of scrolling horizontally.", settingToggle("lineWrap", "Line wrap")) +
            settingsRow("Minimap", "Show a compact overview of the active file.", settingToggle("minimap", "Minimap"))
        )}`;
    }

    if (section === "projects") {
      return `
        <div class="settings-page-head"><h1>Projects</h1><p>Manage repositories available to the workspace and how their indexes are maintained.</p></div>
        <div class="settings-block">
          <div class="settings-block-head"><h2>Repositories</h2><p>${NEXUS.projects.length} projects · ${totalIndexed()} indexed files</p></div>
          <div class="list" style="margin-top:8px">
            ${NEXUS.projects
              .map(
                (item) => `
              <div class="list-row">
                <span class="project-icon">${icon("folder")}</span>
                <div class="list-main"><span class="list-title">${esc(item.name)}</span><span class="list-meta">${esc(item.path)} · ${esc(item.branch)}</span></div>
                <span class="badge badge-neutral">${item.files == null ? "not indexed" : `${item.files} files`}</span>
                <button class="btn btn-secondary btn-sm" type="button" data-action="open-project" data-project="${esc(item.id)}">Open</button>
              </div>`
              )
              .join("")}
          </div>
          <div class="settings-save-row"><button class="btn btn-secondary btn-sm" type="button" data-action="new-project">${icon("plus")}Add project</button></div>
        </div>
        ${settingsBlock(
          "Indexing",
          "The coordinator reads from a local repository index.",
          settingsRow("Index on open", "Refresh the file index when a project is opened.", settingToggle("indexOnOpen", "Index on open")) +
            settingsRow("Archive stale projects", "Hide projects with no activity for 90 days.", settingToggle("archiveStale", "Archive stale projects"))
        )}`;
    }

    if (section === "workspace") {
      return `
        <div class="settings-page-head"><h1>Workspace</h1><p>Defaults for the editor, file handling, and agent context.</p></div>
        ${settingsBlock(
          "Editing",
          "Changes apply to the current workspace session.",
          settingsRow("Auto-save", "Persist edits when focus leaves the editor.", settingToggle("autoSave", "Auto-save")) +
            settingsRow("Line wrap", "Wrap long lines in the code editor.", settingToggle("lineWrap", "Line wrap")) +
            settingsRow("Minimap", "Show a compact code overview.", settingToggle("minimap", "Minimap"))
        )}
        ${settingsBlock(
          "Context",
          "The coordinator uses this index to plan and verify changes.",
          settingsRow("Index on open", "Refresh the file index on open.", settingToggle("indexOnOpen", "Index on open")) +
            settingsRow("Default shell", "Used for agent-run commands.", settingSelect("shell", "Default shell", [["/bin/zsh", "zsh"], ["/bin/bash", "bash"], ["/bin/fish", "fish"]]))
        )}
        <div class="settings-note">${icon("info")}<span>The workspace uses a local index. Source files are not uploaded to a provider unless they are needed for the active turn.</span></div>
        <div class="settings-save-row"><button class="btn btn-secondary" type="button" data-action="open-workspace">${icon("code")}Open workspace</button></div>`;
    }

    if (section === "agents") {
      return `
        <div class="settings-page-head"><h1>Agents</h1><p>The coordinator assigns specialist agents. Disable any you do not want in the pipeline.</p></div>
        ${settingsBlock(
          "Execution policy",
          "Controls when agents can act without asking.",
          settingsRow("Approval mode", "Writes and commands follow this policy.", settingSelect("approvalMode", "Approval mode", [["workspace", "Workspace policy"], ["always", "Always ask"], ["auto", "Auto-approve safe writes"]])) +
            settingsRow("Parallel agents", "How many specialists may work at once.", settingSelect("parallelAgents", "Parallel agents", [["auto", "Auto"], ["1", "1 agent"], ["2", "2 agents"], ["4", "4 agents"]]))
        )}
        <div class="settings-block">
          <div class="settings-block-head"><h2>Agent roster</h2><p>Six specialists are available to the coordinator.</p></div>
          <div class="agent-settings-list">
            ${NEXUS.agents
              .map(
                (agent) => `
              <div class="agent-settings-row">
                <span class="agent-settings-mark">${esc(agent.initials)}</span>
                <div class="agent-settings-copy"><strong>${esc(agent.name)}</strong><span>${esc(agent.description)}</span></div>
                <button class="toggle" type="button" role="switch" aria-checked="${Boolean(s.agentsEnabled[agent.key])}" data-agent-toggle="${esc(agent.key)}" aria-label="Enable ${esc(agent.name)}"></button>
              </div>`
              )
              .join("")}
          </div>
        </div>
        <div class="settings-note">${icon("workflow")}<span>The Coordinator and Reviewer are always part of the pipeline. Disabling them hides their suggestions but does not remove their safety checks.</span></div>
        <div class="settings-save-row"><button class="btn btn-primary" type="button" data-action="save-settings">Save agent settings</button></div>`;
    }

    if (section === "models") {
      return `
        <div class="settings-page-head"><h1>Models</h1><p>Choose the default model and decide which model each specialist should use.</p></div>
        ${settingsBlock(
          "Default routing",
          "Used when a thread does not specify a model.",
          settingsRow("Default model", "Applied to new tasks and coordinator turns.", `<select class="settings-select" data-setting="selectedModel" aria-label="Default model">${modelOptions(s.selectedModel)}</select>`)
        )}
        <div class="settings-block">
          <div class="settings-block-head"><h2>Per-agent routing</h2><p>Overrides apply to the next agent turn.</p></div>
          <div class="model-routing-list">
            ${NEXUS.agents
              .map((agent) => {
                const value = (s.modelRouting && s.modelRouting[agent.key]) || s.selectedModel;
                return `<div class="model-routing-row">
                  <div><strong>${esc(agent.name)}</strong><span>${esc(agent.role)}</span></div>
                  <div class="model-routing-controls"><select class="settings-select" style="min-width:180px" data-routing="${esc(agent.key)}" aria-label="${esc(agent.name)} model">${modelOptions(value)}</select></div>
                </div>`;
              })
              .join("")}
          </div>
        </div>
        <div class="settings-note">${icon("info")}<span>Models from disconnected providers are listed for reference. Connect the provider in <button class="link-button" type="button" data-action="open-settings" data-section="providers">API Providers</button> before routing to them.</span></div>`;
    }

    if (section === "providers") {
      return `
        <div class="settings-page-head"><h1>API Providers</h1><p>Connect the providers that NEXUS.AI may use. Credentials stay on this device.</p></div>
        <div class="inline-note" style="margin-bottom:14px">${icon("shield")}<span>Keys are encrypted at rest with the operating system keychain. Requests are routed directly to the provider you choose.</span></div>
        <div class="provider-list">
          ${Object.values(s.providers).map(providerCard).join("")}
        </div>
        <div class="settings-note">${icon("key")}<span>Provider keys are only used for requests made by this workspace. NEXUS.AI never proxies prompts through an intermediate server.</span></div>`;
    }

    if (section === "usage") {
      const usage = NEXUS.usage[s.usageRange];
      const total = H.sum(usage.cost);
      return `
        <div class="settings-page-head"><h1>Usage</h1><p>Review spend and choose how usage data is summarized.</p></div>
        <section class="project-summary-strip" aria-label="Usage summary" style="margin-bottom:20px">
          <div class="project-summary-cell"><span>Current range</span><strong>${esc(s.usageRange)}</strong></div>
          <div class="project-summary-cell"><span>Requests</span><strong>${H.sum(usage.requests).toLocaleString("en-US")}</strong></div>
          <div class="project-summary-cell"><span>Tokens</span><strong>${H.formatTokens(H.totalTokens(usage))}</strong></div>
          <div class="project-summary-cell"><span>Estimated spend</span><strong>${H.formatCost(total)}</strong></div>
        </section>
        ${settingsBlock(
          "Summaries",
          "Usage reporting for this workspace.",
          settingsRow("Daily summary", "Send a local summary after the last session of the day.", settingToggle("dailySummary", "Daily summary")) +
            settingsRow("Telemetry", "Share anonymous performance metrics with the NEXUS.AI team.", settingToggle("telemetry", "Telemetry"))
        )}
        <div class="settings-save-row">
          <button class="btn btn-secondary" type="button" data-action="export-usage">${icon("download")}Export CSV</button>
          <button class="btn btn-primary" type="button" data-action="open-usage">Open usage dashboard</button>
        </div>`;
    }

    if (section === "security") {
      return `
        <div class="settings-page-head"><h1>Security</h1><p>Guardrails for agent writes, commands, and credentials.</p></div>
        ${settingsBlock(
          "Execution safety",
          "Applied before any agent action.",
          settingsRow("Sandbox commands", "Run agent commands in a restricted sandbox.", settingToggle("sandbox", "Sandbox commands")) +
            settingsRow("Redact secrets", "Remove secret-like values from prompts and logs.", settingToggle("redactSecrets", "Redact secrets")) +
            settingsRow("Confirm destructive actions", "Ask before deletes, force-pushes, and resets.", settingToggle("confirmDestructive", "Confirm destructive actions"))
        )}
        ${settingsBlock(
          "Credentials",
          "Stored in the local keychain.",
          settingsRow("Credential storage", "Provider keys never leave this device.", `<span class="badge badge-success">${icon("lock")}Keychain</span>`) +
            settingsRow("Rotate provider keys", "Revoke and replace all saved provider keys.", `<button class="btn btn-secondary btn-sm" type="button" data-action="rotate-keys">${icon("refresh")}Rotate keys</button>`)
        )}
        <div class="settings-note">${icon("shield")}<span>Agent commands are logged with their working directory and exit status. Review them in the terminal.</span></div>`;
    }

    if (section === "terminal") {
      return `
        <div class="settings-page-head"><h1>Terminal</h1><p>Configure the shared shell used by you and the agents.</p></div>
        ${settingsBlock(
          "Shell",
          "Applied to new terminal sessions.",
          settingsRow("Default shell", "The shell used for local commands.", settingSelect("shell", "Default shell", [["/bin/zsh", "zsh"], ["/bin/bash", "bash"], ["/bin/fish", "fish"]])) +
            settingsRow("Scrollback", "Number of lines kept in the session buffer.", settingSelect("scrollback", "Scrollback", [["1000", "1,000 lines"], ["5000", "5,000 lines"], ["10000", "10,000 lines"], ["50000", "50,000 lines"]]))
        )}
        ${settingsBlock(
          "Safety",
          "Commands run with the workspace policy.",
          settingsRow("Sandbox commands", "Run agent commands outside the project environment.", settingToggle("sandbox", "Sandbox commands")) +
            settingsRow("Confirm destructive actions", "Ask before commands that delete or reset data.", settingToggle("confirmDestructive", "Confirm destructive actions"))
        )}
        <div class="settings-save-row"><button class="btn btn-secondary" type="button" data-action="open-terminal">${icon("terminal")}Open terminal</button></div>`;
    }

    if (section === "git") {
      return `
        <div class="settings-page-head"><h1>Git</h1><p>How NEXUS.AI stages, commits, and signs changes.</p></div>
        ${settingsBlock(
          "Commits",
          "Defaults for agent-assisted commits.",
          settingsRow("Auto-stage changes", "Stage files modified by an approved execution.", settingToggle("autoStage", "Auto-stage changes")) +
            settingsRow("Sign commits", "Use the workspace signing key.", settingToggle("signCommits", "Sign commits")) +
            settingsRow("Generate commit messages", "Draft a message from the change set.", settingToggle("commitMessages", "Generate commit messages"))
        )}
        ${settingsBlock(
          "Repository",
          "The active project uses these defaults.",
          settingsRow("Remote", "Push target for new branches.", `<span class="badge badge-neutral">origin / nexux</span>`) +
            settingsRow("Base branch", "Target for pull requests.", `<input class="settings-input" type="text" value="main" data-setting-input="baseBranch" aria-label="Base branch">`)
        )}
        <div class="settings-note">${icon("branch")}<span>Commits created by agents include a NEXUS.AI co-author trailer so they can be filtered in history.</span></div>`;
    }

    if (section === "notifications") {
      return `
        <div class="settings-page-head"><h1>Notifications</h1><p>Choose when NEXUS.AI should get your attention.</p></div>
        ${settingsBlock(
          "Events",
          "In-app notifications always appear in the activity region.",
          settingsRow("Execution complete", "Notify when a thread finishes all checks.", settingToggle("notifyComplete", "Execution complete")) +
            settingsRow("Execution failed", "Notify when verification stops or fails.", settingToggle("notifyFailure", "Execution failed")) +
            settingsRow("Daily summary", "A short local summary of usage and completed work.", settingToggle("dailySummary", "Daily summary"))
        )}
        ${settingsBlock(
          "Delivery",
          "System-level delivery preferences.",
          settingsRow("Native notifications", "Use operating system notifications when the window is not focused.", settingToggle("nativeNotifications", "Native notifications")) +
            settingsRow("Auto update", "Install stable updates in the background.", settingToggle("autoUpdate", "Auto update"))
        )}`;
    }

    if (section === "about") {
      return `
        <div class="settings-page-head"><h1>About</h1><p>A local-first workspace for coordinated software agents.</p></div>
        <dl class="about-grid">
          <dt>Version</dt><dd>${esc(NEXUS.version || "2.1.0")}</dd>
          <dt>Channel</dt><dd>release-stable</dd>
          <dt>Runtime</dt><dd>Electron 34 · Chromium 132</dd>
          <dt>Provider routing</dt><dd>OpenAI · Google Gemini</dd>
          <dt>Workspace</dt><dd>${esc(project().path)}</dd>
          <dt>License</dt><dd>Commercial preview</dd>
        </dl>
        <div class="settings-save-row">
          <button class="btn btn-secondary" type="button" data-action="check-updates">${icon("refresh")}Check for updates</button>
          <button class="btn btn-ghost" type="button" data-action="open-docs">${icon("external")}Documentation</button>
        </div>
        <div class="danger-zone">
          <h2>Reset workspace settings</h2>
          <p>Restore appearance, agent, provider, and editor defaults. Threads and project files are not affected.</p>
          <button class="btn btn-danger btn-sm" type="button" data-action="reset-settings">${icon("undo")}Reset all settings</button>
        </div>`;
    }

    return `
      <div class="settings-page-head"><h1>General</h1><p>Startup, interface, and data defaults for this workspace.</p></div>
      ${settingsBlock(
        "Startup",
        "What happens when NEXUS.AI opens.",
        settingsRow("Restore previous session", "Reopen the last thread and workspace layout.", settingToggle("restoreSession", "Restore previous session")) +
          settingsRow("Check for updates automatically", "Download stable updates in the background.", settingToggle("autoUpdate", "Check for updates automatically")) +
          settingsRow("Index projects on open", "Refresh the local repository index at startup.", settingToggle("indexOnOpen", "Index projects on open"))
      )}
      ${settingsBlock(
        "Interface",
        "Applies across the entire workspace.",
        settingsRow("Interface density", "Choose how much vertical space lists and forms use.", settingSelect("density", "Interface density", [["comfortable", "Comfortable"], ["compact", "Compact"]])) +
          settingsRow("Theme", "Follow this device or choose a fixed theme.", `<button class="btn btn-secondary btn-sm" type="button" data-action="open-settings" data-section="appearance">${icon("sun")}Appearance</button>`)
      )}
      ${settingsBlock(
        "Data",
        "Local workspace behavior.",
        settingsRow("Share anonymous telemetry", "Help improve reliability with aggregate performance data.", settingToggle("telemetry", "Share anonymous telemetry")) +
          settingsRow("Archive stale projects", "Move projects with no activity for 90 days out of the sidebar.", settingToggle("archiveStale", "Archive stale projects"))
      )}
      <div class="settings-note">${icon("info")}<span>Workspace settings are stored locally. Provider credentials are stored separately in the operating system keychain.</span></div>
      <div class="settings-save-row"><button class="btn btn-primary" type="button" data-action="save-settings">Save changes</button></div>`;
  };

  R.settings = function settings() {
    const s = state();
    const groups = [];
    NEXUS.settingsSections.forEach((section) => {
      let group = groups.find((entry) => entry.name === section.group);
      if (!group) {
        group = { name: section.group, items: [] };
        groups.push(group);
      }
      group.items.push(section);
    });

    return `
      <div class="view">
        <div class="settings-view">
          <div class="settings-layout">
            <nav class="settings-nav" aria-label="Settings sections">
              <div class="settings-nav-head">Settings</div>
              ${groups
                .map(
                  (group) => `
                <div class="settings-nav-group">
                  ${group.items
                    .map(
                      (section) => `
                    <button class="settings-nav-button" type="button" data-settings-section="${section.id}" aria-current="${s.settingsSection === section.id ? "page" : "false"}">
                      ${icon(section.icon)}${esc(section.label)}
                    </button>`
                    )
                    .join("")}
                </div>`
                )
                .join("")}
            </nav>
            <div class="settings-content">
              <div class="settings-page">${renderSettingsContent(s.settingsSection)}</div>
            </div>
          </div>
        </div>
      </div>`;
  };

  /* --------------------------------------------------------------------- */
  /* State kitchen sink                                                    */
  /* --------------------------------------------------------------------- */

  R.loading = function loading() {
    return `
      <div class="view">
        <div class="view-scroll">
          <div class="page">
            <header class="page-header">
              <div class="page-header-main"><span class="eyebrow">Preview</span><h1 class="page-title">Loading state</h1><p class="page-subtitle">Skeletons preserve layout while the workspace index and thread history load.</p></div>
              <div class="page-header-side"><span class="loading-label">${icon("loader")}Loading workspace</span></div>
            </header>
            <div class="stack-24">
              <div class="stack-12"><div class="skeleton skeleton-line is-short"></div><div class="skeleton skeleton-line"></div></div>
              <div class="panel panel-pad"><div class="stack-12"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line is-short"></div><div class="skeleton skeleton-block"></div></div></div>
              <div class="stack-12"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line is-short"></div></div>
            </div>
          </div>
        </div>
      </div>`;
  };

  R.empty = function empty() {
    return `
      <div class="view">
        <div class="view-scroll">
          <div class="page">
            <header class="page-header">
              <div class="page-header-main"><span class="eyebrow">Preview</span><h1 class="page-title">Empty state</h1><p class="page-subtitle">A deliberate beginning: no projects or threads, with one clear next action.</p></div>
              <div class="page-header-side"><button class="btn btn-primary" type="button" data-action="new-project">${icon("plus")}Add project</button></div>
            </header>
            <div class="empty-state is-centered">
              <span class="empty-mark">${icon("folder")}</span>
              <h3>Your workspace is empty</h3>
              <p>Add a local repository to index it and start a task. NEXUS.AI will keep the coordinator and specialists ready in the background.</p>
              <button class="btn btn-primary" type="button" data-action="new-project">${icon("plus")}Add your first project</button>
            </div>
          </div>
        </div>
      </div>`;
  };

  R.error = function error() {
    return `
      <div class="view">
        <div class="view-scroll">
          <div class="page">
            <header class="page-header">
              <div class="page-header-main"><span class="eyebrow">Preview</span><h1 class="page-title">Error state</h1><p class="page-subtitle">What a failed connection looks like when the workspace can recover locally.</p></div>
              <div class="page-header-side"><button class="btn btn-secondary" type="button" data-action="open-settings" data-section="providers">${icon("key")}Provider settings</button></div>
            </header>
            <div class="error-panel">
              <div class="error-panel-head">
                ${icon("alert-circle")}
                <div><h3>Provider connection failed</h3><p>The OpenAI key was rejected while starting a coordinator turn. No task state was lost and no write was attempted.</p></div>
              </div>
              <details>
                <summary>Show diagnostic log</summary>
                <pre class="error-log">401 Unauthorized · invalid_api_key
POST https://api.openai.com/v1/responses
request_id: req_91c3b7a0f12d
No retry was attempted.</pre>
              </details>
              <div class="error-actions">
                <button class="btn btn-primary btn-sm" type="button" data-action="open-settings" data-section="providers">${icon("key")}Reconnect provider</button>
                <button class="btn btn-secondary btn-sm" type="button" data-action="open-command">${icon("refresh")}Retry request</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  };

  /* --------------------------------------------------------------------- */
  /* Router                                                                */
  /* --------------------------------------------------------------------- */

  R.view = function view(name) {
    switch (name) {
      case "projects":
        return R.projects();
      case "project":
        return R.project();
      case "chat":
        return R.chat();
      case "workspace":
        return R.workspace();
      case "terminal":
        return R.terminal();
      case "changes":
        return R.changes();
      case "usage":
        return R.usage();
      case "settings":
        return R.settings();
      case "loading":
        return R.loading();
      case "empty":
        return R.empty();
      case "error":
        return R.error();
      default:
        return R.home();
    }
  };

  /* --------------------------------------------------------------------- */
  /* Dialogs                                                               */
  /* --------------------------------------------------------------------- */

  R.modelList = function modelList() {
    const selected = state().selectedModel;
    return NEXUS.models
      .map((group) => {
        const provider = state().providers[group.providerId];
        const connected = provider ? provider.connected : true;
        return `
          <div class="model-group" role="radiogroup" aria-label="${esc(group.provider)}">
            <div class="model-group-title"><span>${esc(group.provider)}</span><span>${connected ? "Connected" : "Not connected"}</span></div>
            ${group.items
              .map(
                (item) => `
              <button class="model-option${!connected ? " is-disabled" : ""}" type="button" role="radio" aria-checked="${selected === item.name}" data-model="${esc(item.name)}" data-model-connected="${connected}">
                <span class="model-option-mark">${esc(group.mark)}</span>
                <span class="model-option-body"><span class="model-option-name">${esc(item.name)}</span><span class="model-option-meta">${esc(item.context)}${item.default ? " · workspace default" : ""}${!connected ? " · connect provider" : ""}</span></span>
                ${selected === item.name ? `<span class="model-check">${icon("check")}</span>` : ""}
              </button>`
              )
              .join("")}
          </div>`;
      })
      .join("");
  };

  R.commandItem = function commandItem(command, index, active) {
    return `
      <button class="command-item${active ? " is-active" : ""}" type="button" role="option" aria-selected="${active}" data-command-index="${index}">
        ${icon(command.icon || "command")}
        <span class="command-item-label">${esc(command.label)}</span>
        <span class="command-item-hint">${esc(command.hint || "")}</span>
        ${command.kbd ? `<kbd>${esc(command.kbd)}</kbd>` : ""}
      </button>`;
  };

  R.usageCsv = function usageCsv() {
    const usage = NEXUS.usage[state().usageRange];
    const rows = [["date", "requests", "input_tokens", "output_tokens", "estimated_cost_usd"]];
    usage.labels.forEach((label, index) => {
      rows.push([label, usage.requests[index], usage.input[index], usage.output[index], usage.cost[index].toFixed(2)]);
    });
    return rows.map((row) => row.join(",")).join("\n");
  };

  R.keyMask = maskKey;
  R.scope = { statusLabel, statusTone, badge };
})();
