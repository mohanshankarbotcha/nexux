import fs from 'node:fs';
import path from 'node:path';
import { EvidenceRecord, sanitizeObject, logger } from '@nexus/core';

export class EvidenceLedger {
  private inMemoryRecords = new Map<string, EvidenceRecord[]>();
  private recordsById = new Map<string, EvidenceRecord>();

  /**
   * Records a tool execution in the evidence ledger.
   */
  async record(workspaceRoot: string, record: EvidenceRecord): Promise<void> {
    const taskRecords = this.inMemoryRecords.get(record.taskId) || [];
    taskRecords.push(record);
    this.inMemoryRecords.set(record.taskId, taskRecords);
    this.recordsById.set(record.evidenceId, record);

    // Persist to .nexus/evidence/<taskId>.json
    try {
      if (workspaceRoot && fs.existsSync(workspaceRoot)) {
        const evidenceDir = path.join(workspaceRoot, '.nexus', 'evidence');
        fs.mkdirSync(evidenceDir, { recursive: true });
        const filePath = path.join(evidenceDir, `${record.taskId}.json`);

        const sanitized = sanitizeObject(taskRecords);
        fs.writeFileSync(filePath, JSON.stringify(sanitized, null, 2));
      }
    } catch (err: any) {
      logger.warn(`Failed to persist evidence ledger to disk: ${err.message}`);
    }
  }

  /**
   * Retrieves all evidence records for a given task.
   */
  getByTaskId(taskId: string): EvidenceRecord[] {
    return this.inMemoryRecords.get(taskId) || [];
  }

  /**
   * Retrieves a specific evidence record by ID.
   */
  getById(evidenceId: string): EvidenceRecord | undefined {
    return this.recordsById.get(evidenceId);
  }

  /**
   * Clears records (useful in test teardowns).
   */
  clear(): void {
    this.inMemoryRecords.clear();
    this.recordsById.clear();
  }
}

export const globalEvidenceLedger = new EvidenceLedger();
