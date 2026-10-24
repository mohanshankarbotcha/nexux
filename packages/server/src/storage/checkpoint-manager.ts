import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { normalizeStandardPath, resolveSafePath, logger } from '@nexus/core';

export interface CheckpointRecord {
  taskId: string;
  relativePath: string;
  snapshotPath: string;
  originalHash: string;
  timestamp: number;
}

export class CheckpointManager {
  private checkpoints = new Map<string, CheckpointRecord[]>();

  /**
   * Computes SHA-256 hash of a file or string content.
   */
  computeHash(content: string | Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Computes SHA-256 hash of an existing file on disk.
   */
  getFileHash(filePath: string): string | null {
    try {
      if (!fs.existsSync(filePath)) return null;
      const data = fs.readFileSync(filePath);
      return this.computeHash(data);
    } catch {
      return null;
    }
  }

  /**
   * Snapshots a pre-existing file before its first modification by a task.
   */
  async createSnapshot(
    workspaceRoot: string,
    taskId: string,
    targetRelativePath: string
  ): Promise<CheckpointRecord | null> {
    try {
      const fullPath = resolveSafePath(workspaceRoot, targetRelativePath);
      if (!fs.existsSync(fullPath)) {
        return null; // New file, no previous snapshot needed
      }

      const taskCheckpoints = this.checkpoints.get(taskId) || [];
      const relNormalized = targetRelativePath.replace(/\\/g, '/');

      // Check if already snapshotted for this task
      const existing = taskCheckpoints.find((c) => c.relativePath === relNormalized);
      if (existing) {
        return existing;
      }

      const originalContent = fs.readFileSync(fullPath);
      const originalHash = this.computeHash(originalContent);

      const snapshotDir = path.join(workspaceRoot, '.nexus', 'checkpoints', taskId);
      const snapshotPath = path.join(snapshotDir, relNormalized);

      fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
      fs.writeFileSync(snapshotPath, originalContent);

      const record: CheckpointRecord = {
        taskId,
        relativePath: relNormalized,
        snapshotPath,
        originalHash,
        timestamp: Date.now(),
      };

      taskCheckpoints.push(record);
      this.checkpoints.set(taskId, taskCheckpoints);

      logger.info(`Checkpoint created for '${relNormalized}' (Task: ${taskId})`, {
        hash: originalHash.slice(0, 10),
      });

      return record;
    } catch (err: any) {
      logger.warn(`Failed to create checkpoint snapshot for '${targetRelativePath}': ${err.message}`);
      return null;
    }
  }

  /**
   * Restores a single file from its task checkpoint.
   */
  async restoreFile(
    workspaceRoot: string,
    taskId: string,
    targetRelativePath: string
  ): Promise<boolean> {
    try {
      const relNormalized = targetRelativePath.replace(/\\/g, '/');
      const snapshotPath = path.join(workspaceRoot, '.nexus', 'checkpoints', taskId, relNormalized);

      if (!fs.existsSync(snapshotPath)) {
        logger.warn(`No checkpoint snapshot found at '${snapshotPath}'`);
        return false;
      }

      const targetPath = resolveSafePath(workspaceRoot, targetRelativePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(snapshotPath, targetPath);

      logger.info(`Restored '${relNormalized}' from checkpoint (Task: ${taskId})`);
      return true;
    } catch (err: any) {
      logger.error(`Failed to restore file '${targetRelativePath}' from checkpoint: ${err.message}`);
      return false;
    }
  }

  /**
   * Restores all modified files for a task to their pre-task snapshots.
   */
  async restoreAll(workspaceRoot: string, taskId: string): Promise<number> {
    const taskCheckpoints = this.checkpoints.get(taskId) || [];
    let restoredCount = 0;

    for (const record of taskCheckpoints) {
      const success = await this.restoreFile(workspaceRoot, taskId, record.relativePath);
      if (success) restoredCount++;
    }

    return restoredCount;
  }

  /**
   * Returns all checkpoints for a task.
   */
  getCheckpoints(taskId: string): CheckpointRecord[] {
    return this.checkpoints.get(taskId) || [];
  }
}

export const globalCheckpointManager = new CheckpointManager();
