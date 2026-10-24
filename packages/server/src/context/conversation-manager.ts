import {
  ConversationTurn,
  ConversationSummary,
  logger,
} from '@nexus/core';
import { ContextEngine } from './context-engine.js';

export class ConversationManager {
  private sessions = new Map<string, {
    turns: ConversationTurn[];
    summary?: ConversationSummary;
  }>();

  private readonly maxFullTurnsBudgetTokens = 4000;
  private readonly keepRecentTurnsCount = 4;

  getOrCreateSession(sessionId: string): { turns: ConversationTurn[]; summary?: ConversationSummary } {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = { turns: [] };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  /**
   * Adds a new turn to the conversation.
   * Automatically detects user corrections (e.g. "No, use X", "Don't do Y").
   */
  addTurn(
    sessionId: string,
    turn: {
      role: 'user' | 'assistant' | 'system' | 'tool';
      content: string;
      toolCalls?: any[];
      evidenceId?: string;
    }
  ): ConversationTurn {
    const session = this.getOrCreateSession(sessionId);

    // Detect if this is a user correction
    let isCorrection = false;
    if (turn.role === 'user') {
      const lower = turn.content.toLowerCase().trim();
      if (
        lower.startsWith('no,') ||
        lower.startsWith('no ') ||
        lower.includes("don't") ||
        lower.includes('do not') ||
        lower.includes('instead of') ||
        lower.includes('wrong') ||
        lower.includes('not that')
      ) {
        isCorrection = true;
      }
    }

    const conversationTurn: ConversationTurn = {
      id: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: turn.role,
      content: turn.content,
      timestamp: Date.now(),
      toolCalls: turn.toolCalls,
      evidenceId: turn.evidenceId,
      isCorrection,
    };

    session.turns.push(conversationTurn);
    this.compactIfNeeded(sessionId);
    return conversationTurn;
  }

  getTurns(sessionId: string): ConversationTurn[] {
    return this.sessions.get(sessionId)?.turns || [];
  }

  getSummary(sessionId: string): ConversationSummary | undefined {
    return this.sessions.get(sessionId)?.summary;
  }

  /**
   * Calculates total estimated tokens in current session turns.
   */
  calculateTokens(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    if (!session) return 0;
    return session.turns.reduce((acc, t) => acc + ContextEngine.estimateTokens(t.content), 0);
  }

  /**
   * Compacts older conversation turns when total token budget is exceeded.
   * Compaction Rules:
   * 1. Summarize older turns into key facts and decisions.
   * 2. Keep verbatim user corrections.
   * 3. Keep latest recent turns intact.
   */
  compactIfNeeded(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.turns.length <= this.keepRecentTurnsCount) {
      return false;
    }

    const totalTokens = this.calculateTokens(sessionId);
    if (totalTokens <= this.maxFullTurnsBudgetTokens) {
      return false;
    }

    // Split into older turns to compact and recent turns to preserve
    const olderTurns = session.turns.slice(0, -this.keepRecentTurnsCount);
    const recentTurns = session.turns.slice(-this.keepRecentTurnsCount);

    const keyFacts: string[] = session.summary?.keyFacts ? [...session.summary.keyFacts] : [];
    const keyDecisions: string[] = session.summary?.keyDecisions ? [...session.summary.keyDecisions] : [];
    const verbatimCorrections: string[] = session.summary?.verbatimCorrections ? [...session.summary.verbatimCorrections] : [];

    for (const turn of olderTurns) {
      if (turn.isCorrection && !verbatimCorrections.includes(turn.content)) {
        verbatimCorrections.push(turn.content);
      }

      if (turn.role === 'user') {
        const fact = `User requested: "${turn.content.slice(0, 100).trim()}"`;
        if (!keyFacts.includes(fact)) keyFacts.push(fact);
      } else if (turn.role === 'assistant') {
        const decision = `Assistant response: "${turn.content.slice(0, 120).trim()}"`;
        if (!keyDecisions.includes(decision)) keyDecisions.push(decision);
      }
    }

    session.summary = {
      compactedTurnsCount: (session.summary?.compactedTurnsCount || 0) + olderTurns.length,
      keyFacts: keyFacts.slice(-10),
      keyDecisions: keyDecisions.slice(-10),
      verbatimCorrections,
      lastCompactedAt: Date.now(),
    };

    session.turns = recentTurns;
    logger.info(`ConversationManager: Compacted ${olderTurns.length} older turns for session ${sessionId}. Tokens reduced.`);
    return true;
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

export const globalConversationManager = new ConversationManager();
