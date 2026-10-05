import {
  AgentRole,
  AgentStatus,
  FileMetadata,
  NexusEvent,
  ProviderCredentials,
  ProviderId,
  Task,
  UsageRecord,
  UsageSummary,
  WorkspaceInfo,
  WorkspaceTreeNode,
} from '@nexus/core';

export type ScreenType = 'chat' | 'terminal' | 'workspace' | 'usage' | 'welcome' | 'dashboard' | 'providers' | 'settings';

export interface OpenTab {
  id: string;
  filePath: string;
  name: string;
  content: string;
  isDirty?: boolean;
  totalLines: number;
}

export type DockTabType = 'terminal' | 'problems' | 'diff' | 'activity' | 'usage';

export interface PlanStepItem {
  id: string;
  description: string;
  targetFiles?: string[];
  verificationCommand?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface PlanData {
  summary: string;
  steps: PlanStepItem[];
  risks?: string[];
}

export interface ProviderStatusItem {
  id: ProviderId;
  name: string;
  isConfigured: boolean;
  maskedKey?: string;
  models: string[];
  defaultModel: string;
}

export interface ProviderValidationState {
  provider: ProviderId;
  isValid: boolean;
  message: string;
  latencyMs?: number;
  testedAt?: number;
}

export interface TerminalEntry {
  id: string;
  timestamp: number;
  command?: string;
  output: string;
  isError?: boolean;
  exitCode?: number | null;
}

export interface NexusDesktopBridge {
  isDesktop: boolean;
  platform: string;
  getSystemInfo: () => Promise<{
    platform: string;
    arch: string;
    version: string;
    serverPort: number;
    dataDir: string;
  }>;
  openDirectoryPicker: () => Promise<string | null>;
  openExternal: (url: string) => Promise<void>;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
}

declare global {
  interface Window {
    nexusDesktop?: NexusDesktopBridge;
  }
}

