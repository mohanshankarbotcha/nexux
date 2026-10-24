import path from 'node:path';
import {
  ReferenceResolutionResult,
  logger,
} from '@nexus/core';
import { SessionWorkingSetManager, globalWorkingSetManager } from './working-set.js';
import { ProjectProfileManager, globalProjectProfileManager } from './project-profile.js';

export class ReferenceResolver {
  private workingSetManager: SessionWorkingSetManager;
  private profileManager: ProjectProfileManager;

  constructor(
    workingSetManager: SessionWorkingSetManager = globalWorkingSetManager,
    profileManager: ProjectProfileManager = globalProjectProfileManager
  ) {
    this.workingSetManager = workingSetManager;
    this.profileManager = profileManager;
  }

  /**
   * Resolves conversational references in a user prompt against session state.
   */
  async resolveReference(
    prompt: string,
    sessionId: string,
    workspaceRoot: string
  ): Promise<ReferenceResolutionResult> {
    const trimmed = prompt.trim();
    const lower = trimmed.toLowerCase();
    const state = this.workingSetManager.getState(sessionId);

    // 1. "no, the other one" / "the other one" (Alternative switching)
    if (/^(no,?\s+)?(the\s+other\s+one|other\s+one|switch\s+to\s+the\s+other)\b/i.test(lower)) {
      if (state?.candidateHistory?.alternatives && state.candidateHistory.alternatives.length > 0) {
        const nextTarget = state.candidateHistory.alternatives[0];
        const remaining = state.candidateHistory.alternatives.slice(1);
        if (state.candidateHistory.selectedTarget) {
          remaining.push(state.candidateHistory.selectedTarget);
        }

        this.workingSetManager.recordCandidateHistory(
          sessionId,
          prompt,
          nextTarget,
          remaining
        );

        return {
          resolved: true,
          type: 'file',
          target: nextTarget,
          candidates: [nextTarget, ...remaining],
          source: 'candidate_history_alternative',
        };
      }

      return {
        resolved: false,
        type: 'clarification',
        clarificationQuestion: 'Could you please specify which alternative file you are referring to?',
        source: 'unresolved_alternative',
      };
    }

    // 2. "open the biggest one" / "the largest file"
    if (/(biggest\s+(one|file)|largest\s+(one|file))/i.test(lower)) {
      const largest = this.workingSetManager.getLargestFile(sessionId, workspaceRoot);
      if (largest) {
        // Record as selected candidate
        const otherFiles = (state?.items || [])
          .filter((i) => i.relativePath !== largest.relativePath)
          .map((i) => i.relativePath);

        this.workingSetManager.recordCandidateHistory(
          sessionId,
          prompt,
          largest.relativePath,
          otherFiles
        );

        return {
          resolved: true,
          type: 'file',
          target: largest.relativePath,
          candidates: [largest.relativePath, ...otherFiles],
          source: 'working_set_largest',
        };
      }
    }

    // 3. "explain the changes you made" / "what did you change"
    if (/(explain\s+(the\s+)?changes|what\s+(changes\s+did\s+you\s+make|did\s+you\s+change)|show\s+(the\s+)?changes)/i.test(lower)) {
      if (state?.lastChangeSet) {
        return {
          resolved: true,
          type: 'changeset',
          target: JSON.stringify(state.lastChangeSet),
          source: 'last_changeset',
        };
      }
    }

    // 4. "fix the error you just found" / "fix the error" / "fix the bug"
    if (/(fix\s+the\s+(error|bug|issue)(\s+you\s+(just\s+)?found)?|the\s+error\s+you\s+found)/i.test(lower)) {
      if (state?.lastError) {
        return {
          resolved: true,
          type: 'error',
          target: state.lastError.errorText,
          candidates: state.lastError.diagnostics,
          source: 'last_error',
        };
      }
      return {
        resolved: false,
        type: 'clarification',
        clarificationQuestion: 'No recent error was captured. Could you describe the error or paste the error output?',
        source: 'missing_last_error',
      };
    }

    // 5. "run the tests again" / "re-run the tests" / "run tests again"
    if (/(run\s+(the\s+)?tests?\s+again|re-?run\s+(the\s+)?tests?|test\s+again)/i.test(lower)) {
      const profile = await this.profileManager.getProfile(workspaceRoot);
      const testCmd = state?.lastTestCommand || profile.testCommand || (profile.scripts['test'] ? `${profile.packageManager} test` : undefined);
      if (testCmd) {
        return {
          resolved: true,
          type: 'command',
          target: testCmd,
          source: 'profile_or_history_test_command',
        };
      }
      return {
        resolved: false,
        type: 'clarification',
        clarificationQuestion: 'Could you please specify the test command to run (e.g. `npm test` or `pytest`)?',
        source: 'unresolved_test_command',
      };
    }

    // 6. "open that file" / "read that file" / "inspect that file"
    if (/^(open|read|inspect|show|view|look\s+at)\s+(that|the|this)\s+file\b/i.test(lower)) {
      const items = state?.items || [];
      if (items.length === 1) {
        return {
          resolved: true,
          type: 'file',
          target: items[0].relativePath,
          source: 'working_set_single_recent',
        };
      } else if (items.length > 1) {
        // If there is a distinct most recently accessed file (> 5 seconds ahead of others)
        const sorted = [...items].sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
        if (sorted[0].lastAccessedAt - sorted[1].lastAccessedAt > 5000) {
          const others = sorted.slice(1).map((i) => i.relativePath);
          this.workingSetManager.recordCandidateHistory(
            sessionId,
            prompt,
            sorted[0].relativePath,
            others
          );
          return {
            resolved: true,
            type: 'file',
            target: sorted[0].relativePath,
            candidates: [sorted[0].relativePath, ...others],
            source: 'working_set_most_recent',
          };
        }

        // Ambiguous choice among multiple recent files -> ask focused question
        const topCandidates = sorted.slice(0, 3).map((i) => `\`${i.relativePath}\``).join(' or ');
        return {
          resolved: false,
          type: 'clarification',
          clarificationQuestion: `Did you mean ${topCandidates}?`,
          candidates: sorted.slice(0, 3).map((i) => i.relativePath),
          source: 'ambiguous_working_set',
        };
      }

      return {
        resolved: false,
        type: 'clarification',
        clarificationQuestion: 'Which file would you like me to open?',
        source: 'empty_working_set',
      };
    }

    return {
      resolved: false,
      type: 'none',
      source: 'no_anaphoric_reference',
    };
  }
}

export const globalReferenceResolver = new ReferenceResolver();
