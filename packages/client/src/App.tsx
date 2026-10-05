import React, { useState, useEffect, useCallback } from 'react';
import {
  AgentRole,
  AgentStatus,
  NexusEvent,
  Task,
  UsageRecord,
  UsageSummary,
  WorkspaceInfo,
} from '@nexus/core';
import {
  PlanData,
  ProviderStatusItem,
  ScreenType,
  TerminalEntry,
} from './types/index.js';
import { api } from './services/api.js';
import { TopBar } from './components/layout/TopBar.js';
import { Sidebar } from './components/layout/Sidebar.js';
import { StatusBar } from './components/layout/StatusBar.js';
import { ChatScreen } from './components/screens/ChatScreen.js';
import { TerminalScreen } from './components/screens/TerminalScreen.js';
import { WorkspaceScreen } from './components/screens/WorkspaceScreen.js';
import { UsageScreen } from './components/screens/UsageScreen.js';
import { DashboardScreen } from './components/screens/DashboardScreen.js';
import { ProviderSetupScreen } from './components/screens/ProviderSetupScreen.js';
import { SettingsScreen } from './components/screens/SettingsScreen.js';
import { WelcomeScreen } from './components/screens/WelcomeScreen.js';
import { CommandPalette } from './components/common/CommandPalette.js';
import { NewTaskModal } from './components/common/NewTaskModal.js';
import { Folder, X } from 'lucide-react';

export const App: React.FC = () => {
  // Navigation & Screen Modes (Primary: chat, terminal, workspace, usage)
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('chat');
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // Modals
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isProvidersModalOpen, setIsProvidersModalOpen] = useState(false);
  const [modalPathInput, setModalPathInput] = useState('');

  // Workspace
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceInfo | null>(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState<WorkspaceInfo[]>([]);

  // Providers
  const [providers, setProviders] = useState<ProviderStatusItem[]>([]);
  const [anyProviderConfigured, setAnyProviderConfigured] = useState<boolean>(false);

  // Active Task & Agent Execution
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<AgentRole>('coordinator');
  const [activeStatus, setActiveStatus] = useState<AgentStatus>('idle');
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [latestDiff, setLatestDiff] = useState<string>('');
  const [streamingThought, setStreamingThought] = useState<string>('');
  const [liveEvents, setLiveEvents] = useState<NexusEvent[]>([]);
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([]);

  // Usage Telemetry
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>([]);

  // Refresh Providers
  const refreshProviders = useCallback(async () => {
    try {
      const res = await api.getProviderStatus();
      setProviders(res.providers);
      setAnyProviderConfigured(res.anyConfigured);
    } catch (err) {
      console.warn('Could not fetch provider status:', err);
    }
  }, []);

  // Refresh Tasks
  const refreshTasks = useCallback(async () => {
    try {
      const res = await api.getTasks();
      setTasks(res.tasks || []);
    } catch (err) {
      console.warn('Could not fetch tasks:', err);
    }
  }, []);

  // Refresh Usage
  const refreshUsage = useCallback(async () => {
    try {
      const [sumRes, recRes] = await Promise.all([
        api.getUsageSummary(),
        api.getUsageRecords(),
      ]);
      setUsageSummary(sumRes.summary);
      setUsageRecords(recRes.records);
    } catch (err) {
      console.warn('Could not fetch usage telemetry:', err);
    }
  }, []);

  // Open Workspace Action
  const handleOpenWorkspace = useCallback(
    async (pathStr: string) => {
      try {
        const res = await api.openWorkspace(pathStr);
        setActiveWorkspace(res.workspace);
        setIsWorkspaceModalOpen(false);

        // Refresh recent workspaces
        const wsRes = await api.getWorkspaces();
        setRecentWorkspaces(wsRes.workspaces);

        // Restore or load existing session & task state for this workspace
        try {
          const sessionsRes = await api.getSessions(pathStr);
          if (sessionsRes.sessions && sessionsRes.sessions.length > 0) {
            const recent = sessionsRes.sessions[0];
            if (recent.activeTaskId) {
              setActiveTaskId(recent.activeTaskId);
              const taskRes = await api.getTask(recent.activeTaskId, { includeEvents: true });
              if (taskRes.task) {
                if (taskRes.task.plan) {
                  setPlan({
                    summary: taskRes.task.plan.summary,
                    steps: taskRes.task.plan.steps.map((s) => ({
                      id: s.id,
                      description: s.description,
                      targetFiles: s.targetFiles || [],
                      status:
                        s.status === 'in_progress'
                          ? 'running'
                          : s.status === 'skipped'
                          ? 'completed'
                          : s.status,
                    })),
                  });
                }
                if (taskRes.task.events && taskRes.task.events.length > 0) {
                  setLiveEvents(taskRes.task.events);
                }
              }
            }
          }
        } catch (sessionErr) {
          console.warn('Could not restore prior session state:', sessionErr);
        }
      } catch (err: any) {
        alert(`Failed to open workspace: ${err.message}`);
      }
    },
    []
  );

  // Initial Bootstrapping
  useEffect(() => {
    const checkHealth = async () => {
      try {
        await api.getHealth();
        setIsConnected(true);
      } catch {
        setIsConnected(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 6000);

    refreshProviders();
    refreshTasks();
    refreshUsage();

    api
      .getWorkspaces()
      .then((res) => {
        setRecentWorkspaces(res.workspaces);
        if (res.workspaces.length > 0 && !activeWorkspace) {
          setActiveWorkspace(res.workspaces[0]);
        }
      })
      .catch(() => {});

    return () => clearInterval(interval);
  }, [refreshProviders, refreshTasks, refreshUsage]);

  // Subscribe to Global Real-time SSE Events
  useEffect(() => {
    const unsubscribe = api.subscribeEvents(
      undefined,
      (event: NexusEvent) => {
        setLiveEvents((prev) => [...prev.slice(-400), event]);

        switch (event.type) {
          case 'agent_started':
            setActiveRole(event.agentRole);
            setActiveStatus('thinking');
            break;

          case 'agent_message':
            setStreamingThought((prev) => prev + event.content);
            break;

          case 'tool_started':
            setActiveStatus('executing_tool');
            setStreamingThought('');
            break;

          case 'tool_completed':
            setActiveStatus('thinking');
            break;

          case 'command_started':
            setTerminalEntries((prev) => [
              ...prev,
              {
                id: event.id,
                timestamp: event.timestamp,
                command: event.command,
                output: 'Executing verification command in workspace...',
              },
            ]);
            break;

          case 'command_completed':
            setTerminalEntries((prev) => [
              ...prev,
              {
                id: event.id,
                timestamp: event.timestamp,
                command: event.command,
                output: event.outputPreview || `Command exited with code ${event.exitCode}`,
                exitCode: event.exitCode,
                isError: event.exitCode !== 0,
              },
            ]);
            break;

          case 'agent_completed':
            setActiveStatus('idle');
            setStreamingThought('');
            break;

          case 'task_completed':
            setActiveTaskId(null);
            setActiveStatus('idle');
            refreshTasks();
            refreshUsage();
            break;

          case 'task_failed':
            setActiveTaskId(null);
            setActiveStatus('failed');
            refreshTasks();
            break;
        }
      },
      () => {
        setIsConnected(false);
      }
    );

    return () => unsubscribe();
  }, [refreshTasks, refreshUsage]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K / Cmd+K: Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
      // Ctrl+B / Cmd+B: Toggle Sidebar
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarCollapsed((prev) => !prev);
      }
      // Ctrl+` / Cmd+`: Toggle Terminal
      else if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        setCurrentScreen((prev) => (prev === 'terminal' ? 'chat' : 'terminal'));
      }
      // Escape: Close open modals
      else if (e.key === 'Escape') {
        setIsCommandPaletteOpen(false);
        setIsNewTaskModalOpen(false);
        setIsWorkspaceModalOpen(false);
        setIsSettingsModalOpen(false);
        setIsProvidersModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Launch Task
  const handleLaunchTask = async (
    prompt: string,
    options?: { provider?: string; model?: string }
  ) => {
    if (!activeWorkspace) {
      alert('Please open or select a workspace directory before executing a coding task.');
      return;
    }

    try {
      setStreamingThought('');
      setActiveStatus('thinking');
      setCurrentScreen('chat'); // Switch directly to CHAT mode
      const res = await api.createTask(prompt, activeWorkspace.path);
      setActiveTaskId(res.task.id);
      refreshTasks();
    } catch (err: any) {
      setActiveStatus('failed');
      alert(`Could not start task: ${err.message}`);
    }
  };

  // Cancel Task
  const handleCancelTask = async () => {
    if (!activeTaskId) return;
    try {
      await api.cancelTask(activeTaskId);
      setActiveTaskId(null);
      setActiveStatus('idle');
      refreshTasks();
    } catch (err: any) {
      alert(`Could not cancel task: ${err.message}`);
    }
  };

  // Real terminal execution from workspace screen
  const handleExecuteTerminal = async (command: string) => {
    if (!command.trim()) return;
    try {
      const res = await api.executeTerminalCommand(command, activeWorkspace?.path, '.');
      const stdout = res.data?.stdout || '';
      const stderr = res.data?.stderr || '';
      const outputText =
        (stdout && stderr ? `${stdout}\n${stderr}` : stdout || stderr) ||
        (res.success
          ? '(Command completed with no output)'
          : `Execution failed: ${res.error || 'Unknown error'}`);

      setTerminalEntries((prev) => [
        ...prev,
        {
          id: `term_${Date.now()}`,
          timestamp: Date.now(),
          command,
          output: outputText,
          exitCode: res.data?.exitCode ?? (res.success ? 0 : 1),
          isError: !res.success || (res.data?.exitCode !== 0 && res.data?.exitCode !== null),
        },
      ]);
    } catch (err: any) {
      setTerminalEntries((prev) => [
        ...prev,
        {
          id: `term_err_${Date.now()}`,
          timestamp: Date.now(),
          command,
          output: `Command failed: ${err.message}`,
          exitCode: 1,
          isError: true,
        },
      ]);
    }
  };

  const activeTask =
    tasks.find((t) => t.id === activeTaskId) || (tasks.length > 0 ? tasks[0] : null);

  return (
    <div className="h-screen w-screen flex flex-col bg-nexus-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Bar */}
      <TopBar
        currentScreen={currentScreen}
        activeWorkspace={activeWorkspace}
        onOpenWorkspaceModal={() => setIsWorkspaceModalOpen(true)}
        isConnected={isConnected}
        activeTaskId={activeTaskId}
        activeRole={activeRole}
        activeStatus={activeStatus}
        onCancelActiveTask={handleCancelTask}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenProviders={() => setIsProvidersModalOpen(true)}
        providers={providers}
        onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      {/* Main Layout: Left Sidebar + Screen Area */}
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar
          currentScreen={currentScreen}
          onScreenChange={(s) => setCurrentScreen(s)}
          activeWorkspace={activeWorkspace}
          recentWorkspaces={recentWorkspaces}
          onOpenWorkspace={handleOpenWorkspace}
          onOpenWorkspaceModal={() => setIsWorkspaceModalOpen(true)}
          onNewTask={() => setIsNewTaskModalOpen(true)}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onOpenProviders={() => setIsProvidersModalOpen(true)}
          providers={providers}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        />

        {/* Dynamic Screen View */}
        <main className="flex-1 h-full overflow-hidden relative bg-nexus-950">
          {currentScreen === 'chat' && (
            <ChatScreen
              activeWorkspace={activeWorkspace}
              onOpenWorkspaceModal={() => setIsWorkspaceModalOpen(true)}
              activeTask={activeTask}
              tasks={tasks}
              onLaunchTask={handleLaunchTask}
              onCancelTask={handleCancelTask}
              activeRole={activeRole}
              activeStatus={activeStatus}
              plan={plan}
              latestDiff={latestDiff}
              streamingThought={streamingThought}
              liveEvents={liveEvents}
              providers={providers}
              onNewTaskModal={() => setIsNewTaskModalOpen(true)}
              onNavigateToWorkspace={() => setCurrentScreen('workspace')}
              onNavigateToTerminal={() => setCurrentScreen('terminal')}
            />
          )}

          {currentScreen === 'terminal' && (
            <TerminalScreen
              activeWorkspace={activeWorkspace}
              entries={terminalEntries}
              onClear={() => setTerminalEntries([])}
              onAddEntry={(entry) => setTerminalEntries((prev) => [...prev, entry])}
            />
          )}

          {currentScreen === 'workspace' && (
            <WorkspaceScreen
              activeWorkspace={activeWorkspace}
              onOpenWorkspaceModal={() => setIsWorkspaceModalOpen(true)}
              providers={providers}
              liveEvents={liveEvents}
              activeTask={activeTask}
              onLaunchTask={handleLaunchTask}
              onCancelTask={handleCancelTask}
              activeRole={activeRole}
              activeStatus={activeStatus}
              plan={plan}
              latestDiff={latestDiff}
              terminalEntries={terminalEntries}
              onExecuteTerminalCommand={handleExecuteTerminal}
              streamingThought={streamingThought}
              totalTokens={usageSummary?.totalTokens || 0}
              totalCostUsd={usageSummary?.totalEstimatedCostUsd || 0}
            />
          )}

          {currentScreen === 'usage' && (
            <UsageScreen
              summary={usageSummary}
              records={usageRecords}
              onRefresh={refreshUsage}
            />
          )}

          {currentScreen === 'dashboard' && (
            <DashboardScreen
              tasks={tasks}
              usageSummary={usageSummary}
              providers={providers}
              activeWorkspace={activeWorkspace}
              onNavigate={setCurrentScreen}
              onSelectTask={() => setCurrentScreen('workspace')}
            />
          )}

          {currentScreen === 'providers' && (
            <ProviderSetupScreen
              providers={providers}
              onRefresh={refreshProviders}
            />
          )}

          {currentScreen === 'settings' && (
            <SettingsScreen
              activeWorkspace={activeWorkspace}
              onUpdateWorkspaceRoot={handleOpenWorkspace}
            />
          )}

          {currentScreen === 'welcome' && (
            <WelcomeScreen
              recentWorkspaces={recentWorkspaces}
              onOpenWorkspace={handleOpenWorkspace}
              onNavigate={setCurrentScreen}
              isProviderConfigured={anyProviderConfigured}
            />
          )}
        </main>
      </div>

      {/* Bottom Status Bar */}
      <StatusBar
        workspacePath={activeWorkspace?.path}
        gitBranch="main"
        activeRole={activeRole}
        activeStatus={activeStatus}
        totalTokens={usageSummary?.totalTokens || 0}
        totalCostUsd={usageSummary?.totalEstimatedCostUsd || 0}
      />

      {/* Command Palette Modal */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={(screen) => setCurrentScreen(screen)}
        onNewTask={() => setIsNewTaskModalOpen(true)}
        onOpenWorkspaceModal={() => setIsWorkspaceModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenProviders={() => setIsProvidersModalOpen(true)}
        onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      {/* New Task Modal */}
      <NewTaskModal
        isOpen={isNewTaskModalOpen}
        onClose={() => setIsNewTaskModalOpen(false)}
        activeWorkspace={activeWorkspace}
        recentWorkspaces={recentWorkspaces}
        providers={providers}
        onOpenWorkspaceModal={() => setIsWorkspaceModalOpen(true)}
        onLaunchTask={handleLaunchTask}
      />

      {/* Open Workspace Modal Dialog */}
      {isWorkspaceModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-nexus-900 border border-nexus-border rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-slate-100 font-semibold font-mono text-sm">
                <Folder className="w-4 h-4 text-sky-400" />
                <span>Open Project Workspace</span>
              </div>
              <button
                onClick={() => setIsWorkspaceModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (modalPathInput.trim()) {
                  handleOpenWorkspace(modalPathInput.trim());
                }
              }}
              className="space-y-3"
            >
              <label className="text-xs text-slate-300 font-mono">
                Enter local absolute directory path:
              </label>
              <input
                type="text"
                autoFocus
                value={modalPathInput}
                onChange={(e) => setModalPathInput(e.target.value)}
                placeholder="C:\Users\BMS\Desktop\nexux"
                className="w-full bg-nexus-950 border border-nexus-border focus:border-sky-500 text-slate-200 px-3 py-2 rounded text-xs font-mono focus:outline-none"
              />

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleOpenWorkspace('c:/Users/BMS/Desktop/nexux')}
                    className="text-xs text-sky-400 hover:underline font-mono"
                  >
                    Quick open current repo
                  </button>
                  {typeof window !== 'undefined' &&
                    window.nexusDesktop?.openDirectoryPicker && (
                      <button
                        type="button"
                        onClick={async () => {
                          const chosen = await window.nexusDesktop?.openDirectoryPicker();
                          if (chosen) {
                            setModalPathInput(chosen);
                            handleOpenWorkspace(chosen);
                          }
                        }}
                        className="text-xs text-amber-400 hover:underline font-mono"
                      >
                        Browse folder...
                      </button>
                    )}
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsWorkspaceModalOpen(false)}
                    className="px-3 py-1.5 rounded bg-nexus-850 hover:bg-nexus-800 text-slate-300 text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!modalPathInput.trim()}
                    className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-xs font-medium"
                  >
                    Open Directory
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings Modal (Overlay) */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-4xl h-5/6 bg-nexus-900 border border-nexus-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="h-10 px-4 border-b border-nexus-border flex items-center justify-between bg-nexus-950">
              <span className="text-xs font-mono font-semibold text-slate-200">
                Workspace & System Settings
              </span>
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <SettingsScreen
                activeWorkspace={activeWorkspace}
                onUpdateWorkspaceRoot={handleOpenWorkspace}
              />
            </div>
          </div>
        </div>
      )}

      {/* Providers Modal (Overlay) */}
      {isProvidersModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-4xl h-5/6 bg-nexus-900 border border-nexus-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="h-10 px-4 border-b border-nexus-border flex items-center justify-between bg-nexus-950">
              <span className="text-xs font-mono font-semibold text-slate-200">
                AI Provider Configuration & Keys
              </span>
              <button
                onClick={() => setIsProvidersModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <ProviderSetupScreen
                providers={providers}
                onRefresh={refreshProviders}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
