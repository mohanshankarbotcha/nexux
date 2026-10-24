import {
  RouteDecision,
  RouteCategory,
  RouteProfile,
  validateRouteDecision,
  resolveWorkspacePath,
  logger,
} from '@nexus/core';
import { globalModelRouter } from '../providers/model-router.js';

export class RequestRouter {
  /**
   * Fast, deterministic regex-based pre-signals and intent extraction.
   */
  detectPreSignals(prompt: string, workspaceRoot: string): RouteDecision | null {
    const trimmed = prompt.trim();
    const lower = trimmed.toLowerCase();

    // 1. High-risk destructive requests
    if (
      /(delete\s+(everything|all)|destroy|format\s+[a-z]:|rm\s+-rf\s+[\/\*]|drop\s+database|wipe\s+(all|drive|workspace|everything))/i.test(
        lower
      )
    ) {
      return {
        category: 'clarify_or_authorize',
        profile: 'S1',
        confidence: 0.99,
        targets: [],
        needs: [],
        risk: 'high',
        clarification: 'This operation is destructive and can result in data loss. Are you sure you want to delete workspace files? Please confirm explicitly.',
        reason: 'High-risk destructive request requires explicit user authorization',
      };
    }

    // 2. Vague underspecified prompts requiring clarification
    if (/^(make\s+it\s+(better|faster)|improve\s+(this|code\s+quality)|fix\s+it|optimize\s+it|update\s+it|refactor\s+it)\b/i.test(lower)) {
      return {
        category: 'clarify_or_authorize',
        profile: 'S1',
        confidence: 0.95,
        targets: [],
        needs: [],
        risk: 'low',
        clarification: 'Could you please specify which file or aspect you would like to improve (e.g. performance, type safety, UI layout, or test coverage)?',
        reason: 'Ambiguous prompt requires focused clarification',
      };
    }

    // 3. Outside-workspace inspection (refused with explanation)
    if (/([a-zA-Z]:[\\\/](windows|program\s*files|system32)|^\/etc|^\/var)/i.test(lower)) {
      const match = trimmed.match(/([a-zA-Z]:[\\\/][a-zA-Z0-9_\-\.\/\\]+|\/[a-zA-Z0-9_\-\.\/]+)/);
      const target = match ? match[1] : 'outside path';
      return {
        category: 'workspace_read',
        profile: 'S2',
        confidence: 0.98,
        targets: [target],
        needs: ['workspace'],
        risk: 'high',
        reason: 'Inspection requested for system or outside directory',
      };
    }

    // 4. Multi-step engineering or build tasks (explicit creation or implementation)
    if (
      /(create|build|implement|generate|write\s+a\s+new)\s+(python|html|react|app|calculator|feature|service|script|component|rest\s+api|cli|todo|full-stack|landing\s+page|dockerfile|portfolio|e-commerce|chat|landing)/i.test(
        lower
      ) ||
      /(build\s+me\s+a\s+(simple\s+)?(html|react|dashboard|portfolio|website|file\s+with)|create\s+a\s+(python|react|cli|unit\s+test|landing))/i.test(
        lower
      )
    ) {
      return {
        category: 'engineering',
        profile: 'S4',
        confidence: 0.93,
        targets: [],
        needs: ['workspace', 'write', 'terminal'],
        risk: 'medium',
        reason: 'Multi-step engineering workflow task requiring planning, coding, and verification',
      };
    }

    // 5. Read-only Workspace Inspection (English + Hinglish)
    const isFolderList =
      /(what\s+files\s+are\s+inside|tell\s+me\s+what\s+is\s+inside|list\s+(the\s+)?files|show\s+(the\s+)?files|kya\s+kya\s+files\s+hain|go\s+to\s+the\s+([a-zA-Z0-9_\-]+)\s+folder|files\s+in\s+([a-zA-Z0-9_\-]+)|files\s+inside\s+([a-zA-Z0-9_\-]+)|me\s+kya\s+kya\s+files\s+hain)/i.test(
        lower
      );
    const isFileRead =
      /(read|open|explain\s+the\s+dependencies|check|examine|summarize)\s+([a-zA-Z0-9_\-\.]+\.(json|ts|js|py|html|md|txt|yaml|yml|css))/i.test(
        lower
      );
    const isSearch =
      /(find\s+all\s+files\s+containing|search\s+for|grep\s+for|grep\s+|where\s+is)\s+(["'][^"']+["']|\w+)/i.test(lower);

    if (isFolderList || isFileRead || isSearch) {
      const targets: string[] = [];
      const fileMatch = lower.match(/([a-zA-Z0-9_\-\.]+\.(json|ts|js|py|html|md|txt|yaml|yml|css))/);
      if (fileMatch) {
        targets.push(fileMatch[1]);
      } else {
        // Check colloquial folder phrase
        const folderMatch = lower.match(/(?:the|in|into|folder)\s+([a-zA-Z0-9_\-]+)\s*(?:folder|directory|dir)?/i);
        if (folderMatch && folderMatch[1] && !['what', 'the', 'is', 'me', 'tell', 'show', 'all'].includes(folderMatch[1])) {
          targets.push(folderMatch[1]);
        }
      }

      return {
        category: 'workspace_read',
        profile: 'S2',
        confidence: 0.94,
        targets,
        needs: ['workspace'],
        risk: 'low',
        reason: 'Read-only workspace inspection query matching fast path S2',
      };
    }

    // 6. Conversation, Capabilities & General Knowledge (English & Hinglish)
    if (
      /^(hi+|hello+|hey+|good\s*(morning|afternoon|evening)|greetings|howdy|sup)\b/i.test(lower) ||
      /^(kya\s+haal\s+hai|bhai\s+sun|namaste|kaun\s+ho\s+tum|aap\s+kaun\s+ho|batao\s+bhai)\b/i.test(lower) ||
      /(what\s+can\s+you\s+do|what\s+are\s+your\s+capabilities|who\s+are\s+you|what\s+are\s+you)/i.test(lower) ||
      /(tell\s+me\s+about|what\s+is\s+the\s+difference\s+between|explain|how\s+does|how\s+do|difference\s+between)\b/i.test(lower)
    ) {
      return {
        category: 'conversation',
        profile: 'S1',
        confidence: 0.96,
        targets: [],
        needs: [],
        risk: 'low',
        reason: 'Conversational query or general explanation requiring no workspace tools',
      };
    }

    return null;
  }

  /**
   * Routes a user prompt by evaluating pre-signals first, falling back to a structured LLM classification call.
   */
  async route(
    prompt: string,
    workspaceRoot: string,
    options?: { provider?: string; model?: string }
  ): Promise<RouteDecision> {
    const preSignal = this.detectPreSignals(prompt, workspaceRoot);
    if (preSignal) {
      logger.info(`RequestRouter: fast-path pre-signal decision (${preSignal.profile}) for prompt: "${prompt.slice(0, 50)}..."`);
      return preSignal;
    }

    // Structured LLM classification fallback
    const systemPrompt = `You are the NEXUS.AI Request Router.
Classify the user's prompt into a strict JSON RouteDecision object:
{
  "category": "conversation" | "workspace_read" | "small_change" | "engineering" | "clarify_or_authorize",
  "profile": "S1" | "S2" | "S3" | "S4" | "S5",
  "confidence": 0.0 to 1.0,
  "targets": ["path1", "path2"],
  "needs": ["workspace" | "write" | "terminal" | "network"],
  "risk": "low" | "medium" | "high",
  "clarification": "question if clarify_or_authorize",
  "reason": "short explanation"
}

Profiles:
- S1: General conversation, greeting, explaining capabilities, conceptual questions. Zero tools.
- S2: Read-only workspace inspection (listing folder, reading file, searching code, explaining package.json).
- S3: Single-file focused edit or fix.
- S4: Multi-step feature implementation or new project creation.
- S5: Complex architecture, large refactoring, multi-package changes.

Respond with ONLY valid JSON.`;

    try {
      const response = await globalModelRouter.executeForRole(
        'coordinator',
        {
          requestId: `route_${Date.now()}`,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.0,
        },
        { provider: options?.provider as any, model: options?.model }
      );

      const jsonStr = (response.content || '')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      const parsed = JSON.parse(jsonStr);
      return validateRouteDecision(parsed);
    } catch (err: any) {
      logger.warn(`RequestRouter LLM classification failed, using safe fallback: ${err.message}`);
      // Safe fallback
      return {
        category: 'engineering',
        profile: 'S4',
        confidence: 0.7,
        targets: [],
        needs: ['workspace', 'write'],
        risk: 'medium',
        reason: 'Fallback to standard engineering workflow',
      };
    }
  }
}

export const globalRequestRouter = new RequestRouter();
