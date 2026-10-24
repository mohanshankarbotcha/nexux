import {
  Task,
  AgentRole,
  RouteDecision,
  ToolCallContext,
  resolveWorkspacePath,
  globalEventBus,
  logger,
} from '@nexus/core';
import { globalToolRegistry } from '../tools/index.js';
import { globalModelRouter } from '../providers/model-router.js';
import { globalStorage } from '../storage/storage-engine.js';

export interface FastPathContext {
  workspaceRoot: string;
  sessionId: string;
  taskId: string;
  provider?: string;
  model?: string;
  abortSignal?: AbortSignal;
}

export class FastPaths {
  /**
   * Fast Path S1: Direct conversational and general knowledge answer.
   * Single model call, zero tools.
   */
  async executeS1(task: Task, context: FastPathContext, decision: RouteDecision): Promise<string> {
    const bus = globalEventBus;
    const startTime = Date.now();

    // Handle clarify or authorize directly
    if (decision.category === 'clarify_or_authorize' && decision.clarification) {
      task.status = 'completed';
      task.stage = 'completed';
      task.resultSummary = decision.clarification;
      task.completedAt = Date.now();
      globalStorage.saveTask(task);

      bus.emit({
        id: `evt_${Date.now()}`,
        type: 'agent_message',
        sessionId: context.sessionId,
        taskId: context.taskId,
        timestamp: Date.now(),
        agentRole: 'coordinator' as AgentRole,
        content: decision.clarification,
        isStreaming: false,
      });

      bus.emit({
        id: `evt_${Date.now()}`,
        type: 'task_completed',
        sessionId: context.sessionId,
        taskId: context.taskId,
        timestamp: Date.now(),
        status: 'completed',
        summary: decision.clarification,
        totalDurationMs: Date.now() - startTime,
      });

      return decision.clarification;
    }

    // Dynamic capability generation derived from tool registry
    let dynamicCapabilities = '';
    const isCapabilityQuestion = /what\s+can\s+you\s+do/i.test(task.prompt);
    if (isCapabilityQuestion) {
      const defs = globalToolRegistry.getAllDefinitions();
      const toolNames = defs.map((d) => `• ${d.name}: ${d.description}`).join('\n');
      dynamicCapabilities = `\n\nNEXUS.AI active system tools currently registered:\n${toolNames}`;
    }

    const systemPrompt = `You are NEXUS.AI, an expert AI autonomous software engineering desktop application.
You provide clear, friendly, technically accurate, and direct responses.
${dynamicCapabilities}`;

    bus.emit({
      id: `evt_${Date.now()}`,
      type: 'task_progress',
      sessionId: context.sessionId,
      taskId: context.taskId,
      timestamp: Date.now(),
      agentRole: 'coordinator' as AgentRole,
      stage: 'chatting',
      status: 'running',
      message: 'Generating direct response...',
    });

    const response = await globalModelRouter.executeForRole(
      'coordinator',
      {
        requestId: `s1_${context.taskId}`,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: task.prompt },
        ],
        temperature: 0.3,
      },
      { provider: context.provider as any, model: context.model }
    );

    const reply = (response.content || '').trim();

    task.status = 'completed';
    task.stage = 'completed';
    task.resultSummary = reply;
    task.completedAt = Date.now();
    globalStorage.saveTask(task);

    bus.emit({
      id: `evt_${Date.now()}`,
      type: 'agent_message',
      sessionId: context.sessionId,
      taskId: context.taskId,
      timestamp: Date.now(),
      agentRole: 'coordinator' as AgentRole,
      content: reply,
      isStreaming: false,
    });

    bus.emit({
      id: `evt_${Date.now()}`,
      type: 'task_completed',
      sessionId: context.sessionId,
      taskId: context.taskId,
      timestamp: Date.now(),
      status: 'completed',
      summary: reply.slice(0, 150),
      totalDurationMs: Date.now() - startTime,
      totalTokens: response.usage?.totalTokens,
    });

    return reply;
  }

  /**
   * Fast Path S2: Read-only tool-augmented workspace answer.
   * Step cap: 8, model call cap: 2. Only read-only tools allowed.
   */
  async executeS2(task: Task, context: FastPathContext, decision: RouteDecision): Promise<string> {
    const bus = globalEventBus;
    const startTime = Date.now();
    const toolContext: ToolCallContext = {
      workspaceRoot: context.workspaceRoot,
      sessionId: context.sessionId,
      taskId: context.taskId,
      agentRole: 'coder',
      abortSignal: context.abortSignal,
      eventBus: bus,
    };

    // 1. Check for outside-workspace inspection refusal
    for (const target of decision.targets) {
      if (/([a-zA-Z]:[\\\/](windows|program\s*files|system32)|^\/etc|^\/var)/i.test(target)) {
        const refusal = `Access denied: Directory '${target}' is outside the authorized project workspace boundary. For system security, NEXUS.AI operations are confined strictly to the workspace root.`;
        task.status = 'completed';
        task.stage = 'completed';
        task.resultSummary = refusal;
        task.completedAt = Date.now();
        globalStorage.saveTask(task);

        bus.emit({
          id: `evt_${Date.now()}`,
          type: 'agent_message',
          sessionId: context.sessionId,
          taskId: context.taskId,
          timestamp: Date.now(),
          agentRole: 'coder' as AgentRole,
          content: refusal,
          isStreaming: false,
        });

        bus.emit({
          id: `evt_${Date.now()}`,
          type: 'task_completed',
          sessionId: context.sessionId,
          taskId: context.taskId,
          timestamp: Date.now(),
          status: 'completed',
          summary: refusal,
          totalDurationMs: Date.now() - startTime,
        });

        return refusal;
      }
    }

    bus.emit({
      id: `evt_${Date.now()}`,
      type: 'task_progress',
      sessionId: context.sessionId,
      taskId: context.taskId,
      timestamp: Date.now(),
      agentRole: 'coder' as AgentRole,
      stage: 'inspecting',
      status: 'running',
      message: 'Inspecting workspace...',
    });

    let toolDataDescription = '';
    const lowerPrompt = task.prompt.toLowerCase();
    const targetCandidate = decision.targets[0] || '';

    // Scenario A: Directory listing
    if (
      /(what\s+files\s+are\s+inside|tell\s+me\s+what\s+is\s+inside|list\s+files|show\s+files|kya\s+kya\s+files\s+hain|go\s+to\s+the\s+([a-zA-Z0-9_\-]+)\s+folder)/i.test(
        lowerPrompt
      )
    ) {
      const resolved = resolveWorkspacePath(context.workspaceRoot, targetCandidate || '.');
      if (resolved.status === 'notFound') {
        toolDataDescription = `The requested folder '${targetCandidate}' was not found in the workspace.`;
      } else if (resolved.status === 'outsideWorkspace') {
        toolDataDescription = `Target path resolves outside authorized workspace boundary.`;
      } else {
        const dirToList = resolved.relativePath || '.';
        const listResult = await globalToolRegistry.execute('list_files', { directoryPath: dirToList }, toolContext);
        if (listResult.success && listResult.data) {
          const files = (listResult.data as any).files || [];
          toolDataDescription = `Directory listing for '${dirToList}':\n` +
            files.map((f: any) => `- ${f.relativePath} (${f.isDirectory ? 'directory' : `${f.sizeBytes} bytes`})`).join('\n');
        } else {
          toolDataDescription = `Failed to list directory: ${listResult.error}`;
        }
      }
    }
    // Scenario B: Read & Explain File (e.g. package.json)
    else if (
      /(read|open|explain\s+the\s+dependencies|check)\s+([a-zA-Z0-9_\-\.]+\.(json|ts|js|py|html|md|txt))/i.test(lowerPrompt) ||
      targetCandidate.includes('.')
    ) {
      const resolved = resolveWorkspacePath(context.workspaceRoot, targetCandidate);
      if (resolved.status === 'resolved' && resolved.relativePath) {
        const readResult = await globalToolRegistry.execute('read_file', { filePath: resolved.relativePath }, toolContext);
        if (readResult.success && readResult.data) {
          toolDataDescription = `File contents of '${resolved.relativePath}':\n\`\`\`\n${(readResult.data as any).content}\n\`\`\``;
        } else {
          toolDataDescription = `Error reading file: ${readResult.error}`;
        }
      } else {
        toolDataDescription = `File '${targetCandidate}' was not found in the workspace.`;
      }
    }
    // Scenario C: Search files
    else if (/(find\s+all\s+files\s+containing|search\s+for|grep)\s+(["']?[a-zA-Z0-9_\-]+["']?)/i.test(lowerPrompt)) {
      const match = lowerPrompt.match(/(?:find\s+all\s+files\s+containing|search\s+for|grep)\s+["']?([a-zA-Z0-9_\-]+)["']?/i);
      const query = match ? match[1] : '';
      if (query) {
        const searchResult = await globalToolRegistry.execute('search_files', { query }, toolContext);
        if (searchResult.success && searchResult.data) {
          const matches = (searchResult.data as any).matches || [];
          toolDataDescription = `Search results for query "${query}":\n` +
            matches.map((m: any) => `- ${m.filePath}:${m.lineNumber}: ${m.lineContent.trim()}`).join('\n');
        } else {
          toolDataDescription = `No matches found for "${query}".`;
        }
      }
    }
    // Scenario D: Default workspace status
    else {
      const listResult = await globalToolRegistry.execute('list_files', { directoryPath: '.' }, toolContext);
      if (listResult.success && listResult.data) {
        const files = (listResult.data as any).files || [];
        toolDataDescription = `Workspace files:\n` +
          files.slice(0, 50).map((f: any) => `- ${f.relativePath}`).join('\n');
      }
    }

    // Single synthesis model call
    const systemPrompt = `You are NEXUS.AI. Answer the user's question accurately and concisely based strictly on the verified workspace data provided below.
Do not invent any file names or directories. If a file or folder was not found, state that truthfully.

VERIFIED WORKSPACE DATA:
${toolDataDescription}`;

    const response = await globalModelRouter.executeForRole(
      'coder',
      {
        requestId: `s2_${context.taskId}`,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: task.prompt },
        ],
        temperature: 0.1,
      },
      { provider: context.provider as any, model: context.model }
    );

    const reply = (response.content || '').trim();

    task.status = 'completed';
    task.stage = 'completed';
    task.resultSummary = reply;
    task.completedAt = Date.now();
    globalStorage.saveTask(task);

    bus.emit({
      id: `evt_${Date.now()}`,
      type: 'agent_message',
      sessionId: context.sessionId,
      taskId: context.taskId,
      timestamp: Date.now(),
      agentRole: 'coder' as AgentRole,
      content: reply,
      isStreaming: false,
    });

    bus.emit({
      id: `evt_${Date.now()}`,
      type: 'task_completed',
      sessionId: context.sessionId,
      taskId: context.taskId,
      timestamp: Date.now(),
      status: 'completed',
      summary: reply.slice(0, 150),
      totalDurationMs: Date.now() - startTime,
      totalTokens: response.usage?.totalTokens,
    });

    return reply;
  }
}

export const globalFastPaths = new FastPaths();
