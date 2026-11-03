/* NEXUS.AI — application interactions */
(function () {
  "use strict";

  const NEXUS = window.NEXUS;
  if (!NEXUS) return;

  const S = NEXUS.state;
  const H = NEXUS.helpers;
  const esc = H.escapeHtml;
  const icon = H.icon;

  const DEFAULT_SETTINGS = Object.assign({}, S.settings);
  const DEFAULT_AGENTS = Object.assign({}, S.agentsEnabled);
  const DEFAULT_PROVIDERS = JSON.parse(JSON.stringify(S.providers));

  const els = {};
  const providerKeys = new Map();
  let confirmHandler = null;
  let searchTimer = null;
  let usageTimer = null;

  S.threadMessages = S.threadMessages || {};
  S.pendingThread = S.pendingThread || null;
  S.composerDraft = S.composerDraft || "";
  S.composerError = false;
  S.modelRouting = S.modelRouting || {};
  S.simTimers = S.simTimers || {};
  S.terminalHistoryIndex = -1;

  const viewLabels = {
    home: "Home",
    projects: "Projects",
    project: "Project overview",
    chat: "Chat",
    workspace: "Workspace",
    terminal: "Terminal",
    changes: "Changes",
    usage: "Usage",
    settings: "Settings",
    loading: "Loading",
    empty: "Empty state",
    error: "Error state"
  };

  const isMobile = () => window.matchMedia("(max-width: 900px)").matches;
  const isNarrow = () => window.matchMedia("(max-width: 1420px)").matches;

  function cacheElements() {
    els.shell = document.getElementById("appShell");
    els.sidebar = document.getElementById("projectSidebar");
    els.context = document.getElementById("contextPanel");
    els.view = document.getElementById("viewRoot");
    els.scrim = document.getElementById("scrim");
    els.topbarProject = document.querySelector(".breadcrumb-project");
    els.topbarView = document.getElementById("topbarViewLabel");
    els.commandDialog = document.getElementById("commandDialog");
    els.commandSearch = document.getElementById("commandSearch");
    els.commandResults = document.getElementById("commandResults");
    els.newTaskDialog = document.getElementById("newTaskDialog");
    els.newTaskForm = document.getElementById("newTaskForm");
    els.taskProject = document.getElementById("taskProject");
    els.taskMode = document.getElementById("taskMode");
    els.taskTitle = document.getElementById("taskTitle");
    els.taskTitleError = document.getElementById("taskTitleError");
    els.newTaskFormError = document.getElementById("newTaskFormError");
    els.taskModel = document.getElementById("taskModel");
    els.taskBranch = document.getElementById("taskBranch");
    els.taskFiles = document.getElementById("taskFiles");
    els.modelDialog = document.getElementById("modelDialog");
    els.modelList = document.getElementById("modelList");
    els.confirmDialog = document.getElementById("confirmDialog");
    els.confirmEyebrow = document.getElementById("confirmEyebrow");
    els.confirmTitle = document.getElementById("confirmTitle");
    els.confirmBody = document.getElementById("confirmBody");
    els.confirmDetail = document.getElementById("confirmDetail");
    els.confirmProceed = document.getElementById("confirmProceed");
    els.toastRegion = document.getElementById("toastRegion");
    els.liveRegion = document.getElementById("liveRegion");
  }

  /* --------------------------------------------------------------------- */
  /* Persistence                                                           */
  /* --------------------------------------------------------------------- */

  function hydrate() {
    let savedSettings = null;
    let savedAgents = null;
    let savedProviders = null;
    let savedRouting = null;
    try {
      savedSettings = JSON.parse(window.localStorage.getItem("nexus-settings") || "null");
    } catch (error) {
      savedSettings = null;
    }
    try {
      savedAgents = JSON.parse(window.localStorage.getItem("nexus-agents") || "null");
    } catch (error) {
      savedAgents = null;
    }
    try {
      savedProviders = JSON.parse(window.localStorage.getItem("nexus-providers") || "null");
    } catch (error) {
      savedProviders = null;
    }
    try {
      savedRouting = JSON.parse(window.localStorage.getItem("nexus-routing") || "null");
    } catch (error) {
      savedRouting = null;
    }

    if (savedSettings && typeof savedSettings === "object") {
      Object.keys(DEFAULT_SETTINGS).forEach((key) => {
        if (typeof savedSettings[key] === typeof DEFAULT_SETTINGS[key]) {
          S.settings[key] = savedSettings[key];
        }
      });
    }

    if (savedAgents && typeof savedAgents === "object") {
      Object.keys(DEFAULT_AGENTS).forEach((key) => {
        if (typeof savedAgents[key] === "boolean") S.agentsEnabled[key] = savedAgents[key];
      });
    }

    if (savedProviders && typeof savedProviders === "object") {
      Object.keys(S.providers).forEach((id) => {
        const saved = savedProviders[id];
        if (!saved || typeof saved !== "object") return;
        const provider = S.providers[id];
        provider.connected = Boolean(saved.connected);
        provider.masked = typeof saved.masked === "string" ? saved.masked : "";
        provider.lastChecked = typeof saved.lastChecked === "string" ? saved.lastChecked : "";
        provider.default = Boolean(saved.default);
        provider.editing = false;
        provider.testing = false;
        provider.error = "";
      });
    }

    if (savedRouting && typeof savedRouting === "object") {
      NEXUS.agents.forEach((agent) => {
        if (typeof savedRouting[agent.key] === "string") S.modelRouting[agent.key] = savedRouting[agent.key];
      });
    }

    const modelNames = NEXUS.models.reduce((list, group) => list.concat(group.items.map((item) => item.name)), []);
    const storedModel = NEXUS.storage.safeRead("nexus-model");
    if (storedModel && modelNames.includes(storedModel)) S.selectedModel = storedModel;

    NEXUS.agents.forEach((agent) => {
      if (!S.modelRouting[agent.key]) S.modelRouting[agent.key] = S.selectedModel;
    });
  }

  function persistSettings() {
    NEXUS.storage.safeWrite("nexus-settings", JSON.stringify(S.settings));
    NEXUS.storage.safeWrite("nexus-agents", JSON.stringify(S.agentsEnabled));
    NEXUS.storage.safeWrite("nexus-model", S.selectedModel);
    NEXUS.storage.safeWrite("nexus-routing", JSON.stringify(S.modelRouting));
  }

  function persistProviders() {
    NEXUS.storage.safeWrite("nexus-providers", JSON.stringify(S.providers));
  }

  function announce(message) {
    if (els.liveRegion) els.liveRegion.textContent = message;
  }

  /* --------------------------------------------------------------------- */
  /* Theme and shell                                                       */
  /* --------------------------------------------------------------------- */

  function resolvedTheme() {
    if (S.themePreference === "system") {
      try {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      } catch (error) {
        return "dark";
      }
    }
    return S.themePreference === "light" ? "light" : "dark";
  }

  function applyTheme() {
    const theme = resolvedTheme();
    S.theme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("reduce-motion", Boolean(S.settings.reduceMotion));
  }

  function setThemePreference(preference, notify) {
    S.themePreference = preference;
    NEXUS.storage.safeWrite("nexus-theme", preference);
    applyTheme();
    renderAll({ preserveScroll: true });
    if (notify) toast("Theme updated", `${preference === "system" ? "Following the system theme" : preference[0].toUpperCase() + preference.slice(1) + " theme"} is now active.`);
    announce(`Theme set to ${preference}.`);
  }

  function syncShell() {
    if (!els.shell) return;
    if (isMobile()) {
      els.shell.classList.toggle("sidebar-collapsed", !S.sidebarOpen);
    } else {
      els.shell.classList.toggle("sidebar-collapsed", !S.sidebarOpen);
    }
    els.shell.classList.toggle("context-collapsed", !S.contextOpen);
    if (els.sidebar) els.sidebar.setAttribute("aria-hidden", S.sidebarOpen ? "false" : "true");
    if (els.context) els.context.setAttribute("aria-hidden", S.contextOpen ? "false" : "true");
    const overlay = (isMobile() && S.sidebarOpen) || (isNarrow() && S.contextOpen);
    if (els.scrim) els.scrim.hidden = !overlay;
    document.querySelectorAll('[data-action="toggle-sidebar"]').forEach((button) => {
      button.setAttribute("aria-pressed", String(S.sidebarOpen));
    });
    document.querySelectorAll('[data-action="toggle-context"]').forEach((button) => {
      button.setAttribute("aria-pressed", String(S.contextOpen));
    });
  }

  function toggleSidebar() {
    S.sidebarOpen = !S.sidebarOpen;
    if (S.sidebarOpen && isMobile()) S.contextOpen = false;
    syncShell();
    announce(S.sidebarOpen ? "Project sidebar shown." : "Project sidebar hidden.");
  }

  function toggleContext() {
    S.contextOpen = !S.contextOpen;
    if (S.contextOpen && isMobile()) S.sidebarOpen = false;
    syncShell();
    announce(S.contextOpen ? "Context panel shown." : "Context panel hidden.");
  }

  /* --------------------------------------------------------------------- */
  /* Rendering                                                             */
  /* --------------------------------------------------------------------- */

  function renderSidebar() {
    if (!els.sidebar) return;
    const active = document.activeElement;
    const wasSearch = active && active.id === "projectSearchInput";
    const caret = wasSearch ? active.selectionStart : null;
    els.sidebar.innerHTML = NEXUS.render.sidebar();
    if (wasSearch) {
      const next = document.getElementById("projectSearchInput");
      if (next) {
        next.focus();
        const position = Math.min(caret == null ? next.value.length : caret, next.value.length);
        next.setSelectionRange(position, position);
      }
    }
  }

  function renderMain(preserveScroll) {
    if (!els.view) return;
    const scrollSelectors = [".view-scroll", ".settings-content", ".chat-scroll", ".editor-code-scroll", ".diff-scroll"];
    const saved = [];
    if (preserveScroll) {
      scrollSelectors.forEach((selector) => {
        const element = els.view.querySelector(selector);
        if (element) saved.push([selector, element.scrollTop]);
      });
    }
    els.view.innerHTML = NEXUS.render.view(S.view);
    saved.forEach(([selector, top]) => {
      const element = els.view.querySelector(selector);
      if (element) element.scrollTop = top;
    });
  }

  function updateChrome() {
    const item = H.projectById(S.selectedProject);
    const label = S.view === "chat" && H.threadById(S.selectedThread) ? H.threadById(S.selectedThread).title : viewLabels[S.view] || "Home";
    if (els.topbarProject) els.topbarProject.textContent = item.name;
    if (els.topbarView) els.topbarView.textContent = label;
    document.title = `NEXUS.AI — ${label}`;

    const railMap = { project: "projects" };
    const rail = railMap[S.view] || S.view;
    document.querySelectorAll("[data-rail]").forEach((button) => {
      if (button.dataset.rail === rail) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });

    const themeButton = document.querySelector('[data-action="toggle-theme"]');
    if (themeButton) {
      themeButton.setAttribute("aria-label", resolvedTheme() === "dark" ? "Switch to light theme" : "Switch to dark theme");
      themeButton.setAttribute("data-tooltip", resolvedTheme() === "dark" ? "Light theme" : "Dark theme");
    }
    syncShell();
  }

  function renderAll(options) {
    const settings = options || {};
    applyTheme();
    renderSidebar();
    if (els.context) els.context.innerHTML = NEXUS.render.context();
    renderMain(Boolean(settings.preserveScroll));
    updateChrome();
    if (S.view === "terminal") {
      requestAnimationFrame(scrollTerminalToBottom);
    }
    if (S.view === "chat" && settings.scrollChat !== false) {
      requestAnimationFrame(scrollChatToBottom);
    }
  }

  function navigate(view, options) {
    S.view = view;
    if (options && options.section) S.settingsSection = options.section;
    if (isMobile()) S.sidebarOpen = false;
    if (isNarrow()) S.contextOpen = false;
    renderAll({ preserveScroll: false });
    announce(`${viewLabels[view] || "View"} view.`);
  }

  function openThread(id) {
    const item = H.threadById(id);
    if (!item) return;
    S.selectedThread = item.id;
    S.selectedProject = item.projectId;
    if (!S.expandedProjects.includes(item.projectId)) S.expandedProjects.push(item.projectId);
    navigate("chat");
    if (NEXUS.actions && NEXUS.actions.syncChanges) NEXUS.actions.syncChanges(item);
  }

  function openProject(id) {
    if (NEXUS.live && NEXUS.actions && NEXUS.actions.openProject) {
      NEXUS.actions.openProject(id);
      return;
    }
    const item = H.projectById(id);
    S.selectedProject = item.id;
    if (!S.expandedProjects.includes(item.id)) S.expandedProjects.push(item.id);
    navigate("project");
  }

  function openFile(name, path) {
    if (!name) return;
    if (NEXUS.live && NEXUS.actions && NEXUS.actions.openFile) {
      navigate("workspace");
      NEXUS.actions.openFile(name, path);
      return;
    }
    S.workspaceFile = name;
    if (path) {
      const existing = NEXUS.contextFiles.find((file) => file.path === path);
      if (!existing) {
        NEXUS.contextFiles.unshift({ name, path, changed: true });
      }
    }
    if (!S.openFiles.includes(name)) S.openFiles.push(name);
    navigate("workspace");
  }

  function closeFile(name) {
    const index = S.openFiles.indexOf(name);
    if (index === -1) return;
    S.openFiles.splice(index, 1);
    if (!S.openFiles.length) S.openFiles.push(S.openFiles[0] || "README.md");
    if (S.workspaceFile === name) {
      S.workspaceFile = S.openFiles[Math.max(0, index - 1)] || S.openFiles[0];
    }
    renderMain(true);
  }

  function scrollChatToBottom() {
    const scroller = document.getElementById("chatScroll");
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  function scrollTerminalToBottom() {
    const scroller = document.getElementById("terminalBody");
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  /* --------------------------------------------------------------------- */
  /* Toasts and confirmation                                               */
  /* --------------------------------------------------------------------- */

  function toast(title, message, type) {
    if (!els.toastRegion) return;
    const node = document.createElement("div");
    node.className = `toast${type === "error" ? " is-error" : ""}`;
    node.setAttribute("role", type === "error" ? "alert" : "status");
    node.innerHTML = `${icon(type === "error" ? "alert-circle" : "check")}<span class="toast-body"><span class="toast-title">${esc(title)}</span>${message ? `<span class="toast-message">${esc(message)}</span>` : ""}</span>`;
    els.toastRegion.appendChild(node);
    announce(`${title}${message ? `. ${message}` : ""}`);
    window.setTimeout(() => {
      node.classList.add("is-leaving");
      window.setTimeout(() => node.remove(), 180);
    }, 3600);
  }

  function openConfirm(options) {
    els.confirmEyebrow.textContent = options.eyebrow || "Confirm action";
    els.confirmTitle.textContent = options.title || "Confirm";
    els.confirmBody.textContent = options.body || "";
    if (options.detail) {
      els.confirmDetail.hidden = false;
      els.confirmDetail.textContent = options.detail;
    } else {
      els.confirmDetail.hidden = true;
      els.confirmDetail.textContent = "";
    }
    els.confirmProceed.textContent = options.confirmLabel || "Confirm";
    els.confirmProceed.className = `btn ${options.danger === false ? "btn-primary" : "btn-danger"}`;
    const note = els.confirmDialog.querySelector(".modal-note");
    if (note) note.textContent = options.note || "This action can be stopped before it completes.";
    confirmHandler = typeof options.onConfirm === "function" ? options.onConfirm : null;
    if (!els.confirmDialog.open) els.confirmDialog.showModal();
    els.confirmProceed.focus();
  }

  /* --------------------------------------------------------------------- */
  /* Dialogs                                                               */
  /* --------------------------------------------------------------------- */

  function openNewTask(projectId) {
    const item = H.projectById(projectId || S.selectedProject);
    els.taskProject.innerHTML = NEXUS.projects
      .map((projectOption) => `<option value="${esc(projectOption.id)}"${projectOption.id === item.id ? " selected" : ""}>${esc(projectOption.name)}</option>`)
      .join("");
    els.taskModel.innerHTML = NEXUS.models
      .flatMap((group) => group.items.map((model) => ({ name: model.name })))
      .map((model) => `<option value="${esc(model.name)}"${model.name === S.selectedModel ? " selected" : ""}>${esc(model.name)}</option>`)
      .join("");
    els.taskTitle.value = "";
    els.taskTitle.setAttribute("aria-invalid", "false");
    els.taskTitleError.hidden = true;
    els.newTaskFormError.hidden = true;
    els.newTaskFormError.textContent = "";
    els.taskBranch.textContent = item.branch;
    els.taskFiles.textContent = `${item.files} files indexed`;
    if (!els.newTaskDialog.open) els.newTaskDialog.showModal();
    window.setTimeout(() => els.taskTitle.focus(), 40);
  }

  function updateTaskScope() {
    const item = H.projectById(els.taskProject.value);
    els.taskBranch.textContent = item.branch;
    els.taskFiles.textContent = `${item.files} files indexed`;
  }

  function openModelDialog() {
    els.modelList.innerHTML = NEXUS.render.modelList();
    if (!els.modelDialog.open) els.modelDialog.showModal();
    window.setTimeout(() => {
      const selected = els.modelList.querySelector('[aria-checked="true"]');
      if (selected) selected.focus();
    }, 40);
  }

  function ensureProjectDialog() {
    let dialog = document.getElementById("newProjectDialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "modal new-project-dialog";
    dialog.id = "newProjectDialog";
    dialog.setAttribute("aria-labelledby", "newProjectTitle");
    dialog.innerHTML = `
      <form id="newProjectForm" novalidate>
        <div class="modal-header">
          <div>
            <span class="eyebrow">Workspace</span>
            <h2 id="newProjectTitle">Add a project</h2>
            <p>Index a local repository so the coordinator can inspect and change it.</p>
          </div>
          <button class="icon-button" type="button" data-action="close-new-project" aria-label="Close add project dialog">${icon("x")}</button>
        </div>
        <div class="modal-body">
          <label class="field">
            <span class="field-label">Project name</span>
            <input id="projectName" name="name" type="text" placeholder="e.g. checkout-service" autocomplete="off" required>
            <span class="field-error" id="projectNameError" hidden>Enter a project name.</span>
          </label>
          <label class="field">
            <span class="field-label">Local path</span>
            <input id="projectPath" name="path" type="text" placeholder="~/Developer/checkout-service" autocomplete="off" required>
            <span class="field-hint">NEXUS.AI reads the repository locally. Nothing is uploaded during indexing.</span>
            <span class="field-error" id="projectPathError" hidden>Enter the repository path.</span>
          </label>
          <label class="field">
            <span class="field-label">Base branch</span>
            <input id="projectBranch" name="branch" type="text" value="main" autocomplete="off">
          </label>
          <div class="inline-note">${icon("shield")}<span>The project will use the workspace approval policy for writes and commands.</span></div>
          <div class="form-error" id="newProjectError" hidden role="alert"></div>
        </div>
        <div class="modal-footer">
          <span class="modal-note">The repository is indexed in the background.</span>
          <div class="modal-actions">
            <button class="btn btn-secondary" type="button" data-action="close-new-project">Cancel</button>
            <button class="btn btn-primary" type="submit">Add project</button>
          </div>
        </div>
      </form>`;
    document.body.appendChild(dialog);
    return dialog;
  }

  function openNewProject() {
    const dialog = ensureProjectDialog();
    const form = dialog.querySelector("form");
    form.reset();
    dialog.querySelector("#projectBranch").value = "main";
    dialog.querySelectorAll(".field-error, .form-error").forEach((node) => {
      node.hidden = true;
      node.textContent = "";
    });
    if (!dialog.open) dialog.showModal();
    window.setTimeout(() => dialog.querySelector("#projectName").focus(), 40);
  }

  /* --------------------------------------------------------------------- */
  /* Tasks and agent simulation                                            */
  /* --------------------------------------------------------------------- */

  function newThreadId() {
    return `task-${Date.now().toString(36)}`;
  }

  function computeDuration(startedAt) {
    const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function createThread(prompt, projectId, mode) {
    const item = H.projectById(projectId || S.selectedProject);
    const id = newThreadId();
    const title = prompt.replace(/\s+/g, " ").trim().slice(0, 64) || "Untitled task";
    const thread = {
      id,
      projectId: item.id,
      title: title.length === 64 ? `${title.slice(0, 61)}…` : title,
      status: "running",
      kind: "active",
      updated: "now",
      branch: item.branch,
      prompt,
      detail: mode === "plan" ? "Planning pass started. No writes will occur until the plan is approved." : "Coordinated execution started from the workspace.",
      duration: "00:00",
      progress: "0 of 5 checks passed",
      startedAt: Date.now()
    };
    NEXUS.threads.unshift(thread);
    NEXUS.threadFiles[id] = [];
    NEXUS.threadActivity[id] = {
      statuses: ["working", "waiting", "waiting", "waiting", "waiting", "waiting"],
      tasks: [
        "Scoped the request and selected agents",
        "Waiting for repository context",
        "Waiting for the implementation plan",
        "Waiting for implementation",
        "Waiting for verification",
        "Waiting for review"
      ],
      tool: {
        command: "npm test -- changed",
        state: "Queued",
        output: "Waiting for implementation to complete."
      }
    };
    S.threadMessages[id] = [];
    if (NEXUS.live && NEXUS.actions && NEXUS.actions.submitTask) {
      NEXUS.actions.submitTask(thread, prompt, projectId, mode);
    }
    return thread;
  }

  function clearSimulation(id) {
    (S.simTimers[id] || []).forEach((timer) => window.clearTimeout(timer));
    delete S.simTimers[id];
  }

  function refreshActiveTask(id) {
    if (S.view === "chat" && S.selectedThread === id) {
      renderMain(true);
      scrollChatToBottom();
    } else if (S.view === "home" || S.view === "projects" || S.view === "project") {
      renderMain(true);
    }
  }

  function simulateTask(id) {
    if (NEXUS.live) return;
    const item = H.threadById(id);
    const activity = NEXUS.threadActivity[id];
    if (!item || !activity) return;
    clearSimulation(id);
    item.startedAt = Date.now();

    const steps = [
      {
        delay: 1300,
        apply() {
          activity.statuses = ["done", "working", "waiting", "waiting", "waiting", "waiting"];
          activity.tasks[1] = "Read 18 files across the affected area";
          item.progress = "1 of 5 checks passed";
        }
      },
      {
        delay: 3400,
        apply() {
          activity.statuses = ["done", "done", "working", "waiting", "waiting", "waiting"];
          activity.tasks[2] = "Plan approved with four implementation steps";
          item.progress = "2 of 5 checks passed";
        }
      },
      {
        delay: 5900,
        apply() {
          activity.statuses = ["done", "done", "done", "working", "waiting", "waiting"];
          activity.tasks[3] = "Implementing the approved change";
          item.progress = "3 of 5 checks passed";
        }
      },
      {
        delay: 8600,
        apply() {
          activity.statuses = ["done", "done", "done", "done", "working", "waiting"];
          activity.tasks[4] = "Running focused verification";
          item.progress = "4 of 5 checks passed";
          activity.tool.state = "Running";
          activity.tool.output = "PASS  tests/auth/session.test.ts\nPASS  tests/middleware/require-session.test.ts\nRUNS  tests/auth/refresh.test.ts";
        }
      },
      {
        delay: 11100,
        apply() {
          activity.statuses = ["done", "done", "done", "done", "done", "working"];
          activity.tasks[5] = "Reviewing the diff against project conventions";
          item.progress = "5 of 5 checks passed";
          activity.tool.state = "Passed";
          activity.tool.output = "PASS  tests/auth/refresh.test.ts\nTest Files  3 passed\nTests       18 passed";
        }
      },
      {
        delay: 13600,
        apply() {
          activity.statuses = ["done", "done", "done", "done", "done", "done"];
          item.status = "complete";
          item.kind = "completed";
          item.updated = "now";
          item.duration = computeDuration(item.startedAt);
          item.progress = "5 of 5 checks passed";
          item.detail = `Completed in ${item.duration}. All checks passed.`;
          activity.tool.state = "Passed";
          if (S.settings.notifyComplete) {
            toast("Execution complete", `${item.title} finished with all checks passing.`);
          }
        }
      }
    ];

    S.simTimers[id] = steps.map((step) =>
      window.setTimeout(() => {
        const live = H.threadById(id);
        if (!live) return;
        step.apply();
        live.duration = computeDuration(live.startedAt);
        refreshActiveTask(id);
      }, step.delay)
    );
  }

  function stopTask() {
    const item = H.threadById(S.selectedThread);
    if (!item) return;
    if (NEXUS.live && NEXUS.actions && NEXUS.actions.cancelTask) {
      NEXUS.actions.cancelTask(item);
      return;
    }
    openConfirm({
      eyebrow: "Active run",
      title: "Stop this execution?",
      body: `The coordinator will stop ${item.title} after the current tool call. Files already changed stay in the working tree for review.`,
      detail: "Partial changes remain uncommitted.",
      confirmLabel: "Stop execution",
      danger: true,
      onConfirm() {
        clearSimulation(item.id);
        const activity = NEXUS.threadActivity[item.id];
        if (activity) {
          activity.statuses = activity.statuses.map((status) => (status === "working" ? "waiting" : status));
          if (activity.tool) {
            activity.tool.state = "Stopped";
            activity.tool.output = "Execution stopped by the user. Partial changes were preserved.";
          }
        }
        item.status = "failed";
        item.kind = "failed";
        item.errorTitle = "Execution stopped";
        item.errorBody = "You stopped this execution. No remaining agents were run and partial file changes were left uncommitted for review.";
        item.errorDetail = "ExecutionStopped: user requested stop\nPartial changes preserved in the working tree.";
        item.progress = `${item.progress.split(" of")[0]} of 5 checks passed`;
        item.detail = "Execution stopped by the user.";
        renderAll({ preserveScroll: true, scrollChat: false });
        toast("Execution stopped", "Partial changes are still available in the diff.", "error");
      }
    });
  }

  function retryThread(id) {
    const item = H.threadById(id);
    if (!item) return;
    if (NEXUS.live && NEXUS.actions && NEXUS.actions.retryTask) {
      NEXUS.actions.retryTask(item);
      return;
    }
    const activity = NEXUS.threadActivity[item.id] || NEXUS.threadActivity["auth-refresh"];
    activity.statuses = ["working", "waiting", "waiting", "waiting", "waiting", "waiting"];
    if (activity.tool) {
      activity.tool.state = "Queued";
      activity.tool.output = "Waiting for implementation to complete.";
    }
    item.status = "running";
    item.kind = "active";
    item.progress = "0 of 5 checks passed";
    item.detail = "Retrying the execution from the last approved plan.";
    item.duration = "00:00";
    delete item.errorTitle;
    delete item.errorBody;
    delete item.errorDetail;
    activity.tasks = [
      "Re-scoped the failed execution",
      "Re-reading the affected files",
      "Reusing the approved plan",
      "Retrying the implementation",
      "Re-running verification",
      "Waiting for review"
    ];
    if (NEXUS.threadActivity[item.id]) NEXUS.threadActivity[item.id] = activity;
    openThread(item.id);
    simulateTask(item.id);
    toast("Execution restarted", `${item.title} is running again.`);
  }

  /* --------------------------------------------------------------------- */
  /* Chat                                                                  */
  /* --------------------------------------------------------------------- */

  function timeNow() {
    return new Date().toTimeString().slice(0, 5);
  }

  function agentReply(text, threadId) {
    const item = H.threadById(threadId);
    if (!item) return;
    S.threadMessages[threadId] = S.threadMessages[threadId] || [];
    S.threadMessages[threadId].push({ role: "agent", text, time: timeNow() });
    S.pendingThread = null;
    if (S.view === "chat" && S.selectedThread === threadId) {
      renderMain(true);
      scrollChatToBottom();
    }
  }

  function queueAgentReply(threadId, text, delay) {
    S.pendingThread = threadId;
    window.setTimeout(() => agentReply(text, threadId), delay || 1100);
  }

  function pushUserMessage(text, navigateToChat) {
    const item = H.threadById(S.selectedThread);
    if (!item) {
      toast("No active thread", "Start a task before sending a message.", "error");
      return;
    }
    S.threadMessages[item.id] = S.threadMessages[item.id] || [];
    S.threadMessages[item.id].push({ role: "user", text, time: timeNow() });
    queueAgentReply(item.id, "Understood. I’ll keep the change inside the approved scope and re-run the affected checks before reporting back.", 1000);
    if (navigateToChat) {
      navigate("chat");
    } else {
      renderMain(true);
      scrollChatToBottom();
    }
    announce("Message sent to the coordinator.");
  }

  function sendChatMessage() {
    const textarea = document.getElementById("composerInput");
    if (!textarea) return;
    const text = textarea.value.trim();
    if (!text) {
      S.composerError = true;
      textarea.closest(".chat-composer").classList.add("has-error");
      textarea.setAttribute("aria-invalid", "true");
      textarea.focus();
      announce("Enter a message before sending.");
      return;
    }
    S.composerError = false;
    S.composerDraft = "";

    if (NEXUS.live && NEXUS.actions && NEXUS.actions.sendMessage) {
      textarea.value = "";
      NEXUS.actions.sendMessage(H.threadById(S.selectedThread), text);
      return;
    }

    const item = H.threadById(S.selectedThread);
    if (!item) {
      const thread = createThread(text, S.selectedProject, S.agentMode || "build");
      S.selectedThread = thread.id;
      S.view = "chat";
      renderAll();
      simulateTask(thread.id);
      scrollChatToBottom();
      toast("Thread started", "The coordinator is assembling the execution plan.");
      return;
    }

    S.threadMessages[item.id] = S.threadMessages[item.id] || [];
    S.threadMessages[item.id].push({ role: "user", text, time: timeNow() });
    queueAgentReply(item.id, "I’ve added that to the current thread. I’ll keep the existing change set intact and fold this in before the next verification pass.", 1200);
    renderAll({ preserveScroll: true });
    scrollChatToBottom();
    announce("Message sent to the coordinator.");
  }

  function addAttachments(files) {
    if (!files || !files.length) return;
    Array.from(files).forEach((file) => {
      S.attachments.push(file.name);
    });
    renderAll({ preserveScroll: true });
    scrollChatToBottom();
    toast("Attached", `${files.length} file${files.length === 1 ? "" : "s"} added to the turn.`);
  }

  function mentionAgent() {
    const textarea = document.getElementById("composerInput");
    if (!textarea) return;
    const start = textarea.selectionStart || textarea.value.length;
    const value = `${textarea.value.slice(0, start)}@${textarea.value.slice(start)}`;
    textarea.value = value;
    S.composerDraft = value;
    textarea.focus();
    textarea.setSelectionRange(start + 1, start + 1);
  }

  /* --------------------------------------------------------------------- */
  /* Terminal                                                              */
  /* --------------------------------------------------------------------- */

  function terminalResult(command) {
    const normalized = command.toLowerCase().trim();
    if (normalized === "help") {
      return {
        output: [
          { text: "Available commands:", tone: "info" },
          { text: "  ls · pwd · git status · git branch · whoami · date", tone: "muted" },
          { text: "  npm test · npm run build · pnpm test", tone: "muted" },
          { text: "  @coder <request>  send an instruction to an agent", tone: "muted" },
          { text: "  clear · restart", tone: "muted" }
        ]
      };
    }
    if (normalized === "ls") {
      return {
        output: [
          { text: "src      tests      public      package.json", tone: "muted" },
          { text: "next.config.ts      tsconfig.json      README.md", tone: "muted" }
        ]
      };
    }
    if (normalized === "pwd") return { output: [{ text: "/Users/alex/Developer/nexux", tone: "muted" }] };
    if (normalized === "whoami") return { output: [{ text: "alex", tone: "muted" }] };
    if (normalized === "date") return { output: [{ text: new Date().toString(), tone: "muted" }] };
    if (normalized === "git status" || normalized === "git status --short") {
      return {
        output: [
          { text: " M src/server/auth/session.ts", tone: "warn" },
          { text: " M src/middleware/require-session.ts", tone: "warn" },
          { text: "?? tests/auth/refresh.test.ts", tone: "ok" }
        ]
      };
    }
    if (normalized === "git branch") {
      return { output: [{ text: "* feature/auth-v2", tone: "ok" }, { text: "  main", tone: "muted" }] };
    }
    if (normalized === "npm test" || normalized === "npm test -- auth" || normalized === "pnpm test") {
      return {
        output: [
          { text: "> nexux@2.1.0 test", tone: "muted" },
          { text: "> vitest run --coverage", tone: "muted" },
          { text: "", tone: "muted" },
          { text: " PASS  tests/auth/session.test.ts", tone: "ok" },
          { text: " PASS  tests/middleware/require-session.test.ts", tone: "ok" },
          { text: " PASS  tests/auth/refresh.test.ts", tone: "ok" },
          { text: "", tone: "muted" },
          { text: " Test Files  3 passed (3)", tone: "ok" },
          { text: " Tests       18 passed (18)", tone: "ok" },
          { text: " Duration    2.41s", tone: "muted" }
        ]
      };
    }
    if (normalized === "npm run build" || normalized === "pnpm build") {
      return {
        output: [
          { text: "> nexux@2.1.0 build", tone: "muted" },
          { text: "> next build", tone: "muted" },
          { text: "", tone: "muted" },
          { text: "▲ Next.js 15.2.3", tone: "info" },
          { text: "✓ Compiled successfully in 1.8s", tone: "ok" },
          { text: "✓ Generating static pages (14/14)", tone: "ok" },
          { text: "✓ Build completed · exit code 0 · 2.4s", tone: "ok" }
        ]
      };
    }
    if (normalized === "clear" || normalized === "restart") return { output: [] };
    if (normalized.startsWith("@") || normalized.startsWith("nexus ")) {
      return {
        ai: true,
        output: [
          { text: "Coordinator received the instruction.", tone: "info" },
          { text: "Queued for Coder in the current thread.", tone: "muted" },
          { text: "No files were changed by this command.", tone: "muted" }
        ]
      };
    }
    return {
      output: [{ text: `zsh: command not found: ${command.split(" ")[0]}`, tone: "err" }]
    };
  }

  function runTerminalCommand(raw) {
    const command = String(raw || "").trim();
    if (!command || S.terminalBusy) return;
    if (command === "clear") {
      S.terminalEntries = [];
      renderAll({ preserveScroll: true });
      focusTerminal();
      return;
    }
    if (command === "restart") {
      S.terminalEntries = [];
      renderAll({ preserveScroll: true });
      toast("Session restarted", "A fresh shell is ready.");
      focusTerminal();
      return;
    }

    if (NEXUS.live && NEXUS.actions && NEXUS.actions.runTerminalCommand) {
      NEXUS.actions.runTerminalCommand(command);
      return;
    }

    S.terminalHistory.push(command);
    S.terminalHistoryIndex = S.terminalHistory.length;
    const entry = {
      id: `term-${Date.now()}`,
      ai: command.startsWith("@") || command.startsWith("nexus "),
      command,
      cwd: "~/Developer/nexux",
      state: "running",
      output: []
    };
    S.terminalEntries.push(entry);
    S.terminalBusy = true;
    renderAll({ preserveScroll: true });
    scrollTerminalToBottom();

    window.setTimeout(() => {
      const result = terminalResult(command);
      entry.output = result.output;
      entry.state = "completed";
      S.terminalBusy = false;
      renderAll({ preserveScroll: true });
      scrollTerminalToBottom();
      focusTerminal();
      if (result.output.some((line) => line.tone === "err")) {
        announce("Command failed.");
      }
    }, 850);
  }

  function focusTerminal() {
    if (S.view !== "terminal") return;
    const input = document.getElementById("terminalInput");
    if (input && !S.terminalBusy) input.focus();
  }

  /* --------------------------------------------------------------------- */
  /* Providers                                                             */
  /* --------------------------------------------------------------------- */

  function renderSettings() {
    renderAll({ preserveScroll: true });
  }

  function connectProvider(id) {
    if (NEXUS.live && NEXUS.actions && NEXUS.actions.connectProvider) {
      NEXUS.actions.connectProvider(id);
      return;
    }
    const provider = S.providers[id];
    if (!provider) return;
    const input = document.querySelector(`[data-provider-key="${id}"]`);
    const key = (providerKeys.get(id) || (input ? input.value : "")).trim();
    if (!key) {
      provider.error = "Enter an API key to connect this provider.";
      renderSettings();
      return;
    }
    if (key.length < 12) {
      provider.error = "That key looks too short. Paste the full provider key and try again.";
      provider.editing = true;
      renderSettings();
      return;
    }
    provider.error = "";
    provider.testing = true;
    provider.editing = true;
    renderSettings();
    window.setTimeout(() => {
      const live = S.providers[id];
      live.testing = false;
      live.editing = false;
      if (/invalid|bad[-_]?key/i.test(key)) {
        live.error = "401 Unauthorized · the provider rejected this key. Check that it is active and has API access.";
        live.connected = false;
        renderSettings();
        toast("Connection failed", "The provider rejected the key.", "error");
        return;
      }
      live.connected = true;
      live.masked = NEXUS.render.keyMask(key);
      live.lastChecked = "Just now";
      live.error = "";
      if (!Object.values(S.providers).some((entry) => entry.default)) live.default = true;
      providerKeys.delete(id);
      persistProviders();
      renderSettings();
      toast("Provider connected", `${live.name} is ready to route requests.`);
    }, 950);
  }

  function testProvider(id) {
    if (NEXUS.live && NEXUS.actions && NEXUS.actions.testProvider) {
      NEXUS.actions.testProvider(id);
      return;
    }
    const provider = S.providers[id];
    if (!provider) return;
    provider.testing = true;
    provider.error = "";
    renderSettings();
    window.setTimeout(() => {
      const live = S.providers[id];
      live.testing = false;
      live.lastChecked = "Just now";
      persistProviders();
      renderSettings();
      toast("Connection healthy", `${live.name} responded in 212 ms.`);
    }, 800);
  }

  function disconnectProvider(id) {
    if (NEXUS.live && NEXUS.actions && NEXUS.actions.disconnectProvider) {
      NEXUS.actions.disconnectProvider(id);
      return;
    }
    const provider = S.providers[id];
    if (!provider) return;
    openConfirm({
      eyebrow: "Provider",
      title: `Disconnect ${provider.name}?`,
      body: "New turns will not be routed to this provider. Existing threads keep their recorded model.",
      confirmLabel: "Disconnect",
      danger: true,
      onConfirm() {
        provider.connected = false;
        provider.default = false;
        provider.masked = "";
        provider.lastChecked = "";
        provider.editing = false;
        provider.error = "";
        persistProviders();
        renderSettings();
        toast("Provider disconnected", `${provider.name} was removed from routing.`);
      }
    });
  }

  function setDefaultProvider(id) {
    if (NEXUS.live && NEXUS.actions && NEXUS.actions.setDefaultProvider) {
      NEXUS.actions.setDefaultProvider(id);
      return;
    }
    const provider = S.providers[id];
    if (!provider) return;
    Object.values(S.providers).forEach((entry) => {
      entry.default = entry.id === id;
    });
    if (!provider.models.includes(S.selectedModel)) {
      S.selectedModel = provider.models[0];
      NEXUS.storage.safeWrite("nexus-model", S.selectedModel);
    }
    persistProviders();
    renderSettings();
    toast("Default provider updated", `${provider.name} will handle new coordinator turns.`);
  }

  function rotateKeys() {
    if (NEXUS.live && NEXUS.actions && NEXUS.actions.rotateKeys) {
      NEXUS.actions.rotateKeys();
      return;
    }
    openConfirm({
      eyebrow: "Credentials",
      title: "Rotate all provider keys?",
      body: "Every saved provider credential will be cleared. Connected providers stay configured until the next request, then require a new key.",
      confirmLabel: "Rotate keys",
      danger: true,
      onConfirm() {
        Object.values(S.providers).forEach((provider) => {
          if (provider.connected) provider.lastChecked = "Just now";
        });
        persistProviders();
        renderSettings();
        toast("Keys rotated", "Provider credentials were refreshed.");
      }
    });
  }

  /* --------------------------------------------------------------------- */
  /* Settings actions                                                      */
  /* --------------------------------------------------------------------- */

  function saveSettings() {
    persistSettings();
    persistProviders();
    toast("Settings saved", "Your workspace preferences were stored locally.");
  }

  function resetSettings() {
    openConfirm({
      eyebrow: "Workspace",
      title: "Reset all settings?",
      body: "Appearance, agent, provider, editor, and notification settings return to their defaults. Threads and project files are not affected.",
      confirmLabel: "Reset settings",
      danger: true,
      onConfirm() {
        S.settings = Object.assign({}, DEFAULT_SETTINGS);
        S.agentsEnabled = Object.assign({}, DEFAULT_AGENTS);
        S.providers = JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));
        S.themePreference = "dark";
        S.selectedModel = "GPT-4o";
        NEXUS.agents.forEach((agent) => {
          S.modelRouting[agent.key] = "GPT-4o";
        });
        NEXUS.storage.safeWrite("nexus-theme", "dark");
        persistSettings();
        persistProviders();
        applyTheme();
        renderAll({ preserveScroll: true });
        toast("Settings reset", "Workspace defaults were restored.");
      }
    });
  }

  /* --------------------------------------------------------------------- */
  /* Changes and usage                                                     */
  /* --------------------------------------------------------------------- */

  function commitChanges() {
    if (NEXUS.live && NEXUS.actions && NEXUS.actions.commitChanges) {
      NEXUS.actions.commitChanges();
      return;
    }
    openConfirm({
      eyebrow: "Git",
      title: "Commit 5 files?",
      body: "The change set will be committed to feature/auth-v2 with the generated message “Refactor session refresh boundary”.",
      detail: "+92 insertions · −27 deletions",
      confirmLabel: "Commit changes",
      danger: false,
      onConfirm() {
        toast("Changes committed", "Committed to feature/auth-v2 · 3 files staged.");
        announce("Commit created on feature/auth-v2.");
      }
    });
  }

  function exportUsage() {
    if (NEXUS.live && NEXUS.actions && NEXUS.actions.exportUsage) {
      NEXUS.actions.exportUsage();
      return;
    }
    const csv = NEXUS.render.usageCsv();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nexus-usage-${S.usageRange}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Usage exported", `nexus-usage-${S.usageRange}.csv was downloaded.`);
  }

  function setUsageRange(range) {
    if (NEXUS.live && NEXUS.actions && NEXUS.actions.setUsageRange) {
      NEXUS.actions.setUsageRange(range);
      return;
    }
    S.usageRange = range;
    S.usageLoading = true;
    renderAll({ preserveScroll: true });
    if (usageTimer) window.clearTimeout(usageTimer);
    usageTimer = window.setTimeout(() => {
      S.usageLoading = false;
      if (S.view === "usage") renderAll({ preserveScroll: true });
      announce(`Usage range set to ${range === "7d" ? "7 days" : range === "30d" ? "30 days" : "90 days"}.`);
    }, 520);
  }

  /* --------------------------------------------------------------------- */
  /* Command palette                                                       */
  /* --------------------------------------------------------------------- */

  function paletteCommands() {
    const commands = [
      { group: "Navigate", label: "Go to Home", hint: "Workspace overview", icon: "home", kbd: "G H", run: () => navigate("home") },
      { group: "Navigate", label: "Open Chat", hint: "Current thread", icon: "chat", run: () => navigate("chat") },
      { group: "Navigate", label: "Open Projects", hint: "All repositories", icon: "folder", run: () => navigate("projects") },
      { group: "Navigate", label: "Open Workspace", hint: "Editor and terminal", icon: "code", run: () => navigate("workspace") },
      { group: "Navigate", label: "Open Terminal", hint: "Shared shell", icon: "terminal", run: () => navigate("terminal") },
      { group: "Navigate", label: "Open Changes", hint: "Working tree diff", icon: "diff", run: () => navigate("changes") },
      { group: "Navigate", label: "Open Usage", hint: "Tokens, requests, spend", icon: "chart", run: () => navigate("usage") },
      { group: "Navigate", label: "Open Settings", hint: "Workspace preferences", icon: "settings", run: () => navigate("settings") },
      { group: "Actions", label: "New task", hint: "Start an execution", icon: "plus", kbd: "N", run: () => openNewTask() },
      { group: "Actions", label: "Start a blank chat", hint: "No project scope", icon: "chat", run: () => { S.selectedThread = null; navigate("chat"); } },
      { group: "Actions", label: "Add project", hint: "Index a repository", icon: "folder", run: () => openNewProject() },
      { group: "Actions", label: `Switch to ${resolvedTheme() === "dark" ? "light" : "dark"} theme`, hint: "Appearance", icon: resolvedTheme() === "dark" ? "sun" : "moon", run: () => setThemePreference(resolvedTheme() === "dark" ? "light" : "dark", true) },
      { group: "Actions", label: "Toggle project sidebar", hint: "Layout", icon: "panel-left", run: toggleSidebar },
      { group: "Actions", label: "Toggle context panel", hint: "Layout", icon: "panel-right", run: toggleContext },
      { group: "Actions", label: "Export usage as CSV", hint: "Downloads current range", icon: "download", run: exportUsage },
      { group: "Preview", label: "View empty state", hint: "Onboarding state", icon: "folder", run: () => navigate("empty") },
      { group: "Preview", label: "View error state", hint: "Recoverable failure", icon: "alert-circle", run: () => navigate("error") },
      { group: "Preview", label: "View loading state", hint: "Skeleton layout", icon: "loader", run: () => navigate("loading") }
    ];

    NEXUS.threads.forEach((item) => {
      commands.push({
        group: "Threads",
        label: item.title,
        hint: `${H.projectById(item.projectId).name} · ${item.progress}`,
        icon: "chat",
        run: () => openThread(item.id)
      });
    });

    NEXUS.projects.forEach((item) => {
      commands.push({
        group: "Projects",
        label: item.name,
        hint: `${item.path} · ${item.branch}`,
        icon: "folder",
        run: () => openProject(item.id)
      });
    });

    NEXUS.contextFiles.forEach((file) => {
      commands.push({
        group: "Files",
        label: file.path,
        hint: "Open in workspace",
        icon: "file",
        run: () => openFile(file.name, file.path)
      });
    });

    NEXUS.settingsSections.forEach((section) => {
      commands.push({
        group: "Settings",
        label: `Settings · ${section.label}`,
        hint: section.group,
        icon: section.icon,
        run: () => navigate("settings", { section: section.id })
      });
    });

    return commands;
  }

  function renderPalette() {
    const query = els.commandSearch.value.trim().toLowerCase();
    let items = paletteCommands();
    if (query) {
      items = items.filter((command) => `${command.label} ${command.hint} ${command.group}`.toLowerCase().includes(query));
      items.sort((a, b) => {
        const aStarts = a.label.toLowerCase().startsWith(query) ? 0 : 1;
        const bStarts = b.label.toLowerCase().startsWith(query) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.label.localeCompare(b.label);
      });
    }
    S.paletteResults = items.slice(0, 60);
    if (S.paletteIndex >= S.paletteResults.length) S.paletteIndex = 0;
    let lastGroup = "";
    const html = S.paletteResults
      .map((command, index) => {
        let prefix = "";
        if (command.group !== lastGroup) {
          prefix = `<div class="command-group-label">${esc(command.group)}</div>`;
          lastGroup = command.group;
        }
        return prefix + NEXUS.render.commandItem(command, index, index === S.paletteIndex);
      })
      .join("");
    els.commandResults.innerHTML = html || `<div class="command-empty">No commands match “${esc(els.commandSearch.value.trim())}”.</div>`;
    const active = els.commandResults.querySelector(".command-item.is-active");
    if (active) active.scrollIntoView({ block: "nearest" });
    els.commandSearch.setAttribute("aria-activedescendant", active ? active.id || "" : "");
  }

  function openCommandPalette() {
    if (els.commandDialog.open) {
      els.commandSearch.focus();
      return;
    }
    S.paletteIndex = 0;
    els.commandSearch.value = "";
    renderPalette();
    els.commandDialog.showModal();
    window.setTimeout(() => els.commandSearch.focus(), 40);
  }

  function movePalette(delta) {
    if (!S.paletteResults.length) return;
    S.paletteIndex = (S.paletteIndex + delta + S.paletteResults.length) % S.paletteResults.length;
    els.commandResults.querySelectorAll(".command-item").forEach((item, index) => {
      const active = index === S.paletteIndex;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-selected", String(active));
      if (active) item.scrollIntoView({ block: "nearest" });
    });
  }

  function runPaletteIndex(index) {
    const command = S.paletteResults[index];
    if (!command) return;
    els.commandDialog.close();
    window.setTimeout(() => command.run(), 0);
  }

  /* --------------------------------------------------------------------- */
  /* Clipboard                                                             */
  /* --------------------------------------------------------------------- */

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
    } catch (error) {
      /* The toast still confirms intent for the prototype. */
    }
    area.remove();
  }

  function copySummary(id) {
    const item = H.threadById(id) || H.threadById(S.selectedThread);
    if (!item) return;
    const summary = `${item.title}\n${item.detail}\nBranch: ${item.branch}\nStatus: ${item.status}\nProgress: ${item.progress}\nDuration: ${item.duration}`;
    copyText(summary).then(() => toast("Summary copied", "The thread summary is on your clipboard."));
  }

  /* --------------------------------------------------------------------- */
  /* Event handling                                                        */
  /* --------------------------------------------------------------------- */

  function handleAction(element) {
    const action = element.dataset.action;
    switch (action) {
      case "open-thread":
        openThread(element.dataset.thread);
        break;
      case "open-project":
        openProject(element.dataset.project);
        break;
      case "toggle-project": {
        const id = element.dataset.project;
        const index = S.expandedProjects.indexOf(id);
        if (index === -1) S.expandedProjects.push(id);
        else S.expandedProjects.splice(index, 1);
        renderSidebar();
        break;
      }
      case "new-task":
        openNewTask(element.dataset.project);
        break;
      case "new-chat":
        S.selectedThread = null;
        navigate("chat");
        break;
      case "new-project":
        openNewProject();
        break;
      case "open-changes":
        navigate("changes");
        break;
      case "open-change":
        S.selectedChange = element.dataset.change;
        S.changesFilter = "all";
        navigate("changes");
        break;
      case "open-file":
        openFile(element.dataset.file, element.dataset.path);
        break;
      case "close-file":
        closeFile(element.dataset.file);
        break;
      case "open-workspace":
        if (element.dataset.project) {
          S.selectedProject = element.dataset.project;
          if (!S.expandedProjects.includes(S.selectedProject)) S.expandedProjects.push(S.selectedProject);
        }
        navigate("workspace");
        break;
      case "open-terminal":
        navigate("terminal");
        break;
      case "open-usage":
        navigate("usage");
        break;
      case "open-chat":
        navigate("chat");
        break;
      case "open-settings":
        S.settingsSection = element.dataset.section || S.settingsSection;
        navigate("settings");
        break;
      case "open-agents-settings":
        S.settingsSection = "agents";
        navigate("settings");
        break;
      case "open-git-settings":
        S.settingsSection = "git";
        navigate("settings");
        break;
      case "open-command":
        openCommandPalette();
        break;
      case "open-model":
        openModelDialog();
        break;
      case "toggle-theme":
        setThemePreference(resolvedTheme() === "dark" ? "light" : "dark", false);
        break;
      case "toggle-sidebar":
        toggleSidebar();
        break;
      case "toggle-context":
        toggleContext();
        break;
      case "stop-task":
        stopTask();
        break;
      case "retry-thread":
        retryThread(element.dataset.thread || S.selectedThread);
        break;
      case "copy-summary":
        copySummary(element.dataset.thread);
        break;
      case "create-pr":
        toast("Pull request draft created", "Review the draft before publishing it to origin.");
        break;
      case "commit-changes":
        commitChanges();
        break;
      case "select-change":
        S.selectedChange = element.dataset.change;
        renderMain(true);
        break;
      case "approve-file":
        toast("Change approved", `${element.dataset.file} is approved for commit.`);
        break;
      case "copy-path":
        copyText(element.dataset.path || "").then(() => toast("Path copied", element.dataset.path || ""));
        break;
      case "apply-suggestion":
        pushUserMessage(`Apply suggestion: ${element.dataset.suggestion || "Use the suggested change"}.`, false);
        toast("Suggestion sent", "The Coder will apply it in the current scope.");
        break;
      case "ide-send": {
        const input = document.getElementById("ideAiInput");
        const text = input ? input.value.trim() : "";
        if (!text) {
          toast("Ask a question", "Describe what you want to know about this file.", "error");
          break;
        }
        pushUserMessage(`[${S.workspaceFile}] ${text}`, true);
        toast("Question sent", "The coordinator will answer in the thread.");
        break;
      }
      case "run-task":
        openNewTask();
        break;
      case "new-session":
      case "restart-terminal":
        S.terminalEntries = [];
        S.terminalBusy = false;
        renderAll({ preserveScroll: true });
        toast("Session restarted", "A fresh shell is ready.");
        focusTerminal();
        break;
      case "clear-terminal":
        S.terminalEntries = [];
        renderAll({ preserveScroll: true });
        focusTerminal();
        break;
      case "run-command": {
        const command = element.dataset.command || "";
        S.view = "terminal";
        if (isMobile()) S.sidebarOpen = false;
        if (isNarrow()) S.contextOpen = false;
        renderAll({ preserveScroll: false });
        window.setTimeout(() => runTerminalCommand(command), 30);
        break;
      }
      case "attach-file": {
        const input = document.getElementById("chatFileInput");
        if (input) input.click();
        break;
      }
      case "remove-attachment": {
        const index = Number(element.dataset.index);
        if (Number.isInteger(index)) S.attachments.splice(index, 1);
        renderAll({ preserveScroll: true });
        scrollChatToBottom();
        break;
      }
      case "mention-agent":
        mentionAgent();
        break;
      case "save-settings":
        saveSettings();
        break;
      case "reset-settings":
        resetSettings();
        break;
      case "rotate-keys":
        rotateKeys();
        break;
      case "check-updates":
        toast("Up to date", "NEXUS.AI 2.1.0 is the latest stable build.");
        break;
      case "open-docs":
        toast("Documentation", "Open the NEXUS.AI handbook from the desktop app menu.");
        break;
      case "export-usage":
        exportUsage();
        break;
      case "close-new-task":
        els.newTaskDialog.close();
        break;
      case "close-model":
        els.modelDialog.close();
        break;
      case "close-confirm":
        els.confirmDialog.close();
        break;
      case "close-new-project": {
        const dialog = document.getElementById("newProjectDialog");
        if (dialog) dialog.close();
        break;
      }
      default:
        break;
    }
  }

  function onClick(event) {
    const paletteItem = event.target.closest("[data-command-index]");
    if (paletteItem) {
      event.preventDefault();
      runPaletteIndex(Number(paletteItem.dataset.commandIndex));
      return;
    }

    const actionElement = event.target.closest("[data-action]");
    if (actionElement) {
      event.preventDefault();
      handleAction(actionElement);
      return;
    }

    const viewElement = event.target.closest("[data-view]");
    if (viewElement) {
      event.preventDefault();
      navigate(viewElement.dataset.view);
      return;
    }

    const contextTool = event.target.closest("[data-context-tool]");
    if (contextTool) {
      S.contextTool = contextTool.dataset.contextTool;
      if (els.context) els.context.innerHTML = NEXUS.render.context();
      return;
    }

    const settingsLink = event.target.closest("[data-settings-section]");
    if (settingsLink) {
      S.settingsSection = settingsLink.dataset.settingsSection;
      renderMain(false);
      return;
    }

    const themeChoice = event.target.closest("[data-theme-pref]");
    if (themeChoice) {
      setThemePreference(themeChoice.dataset.themePref, true);
      return;
    }

    const modelChoice = event.target.closest("[data-model]");
    if (modelChoice) {
      const name = modelChoice.dataset.model;
      if (modelChoice.dataset.modelConnected === "false") {
        toast("Provider not connected", `Connect a provider to use ${name}.`, "error");
        return;
      }
      S.selectedModel = name;
      NEXUS.storage.safeWrite("nexus-model", name);
      NEXUS.agents.forEach((agent) => {
        if (!S.modelRouting[agent.key]) S.modelRouting[agent.key] = name;
      });
      els.modelDialog.close();
      renderAll({ preserveScroll: true });
      toast("Model selected", `${name} will be used for the next agent turn.`);
      return;
    }

    const providerAction = event.target.closest("[data-provider-action]");
    if (providerAction) {
      const id = providerAction.dataset.provider;
      const provider = S.providers[id];
      if (!provider) return;
      switch (providerAction.dataset.providerAction) {
        case "connect":
          connectProvider(id);
          break;
        case "edit":
          provider.editing = true;
          provider.error = "";
          renderSettings();
          window.setTimeout(() => {
            const input = document.querySelector(`[data-provider-key="${id}"]`);
            if (input) input.focus();
          }, 30);
          break;
        case "cancel":
          provider.editing = false;
          provider.error = "";
          renderSettings();
          break;
        case "test":
          testProvider(id);
          break;
        case "default":
          setDefaultProvider(id);
          break;
        case "disconnect":
          disconnectProvider(id);
          break;
        default:
          break;
      }
      return;
    }

    const agentToggle = event.target.closest("[data-agent-toggle]");
    if (agentToggle) {
      const key = agentToggle.dataset.agentToggle;
      S.agentsEnabled[key] = !S.agentsEnabled[key];
      agentToggle.setAttribute("aria-checked", String(S.agentsEnabled[key]));
      persistSettings();
      announce(`${key} agent ${S.agentsEnabled[key] ? "enabled" : "disabled"}.`);
      return;
    }

    const toggle = event.target.closest(".toggle[data-setting]");
    if (toggle) {
      const key = toggle.dataset.setting;
      S.settings[key] = !S.settings[key];
      toggle.setAttribute("aria-checked", String(S.settings[key]));
      persistSettings();
      if (key === "reduceMotion") applyTheme();
      announce(`${key} ${S.settings[key] ? "enabled" : "disabled"}.`);
      return;
    }

    const projectFilter = event.target.closest("[data-project-filter]");
    if (projectFilter) {
      S.projectFilter = projectFilter.dataset.projectFilter;
      renderMain(false);
      return;
    }

    const changeFilter = event.target.closest("[data-change-filter]");
    if (changeFilter) {
      S.changesFilter = changeFilter.dataset.changeFilter;
      const visible = NEXUS.changeFiles.filter((file) => S.changesFilter === "all" || file.status === S.changesFilter);
      if (visible.length && !visible.some((file) => file.id === S.selectedChange)) S.selectedChange = visible[0].id;
      renderMain(true);
      return;
    }

    const usageRange = event.target.closest("[data-usage-range]");
    if (usageRange) {
      setUsageRange(usageRange.dataset.usageRange);
      return;
    }

    const ideBottom = event.target.closest("[data-ide-bottom]");
    if (ideBottom) {
      S.ideBottom = ideBottom.dataset.ideBottom;
      renderMain(true);
      return;
    }

    const suggestion = event.target.closest("[data-suggestion]");
    if (suggestion) {
      const text = suggestion.dataset.suggestion;
      S.composerDraft = text;
      const input = document.getElementById("composerInput");
      if (input) {
        input.value = text;
        input.focus();
        input.setSelectionRange(text.length, text.length);
      }
      announce("Suggestion inserted into the composer.");
    }
  }

  function onInput(event) {
    const target = event.target;
    if (target.id === "composerInput") {
      S.composerDraft = target.value;
      if (S.composerError) {
        S.composerError = false;
        target.setAttribute("aria-invalid", "false");
        const composer = target.closest(".chat-composer");
        if (composer) composer.classList.remove("has-error");
      }
      target.style.height = "auto";
      target.style.height = `${Math.min(target.scrollHeight, 148)}px`;
      return;
    }
    if (target.id === "projectSearchInput") {
      S.projectSearch = target.value;
      if (searchTimer) window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(renderSidebar, 90);
      return;
    }
    if (target.matches("[data-provider-key]")) {
      providerKeys.set(target.dataset.providerKey, target.value);
      return;
    }
    if (target.id === "commandSearch") {
      S.paletteIndex = 0;
      renderPalette();
    }
  }

  function onChange(event) {
    const target = event.target;
    if (target.id === "taskProject") {
      updateTaskScope();
      return;
    }
    if (target.id === "chatFileInput") {
      addAttachments(target.files);
      target.value = "";
      return;
    }
    if (target.matches("[data-setting]") && target.tagName === "SELECT") {
      S.settings[target.dataset.setting] = target.value;
      persistSettings();
      if (target.dataset.setting === "density") announce(`Density set to ${target.value}.`);
      return;
    }
    if (target.matches("[data-setting-input]")) {
      S.settings[target.dataset.settingInput] = target.value;
      persistSettings();
      return;
    }
    if (target.matches("[data-routing]")) {
      S.modelRouting[target.dataset.routing] = target.value;
      persistSettings();
      toast("Routing updated", `${target.value} will be used for this agent.`);
      return;
    }
    if (target.matches("[data-composer-model]")) {
      const name = target.value;
      const group = NEXUS.models.find((entry) => entry.items.some((item) => item.name === name));
      const provider = group ? S.providers[group.providerId] : null;
      if (provider && !provider.connected) {
        toast("Provider not connected", `Connect ${group.provider} to use ${name}.`, "error");
        target.value = S.selectedModel;
        return;
      }
      S.selectedModel = name;
      NEXUS.storage.safeWrite("nexus-model", name);
      const note = target.closest(".chat-composer-wrap")?.querySelector(".composer-bottom-note");
      if (note) note.textContent = `Enter to send · Shift+Enter for a new line · ${name}`;
      announce(`Model set to ${name}.`);
      return;
    }
    if (target.matches("[data-composer-mode]")) {
      S.agentMode = target.value;
      return;
    }
    if (target.matches("[data-provider-key]")) {
      providerKeys.set(target.dataset.providerKey, target.value);
    }
  }

  function onSubmit(event) {
    const form = event.target;
    if (form.id === "chatForm") {
      event.preventDefault();
      sendChatMessage();
      return;
    }
    if (form.id === "terminalForm") {
      event.preventDefault();
      const input = document.getElementById("terminalInput");
      if (!input) return;
      const command = input.value;
      input.value = "";
      runTerminalCommand(command);
      return;
    }
    if (form.id === "newTaskForm") {
      event.preventDefault();
      const title = els.taskTitle.value.trim();
      if (title.length < 4) {
        els.taskTitle.setAttribute("aria-invalid", "true");
        els.taskTitleError.hidden = false;
        els.taskTitle.focus();
        announce("Describe the task before starting.");
        return;
      }
      els.taskTitleError.hidden = true;
      els.taskTitle.setAttribute("aria-invalid", "false");
      const projectId = els.taskProject.value;
      const mode = els.taskMode.value;
      const item = H.projectById(projectId);
      S.selectedModel = els.taskModel.value;
      NEXUS.storage.safeWrite("nexus-model", S.selectedModel);
      els.newTaskDialog.close();
      const thread = createThread(title, projectId, mode);
      S.selectedThread = thread.id;
      S.selectedProject = item.id;
      S.view = "chat";
      if (!S.expandedProjects.includes(item.id)) S.expandedProjects.push(item.id);
      renderAll();
      simulateTask(thread.id);
      scrollChatToBottom();
      toast("Task started", `${item.name} · coordinator is assembling the agents.`);
      announce(`Task started in ${item.name}.`);
      return;
    }
    if (form.id === "newProjectForm") {
      event.preventDefault();
      const dialog = form.closest("dialog");
      const nameInput = form.querySelector("#projectName");
      const pathInput = form.querySelector("#projectPath");
      const branchInput = form.querySelector("#projectBranch");
      const name = nameInput.value.trim();
      const path = pathInput.value.trim();
      const branch = (branchInput.value.trim() || "main").replace(/\s+/g, "-");
      let valid = true;
      form.querySelectorAll(".field-error").forEach((node) => {
        node.hidden = true;
      });
      if (!name) {
        form.querySelector("#projectNameError").hidden = false;
        nameInput.setAttribute("aria-invalid", "true");
        valid = false;
      }
      if (!path) {
        form.querySelector("#projectPathError").hidden = false;
        pathInput.setAttribute("aria-invalid", "true");
        valid = false;
      }
      if (!valid) {
        (name ? pathInput : nameInput).focus();
        return;
      }
      if (NEXUS.live && NEXUS.actions && NEXUS.actions.createProject) {
        if (dialog) dialog.close();
        form.reset();
        NEXUS.actions
          .createProject(name, path, branch)
          .then((project) => {
            S.selectedProject = project.id;
            if (!S.expandedProjects.includes(project.id)) S.expandedProjects.push(project.id);
            navigate("project");
          })
          .catch((error) => toast("Project not added", error.message, "error"));
        return;
      }
      let id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `project-${Date.now()}`;
      if (NEXUS.projects.some((item) => item.id === id)) id = `${id}-${NEXUS.projects.length + 1}`;
      const project = {
        id,
        name,
        path,
        branch,
        status: "Active",
        tasks: 0,
        files: 0,
        last: "Just now",
        description: "A newly added local repository, ready for indexing.",
        languages: ["TypeScript 100%"],
        remote: `origin / ${name}`,
        baseBranch: branch
      };
      NEXUS.projects.push(project);
      S.selectedProject = id;
      S.expandedProjects.push(id);
      if (dialog) dialog.close();
      form.reset();
      navigate("project");
      toast("Project added", `${name} is being indexed in the background.`);
      announce(`${name} added to the workspace.`);
    }
  }

  function onKeyDown(event) {
    const target = event.target;
    const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
    const modifier = event.ctrlKey || event.metaKey;

    if (modifier && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openCommandPalette();
      return;
    }
    if (modifier && event.shiftKey && event.key.toLowerCase() === "n") {
      event.preventDefault();
      openNewTask();
      return;
    }
    if (modifier && event.key === "`") {
      event.preventDefault();
      navigate("terminal");
      return;
    }
    if (!typing && event.key === "/" && !modifier) {
      event.preventDefault();
      openCommandPalette();
      return;
    }

    if (target.id === "composerInput" && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (target.form) target.form.requestSubmit();
      return;
    }

    if (target.id === "commandSearch") {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        movePalette(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        movePalette(-1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        runPaletteIndex(S.paletteIndex);
      }
      return;
    }

    if (target.id === "terminalInput") {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (S.terminalHistory.length) {
          S.terminalHistoryIndex = Math.max(0, S.terminalHistoryIndex - 1);
          target.value = S.terminalHistory[S.terminalHistoryIndex] || "";
        }
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        if (S.terminalHistory.length) {
          S.terminalHistoryIndex = Math.min(S.terminalHistory.length, S.terminalHistoryIndex + 1);
          target.value = S.terminalHistory[S.terminalHistoryIndex] || "";
        }
      }
      return;
    }

    if (target.classList && target.classList.contains("editor-tab") && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      target.click();
    }
  }

  function bindEvents() {
    document.addEventListener("click", onClick);
    document.addEventListener("input", onInput);
    document.addEventListener("change", onChange);
    document.addEventListener("submit", onSubmit);
    document.addEventListener("keydown", onKeyDown);

    if (els.scrim) {
      els.scrim.addEventListener("click", () => {
        if (isMobile()) S.sidebarOpen = false;
        if (isNarrow()) S.contextOpen = false;
        syncShell();
      });
    }

    if (els.confirmProceed) {
      els.confirmProceed.addEventListener("click", () => {
        const handler = confirmHandler;
        confirmHandler = null;
        els.confirmDialog.close();
        if (handler) handler();
      });
    }
    if (els.confirmDialog) {
      els.confirmDialog.addEventListener("close", () => {
        confirmHandler = null;
      });
    }

    document.querySelectorAll("dialog").forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
        if (outside) dialog.close();
      });
    });

    window.addEventListener("resize", syncShell);

    try {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      if (media.addEventListener) {
        media.addEventListener("change", () => {
          if (S.themePreference === "system") {
            applyTheme();
            renderAll({ preserveScroll: true });
          }
        });
      }
    } catch (error) {
      /* System theme tracking is optional. */
    }
  }

  /* --------------------------------------------------------------------- */
  /* Init                                                                  */
  /* --------------------------------------------------------------------- */

  async function init() {
    cacheElements();
    hydrate();
    if (typeof NEXUS.bootstrap === "function") {
      await NEXUS.bootstrap();
    }
    S.terminalEntries = NEXUS.live ? [] : JSON.parse(JSON.stringify(NEXUS.initialTerminalEntries));
    S.terminalHistory = [];
    S.terminalHistoryIndex = 0;
    S.sidebarOpen = window.innerWidth > 900;
    S.contextOpen = window.innerWidth > 1420;
    S.projectSearch = S.projectSearch || "";
    S.changesFilter = S.changesFilter || "all";
    S.selectedChange = S.selectedChange || (NEXUS.changeFiles[0] && NEXUS.changeFiles[0].id) || null;
    S.usageRange = S.usageRange || "30d";
    S.usageLoading = false;
    S.terminalBusy = false;
    S.composerDraft = "";
    S.composerError = false;
    S.attachments = [];
    S.pendingThread = null;
    S.agentMode = S.agentMode || "build";
    if (NEXUS.live) {
      if (!NEXUS.projects.some((project) => project.id === S.selectedProject)) {
        S.selectedProject = NEXUS.projects[0] ? NEXUS.projects[0].id : null;
      }
      if (!NEXUS.threads.some((thread) => thread.id === S.selectedThread)) {
        const running = NEXUS.threads.filter((thread) => thread.status === "running")[0];
        const completed = NEXUS.threads.filter((thread) => thread.status === "complete");
        S.selectedThread = (running || completed.find((thread) => (thread.changedFiles || []).length) || completed[0] || NEXUS.threads[0] || {}).id || null;
      }
      if (!S.expandedProjects.length && S.selectedProject) S.expandedProjects = [S.selectedProject];
    } else {
      S.view = "error";
      S.errorMessage = (NEXUS.runtime && NEXUS.runtime.bootError && NEXUS.runtime.bootError.message) || "The NEXUS runtime is unavailable.";
    }
    ensureProjectDialog();
    bindEvents();
    applyTheme();
    renderAll();
  }

  NEXUS.ui = {
    renderAll,
    renderMain,
    renderSidebar,
    navigate,
    openThread,
    openProject,
    toast,
    announce,
    openConfirm,
    createThread,
    applyTheme,
    syncShell,
    focusTerminal,
    scrollChatToBottom,
    scrollTerminalToBottom,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
