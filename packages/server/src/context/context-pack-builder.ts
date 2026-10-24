import path from 'node:path';
import {
  LayeredContextPackage,
  RouteProfile,
  Task,
  TaskPlan,
  logger,
} from '@nexus/core';
import { ProjectProfileManager, globalProjectProfileManager } from './project-profile.js';
import { SessionWorkingSetManager, globalWorkingSetManager } from './working-set.js';
import { ConversationManager, globalConversationManager } from './conversation-manager.js';
import { ContextEngine } from './context-engine.js';

export interface BuildContextOptions {
  profile?: RouteProfile;
  maxTokens?: number;
}

export class ContextPackBuilder {
  private profileManager: ProjectProfileManager;
  private workingSetManager: SessionWorkingSetManager;
  private conversationManager: ConversationManager;

  constructor(
    profileManager: ProjectProfileManager = globalProjectProfileManager,
    workingSetManager: SessionWorkingSetManager = globalWorkingSetManager,
    conversationManager: ConversationManager = globalConversationManager
  ) {
    this.profileManager = profileManager;
    this.workingSetManager = workingSetManager;
    this.conversationManager = conversationManager;
  }

  /**
   * Builds the comprehensive layered context package for an agent execution.
   */
  async buildLayeredContext(
    sessionId: string,
    taskId: string,
    workspaceRoot: string,
    task?: Task,
    options: BuildContextOptions = {}
  ): Promise<LayeredContextPackage> {
    const normRoot = path.resolve(workspaceRoot);
    const profile = await this.profileManager.getProfile(normRoot);
    const workingSetState = this.workingSetManager.getOrCreateSession(sessionId, normRoot);

    // Rule: Verified state beats remembered state (detect external file modifications)
    const staleFiles = this.workingSetManager.checkStaleFiles(sessionId, normRoot);
    if (staleFiles.length > 0) {
      logger.info(
        `ContextPackBuilder: Detected ${staleFiles.length} stale file(s) on disk for session ${sessionId}: ${staleFiles.join(', ')}`
      );
      for (const staleFile of staleFiles) {
        this.workingSetManager.revalidateFile(sessionId, normRoot, staleFile);
      }
    }

    const recentMessages = this.conversationManager.getTurns(sessionId);
    const conversationSummary = this.conversationManager.getSummary(sessionId);

    // Estimate total tokens
    let totalTokens = 0;
    totalTokens += ContextEngine.estimateTokens(JSON.stringify(profile));
    totalTokens += workingSetState.items.reduce((acc, i) => acc + ContextEngine.estimateTokens(i.relativePath) + 20, 0);
    totalTokens += recentMessages.reduce((acc, m) => acc + ContextEngine.estimateTokens(m.content), 0);
    if (conversationSummary) {
      totalTokens += ContextEngine.estimateTokens(JSON.stringify(conversationSummary));
    }
    if (task?.plan) {
      totalTokens += ContextEngine.estimateTokens(JSON.stringify(task.plan));
    }

    return {
      sessionId,
      taskId,
      workspaceRoot: normRoot,
      projectProfile: profile,
      workingSet: workingSetState.items,
      staleFilesDetected: staleFiles,
      activePlan: task?.plan,
      recentMessages,
      conversationSummary,
      totalTokens,
      generatedAt: Date.now(),
    };
  }

  /**
   * Formats the layered context into structured instructions to inject into system/user prompts.
   */
  formatContextPrompt(contextPackage: LayeredContextPackage): string {
    const sections: string[] = [];

    // 1. Workspace Profile
    const prof = contextPackage.projectProfile;
    sections.push(
      `--- PROJECT CONTEXT ---
Language: ${prof.language}
Package Manager: ${prof.packageManager}
Test Command: ${prof.testCommand || 'none'}
Build Command: ${prof.buildCommand || 'none'}`
    );

    // 2. Working Set & Verified Hashes
    if (contextPackage.workingSet.length > 0) {
      const filesList = contextPackage.workingSet
        .slice(0, 10)
        .map((f) => `- ${f.relativePath} (sha256:${f.sha256.slice(0, 8)}, ${f.byteSize}B)`)
        .join('\n');
      sections.push(`--- ACTIVE WORKING SET ---\n${filesList}`);
    }

    // 3. Stale Files Alert
    if (contextPackage.staleFilesDetected.length > 0) {
      sections.push(
        `[NOTICE] The following file(s) were modified externally on disk: ${contextPackage.staleFilesDetected.join(
          ', '
        )}. Inspect them before assuming past state.`
      );
    }

    // 4. Conversation Summary & Verbatim Corrections
    if (contextPackage.conversationSummary) {
      const summaryParts: string[] = [];
      if (contextPackage.conversationSummary.keyFacts.length > 0) {
        summaryParts.push(
          `Prior Facts:\n- ${contextPackage.conversationSummary.keyFacts.join('\n- ')}`
        );
      }
      if (contextPackage.conversationSummary.verbatimCorrections.length > 0) {
        summaryParts.push(
          `MANDATORY USER CORRECTIONS (MUST OBEY):\n- ${contextPackage.conversationSummary.verbatimCorrections.join(
            '\n- '
          )}`
        );
      }
      if (summaryParts.length > 0) {
        sections.push(`--- PRIOR CONVERSATION SUMMARY ---\n${summaryParts.join('\n')}`);
      }
    }

    // 5. Active Plan
    if (contextPackage.activePlan) {
      sections.push(
        `--- CURRENT TASK PLAN ---\n${contextPackage.activePlan.summary}\nSteps: ${contextPackage.activePlan.steps
          .map((s) => `[${s.status}] ${s.description}`)
          .join('; ')}`
      );
    }

    return sections.join('\n\n');
  }
}

export const globalContextPackBuilder = new ContextPackBuilder();
