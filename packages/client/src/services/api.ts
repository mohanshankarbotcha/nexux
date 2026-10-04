import {
  NexusEvent,
  ProviderId,
  Session,
  Task,
  UsageRecord,
  UsageSummary,
  WorkspaceInfo,
  WorkspaceTreeNode,
} from '@nexus/core';
import { ProviderStatusItem, ProviderValidationState } from '../types/index.js';

const API_BASE = '/api';

class ApiService {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });
    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.error?.message || data?.error || `HTTP error ${response.status}`;
      throw new Error(errorMsg);
    }

    return data as T;
  }

  // Health
  async getHealth(): Promise<{ status: string; timestamp: number; app: string }> {
    return this.request('/health');
  }

  // Providers
  async getProviderStatus(): Promise<{ providers: ProviderStatusItem[]; anyConfigured: boolean }> {
    return this.request('/providers/status');
  }

  async saveProviderCredentials(
    provider: ProviderId,
    apiKey: string,
    defaultModel?: string
  ): Promise<{ success: boolean; message: string }> {
    return this.request('/providers/credentials', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey, defaultModel }),
    });
  }

  async validateCredentials(
    provider: ProviderId,
    apiKey: string
  ): Promise<ProviderValidationState> {
    const res = await this.request<{ success: boolean; validation: ProviderValidationState }>(
      '/providers/validate',
      {
        method: 'POST',
        body: JSON.stringify({ provider, apiKey }),
      }
    );
    return res.validation;
  }

  // Workspaces
  async getWorkspaces(): Promise<{ workspaces: WorkspaceInfo[] }> {
    return this.request('/workspaces');
  }

  async openWorkspace(targetPath: string): Promise<{ workspace: WorkspaceInfo }> {
    return this.request('/workspaces/open', {
      method: 'POST',
      body: JSON.stringify({ targetPath }),
    });
  }

  async getFileTree(workspacePath: string, depth = 6): Promise<{ tree: WorkspaceTreeNode }> {
    const query = new URLSearchParams({ workspace: workspacePath, depth: depth.toString() });
    return this.request(`/workspaces/tree?${query.toString()}`);
  }

  async readFile(
    workspacePath: string,
    file: string,
    startLine?: number,
    endLine?: number
  ): Promise<{ filePath: string; content: string; totalLines: number; startLine: number; endLine: number }> {
    const query = new URLSearchParams({ workspace: workspacePath, file });
    if (startLine) query.set('startLine', startLine.toString());
    if (endLine) query.set('endLine', endLine.toString());
    return this.request(`/workspaces/file?${query.toString()}`);
  }

  async getFileMetadata(workspacePath: string, file: string): Promise<{ metadata: any }> {
    const query = new URLSearchParams({ workspace: workspacePath, file });
    return this.request(`/workspaces/metadata?${query.toString()}`);
  }

  async searchFiles(
    workspacePath: string,
    queryText: string,
    pattern?: string
  ): Promise<{ result: { query: string; matches: any[]; totalMatches: number; truncated: boolean } }> {
    const query = new URLSearchParams({ workspace: workspacePath, q: queryText });
    if (pattern) query.set('pattern', pattern);
    return this.request(`/workspaces/search?${query.toString()}`);
  }

  // Tasks
  async getTasks(): Promise<{ tasks: Task[] }> {
    return this.request('/tasks');
  }

  async getTask(
    taskId: string,
    options?: { includeEvents?: boolean; includeUsage?: boolean }
  ): Promise<{ success: boolean; task: Task }> {
    const query = new URLSearchParams();
    if (options?.includeEvents) query.set('includeEvents', 'true');
    if (options?.includeUsage) query.set('includeUsage', 'true');
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request(`/tasks/${encodeURIComponent(taskId)}${qs}`);
  }

  async createTask(
    prompt: string,
    workspaceRoot?: string,
    sessionId?: string
  ): Promise<{ task: Task }> {
    return this.request('/tasks', {
      method: 'POST',
      body: JSON.stringify({ prompt, workspaceRoot, sessionId }),
    });
  }

  async getTaskEventsHistory(taskId: string): Promise<{ success: boolean; events: NexusEvent[] }> {
    return this.request(`/tasks/${encodeURIComponent(taskId)}/events/history`);
  }

  async getTaskUsage(taskId: string): Promise<{ success: boolean; records: UsageRecord[] }> {
    return this.request(`/tasks/${encodeURIComponent(taskId)}/usage`);
  }

  async cancelTask(taskId: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: 'POST',
    });
  }

  // Sessions and History
  async getSessions(workspacePath?: string): Promise<{ success: boolean; sessions: Session[] }> {
    const qs = workspacePath ? `?workspace=${encodeURIComponent(workspacePath)}` : '';
    return this.request(`/sessions${qs}`);
  }

  async getSession(
    sessionId: string
  ): Promise<{ success: boolean; session: Session; tasks: Task[]; usageCount: number }> {
    return this.request(`/sessions/${encodeURIComponent(sessionId)}`);
  }

  async createSession(
    workspacePath: string,
    title?: string
  ): Promise<{ success: boolean; session: Session }> {
    return this.request('/sessions', {
      method: 'POST',
      body: JSON.stringify({ workspacePath, title }),
    });
  }

  async reopenSession(
    sessionId: string
  ): Promise<{ success: boolean; session: Session; tasks: Task[]; message: string }> {
    return this.request(`/sessions/${encodeURIComponent(sessionId)}/reopen`, {
      method: 'POST',
    });
  }

  async deleteSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
  }

  // Usage Intelligence
  async getUsageSummary(): Promise<{ summary: UsageSummary }> {
    return this.request('/usage/summary');
  }

  async getUsageRecords(): Promise<{ records: UsageRecord[] }> {
    return this.request('/usage/records');
  }

  // Server-Sent Events (SSE) stream subscription
  subscribeEvents(
    taskId?: string,
    onEvent?: (event: NexusEvent) => void,
    onError?: (err: Event) => void
  ): () => void {
    const url = taskId ? `${API_BASE}/tasks/${encodeURIComponent(taskId)}/events` : `${API_BASE}/tasks/events/all`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as NexusEvent;
        if (onEvent) onEvent(parsed);
      } catch (err) {
        console.warn('Failed to parse SSE payload:', err, e.data);
      }
    };

    if (onError) {
      eventSource.onerror = onError;
    }

    return () => {
      eventSource.close();
    };
  }
}

export const api = new ApiService();
