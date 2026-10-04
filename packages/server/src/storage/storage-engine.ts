import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  Session,
  Task,
  WorkspaceInfo,
  ProviderCredentials,
  UsageRecord,
  NexusEvent,
  sanitizeObject,
  globalEventBus,
  normalizeStandardPath,
  logger,
} from '@nexus/core';

export class StorageEngine {
  private dataDir: string;
  private sessionsFile: string;
  private workspacesFile: string;
  private credentialsFile: string;
  private usageFile: string;
  private tasksDir: string;
  private isListeningEvents = false;

  constructor(customDataDir?: string) {
    if (customDataDir) {
      this.dataDir = path.resolve(customDataDir);
    } else if (process.env.NEXUS_DATA_DIR) {
      this.dataDir = path.resolve(process.env.NEXUS_DATA_DIR);
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
    this.tasksDir = path.join(this.dataDir, 'tasks');

    this.ensureInitialized();
    this.recoverInterruptedTasks();
    this.listenToEvents();
  }

  private ensureInitialized(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
      logger.info(`StorageEngine: Initialized data directory at ${this.dataDir}`);
    }
    if (!fs.existsSync(this.tasksDir)) {
      fs.mkdirSync(this.tasksDir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Recovers tasks that were interrupted in a 'running' or 'pending' state
   * by server termination, ensuring reopening a workspace never sees ghost states.
   */
  private recoverInterruptedTasks(): void {
    try {
      const tasks = this.getAllTasks();
      for (const task of tasks) {
        if (task.status === 'running') {
          logger.warn(`StorageEngine: Recovering interrupted task '${task.id}' from prior session`);
          task.status = 'failed';
          task.error = 'Task execution was interrupted by application shutdown';
          task.completedAt = task.completedAt || Date.now();
          task.updatedAt = Date.now();
          this.saveTask(task);
        }
      }
    } catch (err) {
      logger.error('StorageEngine: Error recovering interrupted tasks', err);
    }
  }

  /**
   * Subscribes to global event bus to persist task events to disk in append-only JSONL format.
   */
  private listenToEvents(): void {
    if (this.isListeningEvents) return;
    this.isListeningEvents = true;

    globalEventBus.onAll((evt) => {
      if (evt && evt.taskId) {
        try {
          this.appendTaskEvent(evt.taskId, evt);
        } catch (err) {
          logger.debug(`StorageEngine: Failed to auto-persist event for task ${evt.taskId}`, err);
        }
      }
    });
  }

  getDataDir(): string {
    return this.dataDir;
  }

  setDataDir(dir: string): void {
    this.dataDir = path.resolve(dir);
    this.sessionsFile = path.join(this.dataDir, 'sessions.json');
    this.workspacesFile = path.join(this.dataDir, 'workspaces.json');
    this.credentialsFile = path.join(this.dataDir, 'credentials.json');
    this.usageFile = path.join(this.dataDir, 'usage.json');
    this.tasksDir = path.join(this.dataDir, 'tasks');
    this.ensureInitialized();
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
      const tempPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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
    session.updatedAt = Date.now();
    const list = this.getSessions().filter((s) => s.id !== session.id);
    list.unshift(session);
    this.writeJson(this.sessionsFile, list);
  }

  getSessionsForWorkspace(workspaceIdOrPath: string): Session[] {
    const norm = normalizeStandardPath(workspaceIdOrPath);
    return this.getSessions().filter(
      (s) => s.workspaceId === workspaceIdOrPath || normalizeStandardPath(s.workspacePath) === norm
    );
  }

  getRecentSession(workspaceIdOrPath: string): Session | undefined {
    const list = this.getSessionsForWorkspace(workspaceIdOrPath);
    return list.length > 0 ? list[0] : undefined;
  }

  getOrCreateSession(workspaceId: string, workspacePath: string, title?: string): Session {
    const existing = this.getRecentSession(workspacePath);
    if (existing) {
      return existing;
    }
    const newSession: Session = {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      workspaceId,
      workspacePath,
      title: title || path.basename(workspacePath) || 'New Coding Session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      taskIds: [],
    };
    this.saveSession(newSession);
    return newSession;
  }

  deleteSession(sessionId: string): boolean {
    const sessions = this.getSessions();
    const filtered = sessions.filter((s) => s.id !== sessionId);
    if (filtered.length === sessions.length) return false;
    this.writeJson(this.sessionsFile, filtered);

    // Also clean up associated tasks
    const sessionTasks = this.getTasksBySession(sessionId);
    for (const t of sessionTasks) {
      this.deleteTask(t.id);
    }
    return true;
  }

  // Tasks
  private getTaskFilePath(taskId: string): string {
    if (!fs.existsSync(this.tasksDir)) {
      fs.mkdirSync(this.tasksDir, { recursive: true, mode: 0o700 });
    }
    return path.join(this.tasksDir, `${taskId}.json`);
  }

  private getTaskEventsFilePath(taskId: string): string {
    if (!fs.existsSync(this.tasksDir)) {
      fs.mkdirSync(this.tasksDir, { recursive: true, mode: 0o700 });
    }
    return path.join(this.tasksDir, `${taskId}.events.jsonl`);
  }

  getTask(
    taskId: string,
    options?: { includeEvents?: boolean; includeUsage?: boolean }
  ): Task | undefined {
    const task = this.readJson<Task | undefined>(this.getTaskFilePath(taskId), undefined);
    if (!task) return undefined;

    if (options?.includeEvents) {
      task.events = this.getTaskEvents(taskId);
    }
    if (options?.includeUsage) {
      task.usageRecords = this.getUsageRecords().filter((u) => u.taskId === taskId);
    }
    return task;
  }

  saveTask(task: Task): void {
    task.updatedAt = Date.now();
    const sanitized = sanitizeObject(task);
    this.writeJson(this.getTaskFilePath(task.id), sanitized);

    // If task belongs to a session, update the session task list
    if (task.sessionId) {
      const session = this.getSession(task.sessionId);
      if (session) {
        if (!session.taskIds.includes(task.id)) {
          session.taskIds.push(task.id);
        }
        session.activeTaskId = task.id;
        session.updatedAt = Date.now();
        this.saveSession(session);
      }
    }
  }

  deleteTask(taskId: string): boolean {
    let deleted = false;
    const taskFile = this.getTaskFilePath(taskId);
    const eventsFile = this.getTaskEventsFilePath(taskId);

    if (fs.existsSync(taskFile)) {
      try {
        fs.unlinkSync(taskFile);
        deleted = true;
      } catch {}
    }
    if (fs.existsSync(eventsFile)) {
      try {
        fs.unlinkSync(eventsFile);
      } catch {}
    }
    return deleted;
  }

  getAllTasks(): Task[] {
    if (!fs.existsSync(this.tasksDir)) return [];
    try {
      const files = fs.readdirSync(this.tasksDir).filter((f) => f.endsWith('.json'));
      const tasks: Task[] = [];
      for (const file of files) {
        const t = this.readJson<Task | undefined>(path.join(this.tasksDir, file), undefined);
        if (t) tasks.push(t);
      }
      return tasks.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [];
    }
  }

  getTasksBySession(sessionId: string): Task[] {
    return this.getAllTasks()
      .filter((t) => t.sessionId === sessionId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  // Task Events Persistence (JSONL format)
  appendTaskEvent(taskId: string, event: NexusEvent): void {
    if (!taskId || !event) return;
    try {
      const eventsFile = this.getTaskEventsFilePath(taskId);
      const sanitized = sanitizeObject(event);
      const line = JSON.stringify(sanitized) + '\n';
      fs.appendFileSync(eventsFile, line, { encoding: 'utf-8', mode: 0o600 });
    } catch (err) {
      logger.error(`StorageEngine: Failed to append event to task ${taskId}`, err);
    }
  }

  getTaskEvents(taskId: string): NexusEvent[] {
    const eventsFile = this.getTaskEventsFilePath(taskId);
    if (!fs.existsSync(eventsFile)) return [];
    try {
      const content = fs.readFileSync(eventsFile, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      const events: NexusEvent[] = [];
      for (const line of lines) {
        try {
          events.push(JSON.parse(line) as NexusEvent);
        } catch {}
      }
      return events.sort((a, b) => a.timestamp - b.timestamp);
    } catch (err) {
      logger.warn(`StorageEngine: Failed to read events for task ${taskId}`, err);
      return [];
    }
  }

  saveTaskEvents(taskId: string, events: NexusEvent[]): void {
    try {
      const eventsFile = this.getTaskEventsFilePath(taskId);
      const sanitized = events.map(sanitizeObject);
      const content = sanitized.map((e) => JSON.stringify(e)).join('\n') + (events.length > 0 ? '\n' : '');
      const tempPath = `${eventsFile}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, content, { encoding: 'utf-8', mode: 0o600 });
      fs.renameSync(tempPath, eventsFile);
    } catch (err) {
      logger.error(`StorageEngine: Failed to save events for task ${taskId}`, err);
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
