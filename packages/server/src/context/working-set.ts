import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  WorkingSetItem,
  RecentToolEvidence,
  SessionWorkingSetState,
  ChangeSet,
  resolveSafePath,
  getSafeRelativePath,
  logger,
} from '@nexus/core';

export class SessionWorkingSetManager {
  private sessions = new Map<string, SessionWorkingSetState>();

  getOrCreateSession(sessionId: string, workspaceRoot: string): SessionWorkingSetState {
    let state = this.sessions.get(sessionId);
    if (!state) {
      state = {
        sessionId,
        workspaceRoot: path.resolve(workspaceRoot),
        items: [],
        recentEvidences: [],
        updatedAt: Date.now(),
      };
      this.sessions.set(sessionId, state);
    }
    return state;
  }

  getState(sessionId: string): SessionWorkingSetState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Adds or updates a file in the session working set.
   */
  addFile(
    sessionId: string,
    workspaceRoot: string,
    filePath: string,
    operation: 'read' | 'write' | 'edit'
  ): WorkingSetItem | undefined {
    const state = this.getOrCreateSession(sessionId, workspaceRoot);

    try {
      const safePath = resolveSafePath(workspaceRoot, filePath);
      if (!fs.existsSync(safePath)) return undefined;

      const stat = fs.statSync(safePath);
      if (stat.isDirectory()) return undefined;

      const relPath = getSafeRelativePath(workspaceRoot, safePath);
      const content = fs.readFileSync(safePath);
      const sha256 = crypto.createHash('sha256').update(content).digest('hex');

      const existingIndex = state.items.findIndex(
        (i) => i.relativePath.toLowerCase() === relPath.toLowerCase()
      );

      const item: WorkingSetItem = {
        filePath: safePath,
        relativePath: relPath,
        sha256,
        mtimeMs: stat.mtimeMs,
        byteSize: stat.size,
        lastAccessedAt: Date.now(),
        lastOperation: operation,
      };

      if (existingIndex >= 0) {
        state.items[existingIndex] = item;
      } else {
        state.items.unshift(item);
      }

      // Cap working set size to 30 most recent files
      if (state.items.length > 30) {
        state.items = state.items.slice(0, 30);
      }

      state.updatedAt = Date.now();
      return item;
    } catch (err: any) {
      logger.debug(`SessionWorkingSetManager: Could not add file '${filePath}': ${err.message}`);
      return undefined;
    }
  }

  /**
   * Detects files modified externally on disk since they were recorded in the working set.
   * Rule: Verified state beats remembered state.
   */
  checkStaleFiles(sessionId: string, workspaceRoot: string): string[] {
    const state = this.sessions.get(sessionId);
    if (!state) return [];

    const staleRelPaths: string[] = [];

    for (const item of state.items) {
      try {
        const safePath = resolveSafePath(workspaceRoot, item.relativePath);
        if (!fs.existsSync(safePath)) {
          staleRelPaths.push(item.relativePath);
          continue;
        }

        const stat = fs.statSync(safePath);
        // If mtime has changed by > 50ms, check file sha256
        if (Math.abs(stat.mtimeMs - item.mtimeMs) > 50) {
          const content = fs.readFileSync(safePath);
          const currentHash = crypto.createHash('sha256').update(content).digest('hex');
          if (currentHash !== item.sha256) {
            staleRelPaths.push(item.relativePath);
          }
        }
      } catch {
        staleRelPaths.push(item.relativePath);
      }
    }

    return staleRelPaths;
  }

  /**
   * Revalidates and updates a working set item from current disk state.
   */
  revalidateFile(sessionId: string, workspaceRoot: string, filePath: string): WorkingSetItem | undefined {
    return this.addFile(sessionId, workspaceRoot, filePath, 'read');
  }

  /**
   * Records a recent tool execution and summary.
   */
  recordToolResult(
    sessionId: string,
    workspaceRoot: string,
    tool: string,
    args: any,
    result: any,
    evidenceId: string,
    ok: boolean
  ): void {
    const state = this.getOrCreateSession(sessionId, workspaceRoot);

    const argsSummary = typeof args === 'object' && args !== null ? JSON.stringify(args).slice(0, 150) : String(args || '');
    const resultSummary = typeof result === 'object' && result !== null ? JSON.stringify(result).slice(0, 200) : String(result || '');

    state.recentEvidences.unshift({
      evidenceId,
      tool,
      argsSummary,
      resultSummary,
      ok,
      timestamp: Date.now(),
    });

    if (state.recentEvidences.length > 25) {
      state.recentEvidences = state.recentEvidences.slice(0, 25);
    }

    // Auto-track files accessed through tools
    if (tool === 'read_file' && args?.filePath) {
      this.addFile(sessionId, workspaceRoot, args.filePath, 'read');
    } else if (tool === 'write_file' && args?.filePath) {
      this.addFile(sessionId, workspaceRoot, args.filePath, 'write');
    } else if (tool === 'edit_file' && args?.filePath) {
      this.addFile(sessionId, workspaceRoot, args.filePath, 'edit');
    }

    // Auto-track failing commands in lastError
    if (tool === 'terminal' && !ok) {
      state.lastError = {
        command: args?.command,
        errorText: resultSummary,
        timestamp: Date.now(),
      };
    }

    state.updatedAt = Date.now();
  }

  /**
   * Records last error diagnostic.
   */
  recordLastError(sessionId: string, errorText: string, command?: string, diagnostics?: string[]): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    state.lastError = {
      command,
      errorText,
      diagnostics,
      timestamp: Date.now(),
    };
    state.updatedAt = Date.now();
  }

  /**
   * Records last ChangeSet.
   */
  recordChangeSet(sessionId: string, changeSet: ChangeSet): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    state.lastChangeSet = changeSet;
    state.updatedAt = Date.now();
  }

  /**
   * Records candidate history to support "no, the other one".
   */
  recordCandidateHistory(
    sessionId: string,
    prompt: string,
    selectedTarget?: string,
    alternatives: string[] = []
  ): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    state.candidateHistory = {
      prompt,
      selectedTarget,
      alternatives,
      timestamp: Date.now(),
    };
    state.updatedAt = Date.now();
  }

  /**
   * Finds the largest file among working set items or directory scan.
   */
  getLargestFile(sessionId: string, workspaceRoot: string): WorkingSetItem | undefined {
    const state = this.sessions.get(sessionId);
    if (state && state.items.length > 0) {
      const sorted = [...state.items].sort((a, b) => b.byteSize - a.byteSize);
      return sorted[0];
    }

    // Fallback: scan workspace files
    try {
      const files = fs.readdirSync(workspaceRoot);
      let largest: { name: string; size: number } | null = null;
      for (const f of files) {
        const full = path.join(workspaceRoot, f);
        try {
          const stat = fs.statSync(full);
          if (stat.isFile() && (!largest || stat.size > largest.size)) {
            largest = { name: f, size: stat.size };
          }
        } catch {}
      }

      if (largest) {
        return this.addFile(sessionId, workspaceRoot, largest.name, 'read');
      }
    } catch {}

    return undefined;
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

export const globalWorkingSetManager = new SessionWorkingSetManager();
