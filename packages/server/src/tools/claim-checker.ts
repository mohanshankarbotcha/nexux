import fs from 'node:fs';
import path from 'node:path';
import {
  ClaimItem,
  ClaimVerificationResult,
  resolveSafePath,
  normalizeStandardPath,
} from '@nexus/core';
import { globalEvidenceLedger } from './evidence-ledger.js';

export class ClaimChecker {
  /**
   * Verifies an array of claims against the evidence ledger and the real workspace filesystem.
   */
  async verifyClaims(
    workspaceRoot: string,
    taskId: string,
    claims: ClaimItem[]
  ): Promise<ClaimVerificationResult[]> {
    const evidenceList = globalEvidenceLedger.getByTaskId(taskId);
    const results: ClaimVerificationResult[] = [];

    for (const claim of claims) {
      const result = await this.verifySingleClaim(workspaceRoot, evidenceList, claim);
      results.push(result);
    }

    return results;
  }

  private async verifySingleClaim(
    workspaceRoot: string,
    evidenceList: ReturnType<typeof globalEvidenceLedger.getByTaskId>,
    claim: ClaimItem
  ): Promise<ClaimVerificationResult> {
    const subjectNorm = claim.subject.trim().replace(/\\/g, '/');

    switch (claim.type) {
      case 'created': {
        // 1. Filesystem check
        let existsOnDisk = false;
        try {
          const fullPath = resolveSafePath(workspaceRoot, claim.subject);
          existsOnDisk = fs.existsSync(fullPath);
        } catch {
          existsOnDisk = false;
        }

        if (!existsOnDisk) {
          return {
            claim,
            supported: false,
            reason: `Claimed created file '${claim.subject}' does not exist on the filesystem.`,
          };
        }

        // 2. Evidence check
        const writeEvidence = evidenceList.find(
          (e) =>
            e.tool === 'write_file' &&
            e.ok &&
            String(e.argsRedacted?.filePath || '').replace(/\\/g, '/').includes(subjectNorm)
        );

        if (!writeEvidence) {
          return {
            claim,
            supported: false,
            reason: `File '${claim.subject}' exists on disk, but no evidence of creation by this task was recorded.`,
          };
        }

        return {
          claim,
          supported: true,
          reason: `File exists on filesystem and verified against write_file evidence (${writeEvidence.evidenceId}).`,
        };
      }

      case 'modified': {
        let existsOnDisk = false;
        try {
          const fullPath = resolveSafePath(workspaceRoot, claim.subject);
          existsOnDisk = fs.existsSync(fullPath);
        } catch {
          existsOnDisk = false;
        }

        if (!existsOnDisk) {
          return {
            claim,
            supported: false,
            reason: `Claimed modified file '${claim.subject}' does not exist on filesystem.`,
          };
        }

        const editEvidence = evidenceList.find(
          (e) =>
            (e.tool === 'edit_file' || e.tool === 'write_file') &&
            e.ok &&
            String(e.argsRedacted?.filePath || '').replace(/\\/g, '/').includes(subjectNorm)
        );

        if (!editEvidence) {
          return {
            claim,
            supported: false,
            reason: `No evidence of file modification recorded for '${claim.subject}'.`,
          };
        }

        return {
          claim,
          supported: true,
          reason: `Modification verified against tool evidence (${editEvidence.evidenceId}).`,
        };
      }

      case 'deleted': {
        let existsOnDisk = false;
        try {
          const fullPath = resolveSafePath(workspaceRoot, claim.subject);
          existsOnDisk = fs.existsSync(fullPath);
        } catch {
          existsOnDisk = false;
        }

        if (existsOnDisk) {
          return {
            claim,
            supported: false,
            reason: `Claimed deleted file '${claim.subject}' still exists on filesystem.`,
          };
        }

        const deleteEvidence = evidenceList.find(
          (e) =>
            e.tool === 'delete_file' &&
            e.ok &&
            String(e.argsRedacted?.filePath || '').replace(/\\/g, '/').includes(subjectNorm)
        );

        if (!deleteEvidence) {
          return {
            claim,
            supported: false,
            reason: `File is absent, but no delete_file evidence record was found for this task.`,
          };
        }

        return {
          claim,
          supported: true,
          reason: `Deletion verified: file is absent and delete_file evidence confirmed (${deleteEvidence.evidenceId}).`,
        };
      }

      case 'listed': {
        const listEvidence = evidenceList.find(
          (e) =>
            e.tool === 'list_files' &&
            e.ok &&
            (String(e.argsRedacted?.directoryPath || '').includes(subjectNorm) || subjectNorm === '.')
        );

        if (!listEvidence) {
          return {
            claim,
            supported: false,
            reason: `No directory listing evidence recorded matching '${claim.subject}'.`,
          };
        }

        return {
          claim,
          supported: true,
          reason: `Directory listing verified in evidence (${listEvidence.evidenceId}).`,
        };
      }

      case 'ran': {
        const termEvidence = evidenceList.find(
          (e) =>
            e.tool === 'terminal' &&
            String(e.argsRedacted?.command || '').includes(claim.subject)
        );

        if (!termEvidence) {
          return {
            claim,
            supported: false,
            reason: `No terminal execution evidence found matching command '${claim.subject}'.`,
          };
        }

        return {
          claim,
          supported: true,
          reason: `Terminal execution verified in evidence (${termEvidence.evidenceId}).`,
        };
      }

      case 'passed': {
        const termEvidence = evidenceList.find(
          (e) =>
            e.tool === 'terminal' &&
            e.ok &&
            String(e.argsRedacted?.command || '').includes(claim.subject)
        );

        if (!termEvidence) {
          return {
            claim,
            supported: false,
            reason: `No successful terminal command execution found matching '${claim.subject}'.`,
          };
        }

        return {
          claim,
          supported: true,
          reason: `Command execution passed with exit code 0 (${termEvidence.evidenceId}).`,
        };
      }

      case 'failed': {
        const termEvidence = evidenceList.find(
          (e) =>
            e.tool === 'terminal' &&
            !e.ok &&
            String(e.argsRedacted?.command || '').includes(claim.subject)
        );

        if (!termEvidence) {
          return {
            claim,
            supported: false,
            reason: `No failed terminal command execution found matching '${claim.subject}'.`,
          };
        }

        return {
          claim,
          supported: true,
          reason: `Command execution failure verified (${termEvidence.evidenceId}).`,
        };
      }

      default:
        return {
          claim,
          supported: false,
          reason: `Unknown claim type '${(claim as any).type}'.`,
        };
    }
  }
}

export const globalClaimChecker = new ClaimChecker();
