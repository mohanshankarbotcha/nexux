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
  DockTabType,
  PlanData,
  ProviderStatusItem,
  ScreenType,
  TerminalEntry,
} from './types/index.js';
import { api } from './services/api.js';
import { Header } from './components/layout/Header.js';
import { StatusBar } from './components/layout/StatusBar.js';
import { WelcomeScreen } from './components/screens/WelcomeScreen.js';
import { WorkspaceScreen } from './components/screens/WorkspaceScreen.js';
import { DashboardScreen } from './components/screens/DashboardScreen.js';
import { ProviderSetupScreen } from './components/screens/ProviderSetupScreen.js';
import { UsageScreen } from './components/screens/UsageScreen.js';
import { SettingsScreen } from './components/screens/SettingsScreen.js';
import { Folder, X } from 'lucide-react';

export const App: React.FC = () => {
  // Navigation & Screens
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('welcome');
  const [isConnected, setIsConnected] = useState<boolean>(true);

  // Workspace
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceInfo | null>(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [modalPathInput, setModalPathInput] = useState('');

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
        // Switch straight to workspace screen
        setCurrentScreen('workspace');

        // Refresh recent workspaces
        const wsRes = await api.getWorkspaces();
        setRecentWorkspaces(wsRes.workspaces);
      } catch (err: any) {
        alert(`Failed to open workspace: ${err.message}`);
      }
    },
    []
  );

  // Initial Bootstrapping
  useEffect(() => {
    // 1. Health check & heartbeat
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

    // 2. Fetch providers, recent workspaces, tasks, usage
    refreshProviders();
    refreshTasks();
    refreshUsage();

    api.getWorkspaces().then((res) => {
      setRecentWorkspaces(res.workspaces);
      if (res.workspaces.length > 0 && !activeWorkspace) {
        setActiveWorkspace(res.workspaces[0]);
      }
    }).catch(() => {});

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

  // Launch Task
  const handleLaunchTask = async (prompt: string) => {
    if (!activeWorkspace) {
      alert('Please open a workspace directory before executing a coding task.');
      return;
    }

    try {
      setStreamingThought('');
      setActiveStatus('thinking');
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

  // Manual terminal execution
  const handleExecuteTerminal = async (command: string) => {
    // Adds interactive terminal command log
    setTerminalEntries((prev) => [
      ...prev,
      {
        id: `term_${Date.now()}`,
        timestamp: Date.now(),
        command,
        output: 'Interactive command sent to shell.',
      },
    ]);
  };

  const activeTask = tasks.find((t) => t.id === activeTaskId) || (tasks.length > 0 ? tasks[0] : null);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#070a12] text-slate-100 overflow-hidden font-sans">
      {/* Top Header */}
      <Header
        currentScreen={currentScreen}
        onScreenChange={setCurrentScreen}
        activeWorkspace={activeWorkspace}
        onOpenWorkspaceModal={() => setIsWorkspaceModalOpen(true)}
        isConnected={isConnected}
        activeTaskId={activeTaskId}
        onCancelActiveTask={handleCancelTask}
      />

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {currentScreen === 'welcome' && (
          <WelcomeScreen
            recentWorkspaces={recentWorkspaces}
            onOpenWorkspace={handleOpenWorkspace}
            onNavigate={setCurrentScreen}
            isProviderConfigured={anyProviderConfigured}
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

        {currentScreen === 'usage' && (
          <UsageScreen
            summary={usageSummary}
            records={usageRecords}
            onRefresh={refreshUsage}
          />
        )}

        {currentScreen === 'settings' && (
          <SettingsScreen
            activeWorkspace={activeWorkspace}
            onUpdateWorkspaceRoot={handleOpenWorkspace}
          />
        )}
      </div>

      {/* Bottom Status Bar */}
      <StatusBar
        workspacePath={activeWorkspace?.path}
        gitBranch="master"
        activeRole={activeRole}
        activeStatus={activeStatus}
        totalTokens={usageSummary?.totalTokens || 0}
        totalCostUsd={usageSummary?.totalEstimatedCostUsd || 0}
      />

      {/* Open Workspace Modal Dialog */}
      {isWorkspaceModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
                <button
                  type="button"
                  onClick={() => handleOpenWorkspace('c:/Users/BMS/Desktop/nexux')}
                  className="text-xs text-sky-400 hover:underline font-mono"
                >
                  Quick open current repo
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsWorkspaceModalOpen(false)}
                    className="px-3 py-1.5 rounded bg-nexus-800 hover:bg-nexus-700 text-slate-300 text-xs font-medium"
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
    </div>
  );
};
