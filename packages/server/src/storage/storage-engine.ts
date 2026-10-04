import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  Session,
  Task,
  WorkspaceInfo,
  ProviderCredentials,
  UsageRecord,
  logger,
} from '@nexus/core';

export class StorageEngine {
  private dataDir: string;
  private sessionsFile: string;
  private workspacesFile: string;
  private credentialsFile: string;
  private usageFile: string;

  constructor(customDataDir?: string) {
    if (customDataDir) {
      this.dataDir = path.resolve(customDataDir);
    } else {
      const baseDir =
        process.env.LOCALAPPDATA ||
        process.env.APPDATA ||
        path.join(os.homedir(), '.nexus_ai');
      this.dataDir = path.join(baseDir, 'NEXUS_AI_DATA');
    }

    this.sessionsFile = path.join(this.dataDir, 'sessions.json');
    this.workspacesFile = path.join(this.dataDir, 'workspaces.json');
    this.credentialsFile = path.join(this.dataDir, 'credentials.json');
    this.usageFile = path.join(this.dataDir, 'usage.json');

    this.ensureInitialized();
  }

  private ensureInitialized(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
      logger.info(`StorageEngine: Initialized data directory at ${this.dataDir}`);
    }
  }

  getDataDir(): string {
    return this.dataDir;
  }

  private readJson<T>(filePath: string, fallback: T): T {
    try {
      if (!fs.existsSync(filePath)) return fallback;
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch (err) {
      logger.warn(`StorageEngine: Failed to read ${filePath}, using fallback`, err);
      return fallback;
    }
  }

  private writeJson<T>(filePath: string, data: T): void {
    try {
      const tempPath = `${filePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), {
        encoding: 'utf-8',
        mode: 0o600, // Secure user-only read/write
      });
      fs.renameSync(tempPath, filePath);
    } catch (err) {
      logger.error(`StorageEngine: Failed to write ${filePath}`, err);
    }
  }

  // Workspaces
  getWorkspaces(): WorkspaceInfo[] {
    return this.readJson<WorkspaceInfo[]>(this.workspacesFile, []);
  }

  saveWorkspace(ws: WorkspaceInfo): void {
    const list = this.getWorkspaces().filter((w) => w.id !== ws.id);
    list.unshift(ws);
    this.writeJson(this.workspacesFile, list);
  }

  // Sessions
  getSessions(): Session[] {
    return this.readJson<Session[]>(this.sessionsFile, []);
  }

  getSession(id: string): Session | undefined {
    return this.getSessions().find((s) => s.id === id);
  }

  saveSession(session: Session): void {
    const list = this.getSessions().filter((s) => s.id !== session.id);
    list.unshift(session);
    this.writeJson(this.sessionsFile, list);
  }

  // Tasks
  private getTaskFilePath(taskId: string): string {
    const tasksDir = path.join(this.dataDir, 'tasks');
    if (!fs.existsSync(tasksDir)) {
      fs.mkdirSync(tasksDir, { recursive: true, mode: 0o700 });
    }
    return path.join(tasksDir, `${taskId}.json`);
  }

  getTask(taskId: string): Task | undefined {
    return this.readJson<Task | undefined>(this.getTaskFilePath(taskId), undefined);
  }

  saveTask(task: Task): void {
    this.writeJson(this.getTaskFilePath(task.id), task);
  }

  getAllTasks(): Task[] {
    const tasksDir = path.join(this.dataDir, 'tasks');
    if (!fs.existsSync(tasksDir)) return [];
    try {
      const files = fs.readdirSync(tasksDir).filter((f) => f.endsWith('.json'));
      const tasks: Task[] = [];
      for (const file of files) {
        const t = this.readJson<Task | undefined>(path.join(tasksDir, file), undefined);
        if (t) tasks.push(t);
      }
      return tasks.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [];
    }
  }

  // Credentials (secure local persistence)
  getCredentials(): ProviderCredentials {
    return this.readJson<ProviderCredentials>(this.credentialsFile, {});
  }

  saveCredentials(creds: ProviderCredentials): void {
    const current = this.getCredentials();
    const updated = {
      ...current,
      ...(creds.openaiApiKey !== undefined && { openaiApiKey: creds.openaiApiKey }),
      ...(creds.geminiApiKey !== undefined && { geminiApiKey: creds.geminiApiKey }),
    };
    this.writeJson(this.credentialsFile, updated);
  }

  // Usage records
  getUsageRecords(): UsageRecord[] {
    return this.readJson<UsageRecord[]>(this.usageFile, []);
  }

  recordUsage(record: UsageRecord): void {
    const records = this.getUsageRecords();
    records.push(record);
    // Keep max 5000 recent records locally
    if (records.length > 5000) {
      records.splice(0, records.length - 5000);
    }
    this.writeJson(this.usageFile, records);
  }
}

export const globalStorage = new StorageEngine();
