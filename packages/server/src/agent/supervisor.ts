import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  Task,
  AgentRole,
  RouteProfile,
  Plan,
  ExplorerReport,
  ChangeSet,
  VerificationReport,
  VerificationCheckResult,
  FinalReport,
  ClaimItem,
  ToolCallContext,
  parseCompilerAndRuntimeDiagnostics,
  NexusEventBus,
  globalEventBus,
  logger,
} from '@nexus/core';
import { ToolRegistry, globalToolRegistry } from '../tools/index.js';
import { ModelRouter, globalModelRouter } from '../providers/model-router.js';
import { StorageEngine, globalStorage } from '../storage/storage-engine.js';
import { globalClaimChecker } from '../tools/claim-checker.js';
import { globalEvidenceLedger } from '../tools/evidence-ledger.js';
import { globalActiveTaskRegistry } from '../tasks/active-task-registry.js';
import { globalTracer } from '../tracing/tracer.js';
import { globalWorkingSetManager, globalContextPackBuilder } from '../context/index.js';

export interface SupervisorOptions {
  workspaceRoot: string;
  sessionId: string;
  taskId: string;
  provider?: string;
  model?: string;
  abortSignal?: AbortSignal;
  modelRouter?: ModelRouter;
  toolRegistry?: ToolRegistry;
  storage?: StorageEngine;
  eventBus?: NexusEventBus;
}

/**
 * Tracks tool executions and error occurrences to prevent infinite loops,
 * duplicate calls, and cycling without progress.
 */
export class AntiLoopDetector {
  private recentToolCalls: Array<{ tool: string; argsHash: string; timestamp: number }> = [];
  private recentErrors: string[] = [];
  private readonly maxSameToolCalls = 3;
  private readonly maxSameError = 2;

  recordToolCall(tool: string, args: any): { isLoop: boolean; reason?: string } {
    const serialized = JSON.stringify(args || {});
    const argsHash = crypto.createHash('sha256').update(serialized).digest('hex').slice(0, 16);
    const now = Date.now();
    this.recentToolCalls.push({ tool, argsHash, timestamp: now });

    const recent = this.recentToolCalls.slice(-this.maxSameToolCalls);
    if (recent.length >= this.maxSameToolCalls) {
      const allSame = recent.every((r) => r.tool === tool && r.argsHash === argsHash);
      if (allSame) {
        return {
          isLoop: true,
          reason: `Anti-loop: Tool '${tool}' called with identical arguments ${this.maxSameToolCalls} times consecutively without workspace progress.`,
        };
      }
    }

    return { isLoop: false };
  }

  recordError(errorDiagnostic: string): { isLoop: boolean; reason?: string } {
    const trimmed = (errorDiagnostic || '').trim();
    if (!trimmed) return { isLoop: false };

    this.recentErrors.push(trimmed);
    const recent = this.recentErrors.slice(-this.maxSameError);
    if (recent.length >= this.maxSameError && recent[0] === recent[1]) {
      return {
        isLoop: true,
        reason: `Anti-loop: Identical failure encountered twice without progress: "${trimmed.slice(0, 150)}"`,
      };
    }
    return { isLoop: false };
  }
}

export class EngineeringSupervisor {
  /**
   * Executes a tool via ToolRegistry with full event lifecycle emissions.
   */
  private async executeTool(
    toolReg: ToolRegistry,
    name: any,
    input: any,
    context: ToolCallContext,
    role: AgentRole = 'coder'
  ) {
    const bus = context.eventBus || globalEventBus;
    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const startTime = Date.now();

    bus.emit({
      id: `evt_${Date.now()}`,
      type: 'tool_started',
      sessionId: context.sessionId,
      taskId: context.taskId,
      timestamp: startTime,
      agentRole: role,
      toolCallId: callId,
      toolName: name,
      input: (input as Record<string, unknown>) || {},
    });

    if (name === 'terminal') {
      bus.emit({
        id: `evt_${Date.now()}`,
        type: 'command_started',
        sessionId: context.sessionId,
        taskId: context.taskId,
        timestamp: startTime,
        command: (input as any)?.command || '',
      });
    }

    const result = await toolReg.execute(name, input, context);

    try {
      globalWorkingSetManager.recordToolResult(
        context.sessionId,
        context.workspaceRoot,
        name,
        input,
        result.data || result.error,
        result.evidenceId || callId,
        result.success
      );
    } catch {}

    if (name === 'terminal') {
      bus.emit({
        id: `evt_${Date.now()}`,
        type: 'command_completed',
        sessionId: context.sessionId,
        taskId: context.taskId,
        timestamp: Date.now(),
        command: (input as any)?.command || '',
        exitCode: (result.data as any)?.exitCode ?? (result.success ? 0 : 1),
        durationMs: result.durationMs,
        outputPreview: ((result.data as any)?.stdout || (result.data as any)?.stderr || '').slice(0, 300),
      });
    }

    bus.emit({
      id: `evt_${Date.now()}`,
      type: 'tool_completed',
      sessionId: context.sessionId,
      taskId: context.taskId,
      timestamp: Date.now(),
      agentRole: role,
      toolCallId: callId,
      toolName: name,
      success: result.success,
      durationMs: result.durationMs,
      outputSummary: result.success ? JSON.stringify(result.data).slice(0, 150) : undefined,
      error: result.error,
    });

    return result;
  }

  /**
   * Parses file updates from model responses.
   * Supports both explicit <<<FILE: path>>>...<<<END_FILE>>> blocks and
   * standard labeled code blocks.
   */
  parseGeneratedFiles(content: string, defaultFileName?: string): Array<{ filePath: string; content: string }> {
    const files: Array<{ filePath: string; content: string }> = [];

    // Pattern 1: <<<FILE: relative/path>>> ... <<<END_FILE>>>
    const explicitRegex = /<<<FILE:\s*([^\r\n>]+)>>>([\s\S]*?)<<<END_FILE>>>/g;
    let match: RegExpExecArray | null;
    while ((match = explicitRegex.exec(content)) !== null) {
      const targetPath = match[1].trim();
      const fileContent = match[2].trimStart();
      if (targetPath && fileContent) {
        files.push({ filePath: targetPath, content: fileContent });
      }
    }

    if (files.length > 0) return files;

    // Pattern 2: Markdown fenced code blocks with file path hints
    // e.g. ```python // filepath: calculator.py ... ``` or `// filename: test_calc.py`
    const fencedRegex = /```(?:[a-zA-Z0-9_\-]+)?\s*(?:\r?\n)?(?:\/\/\s*(?:filepath|filename|file):\s*([^\r\n]+)|#\s*(?:filepath|filename|file):\s*([^\r\n]+))?([\s\S]*?)```/g;
    while ((match = fencedRegex.exec(content)) !== null) {
      const targetPath = (match[1] || match[2] || '').trim();
      const fileContent = match[3] ? match[3].trimStart() : '';
      if (targetPath && fileContent) {
        files.push({ filePath: targetPath, content: fileContent });
      }
    }

    if (files.length > 0) return files;

    // Pattern 3: Single code block fallback if defaultFileName provided
    if (defaultFileName) {
      const codeBlockMatch = content.match(/```(?:[a-zA-Z0-9_\-]+)?\s*([\s\S]*?)```/);
      if (codeBlockMatch && codeBlockMatch[1].trim()) {
        files.push({ filePath: defaultFileName, content: codeBlockMatch[1].trim() });
      }
    }

    return files;
  }

  /**
   * Executes the deterministic engineering workflow state machine for profiles S3 and S4.
   */
  async execute(
    task: Task,
    profile: RouteProfile,
    options: SupervisorOptions
  ): Promise<FinalReport> {
    const bus = options.eventBus || globalEventBus;
    const router = options.modelRouter || globalModelRouter;
    const toolReg = options.toolRegistry || globalToolRegistry;
    const storageEngine = options.storage || globalStorage;
    const startTime = Date.now();
    const antiLoop = new AntiLoopDetector();

    if (options.abortSignal?.aborted) {
      throw new Error('Task cancelled');
    }
    const toolContext: ToolCallContext = {
      workspaceRoot: options.workspaceRoot,
      sessionId: options.sessionId,
      taskId: options.taskId,
      agentRole: 'coder',
      abortSignal: options.abortSignal,
      eventBus: bus,
    };

    logger.info(`EngineeringSupervisor: starting ${profile} workflow for task: ${task.id}`);

    // --- STAGE 1: EXPLORE (Required for S4, targeted for S3) ---
    let explorerReport: ExplorerReport = {
      relevantFiles: [],
      symbols: [],
      conventions: [],
      buildCommands: [],
      testCommands: [],
      risks: [],
    };

    if (profile === 'S4') {
      task.stage = 'exploring';
      storageEngine.saveTask(task);
      globalActiveTaskRegistry.updateStage(task.id, 'exploring', 'explorer', 'Exploring workspace structure');

      bus.emit({
        id: `evt_${Date.now()}`,
        type: 'task_progress',
        sessionId: options.sessionId,
        taskId: options.taskId,
        timestamp: Date.now(),
        agentRole: 'explorer' as AgentRole,
        stage: 'exploring',
        status: 'running',
        message: 'Inspecting repository files and configurations...',
      });

      const loopCheck = antiLoop.recordToolCall('list_files', { directoryPath: '.', limit: 50 });
      if (!loopCheck.isLoop) {
        const listRes = await this.executeTool(toolReg, 'list_files', { directoryPath: '.', limit: 50 }, toolContext, 'explorer');
        if (listRes.success && listRes.data) {
          const files = (listRes.data as any).files || [];
          explorerReport.relevantFiles = files.map((f: any) => f.relativePath);
        }
      }
    }

    // --- STAGE 2: PLAN (with runnable acceptance checks defined upfront) ---
    if (options.abortSignal?.aborted) throw new Error('Task cancelled');
    task.stage = 'planning';
    storageEngine.saveTask(task);
    globalActiveTaskRegistry.updateStage(task.id, 'planning', 'planner', 'Synthesizing verified milestone plan');

    bus.emit({
      id: `evt_${Date.now()}`,
      type: 'task_progress',
      sessionId: options.sessionId,
      taskId: options.taskId,
      timestamp: Date.now(),
      agentRole: 'planner' as AgentRole,
      stage: 'planning',
      status: 'running',
      message: 'Creating execution milestones with automated acceptance checks...',
    });

    const planSystemPrompt = `You are a Principal Software Architect (Planner Agent).
Create a structured Plan in strict JSON format for this software engineering task.
Task Prompt: "${task.prompt}"
Workspace files: ${explorerReport.relevantFiles.join(', ') || 'new workspace'}

Required JSON structure:
{
  "requirements": ["req1", "req2"],
  "assumptions": ["assumption1"],
  "stackChoice": "Python" | "Node" | "HTML/JS",
  "milestones": [
    {
      "id": "m1",
      "title": "Milestone title",
      "targetFiles": ["path/to/file"],
      "risks": ["potential issues"],
      "acceptanceChecks": [
        {
          "id": "check_1",
          "command": "terminal verification command (e.g. python test_calc.py)",
          "description": "Verification description",
          "expectedExitCode": 0
        }
      ]
    }
  ]
}
Respond ONLY with valid JSON.`;

    let plan: Plan = {
      requirements: [task.prompt],
      assumptions: [],
      stackChoice: 'Python',
      milestones: [
        {
          id: 'm1',
          title: 'Implementation & Verification',
          targetFiles: [],
          risks: [],
          acceptanceChecks: [],
        },
      ],
    };

    try {
      const planRes = await router.executeForRole(
        'planner',
        {
          requestId: `plan_${task.id}`,
          systemInstruction: planSystemPrompt,
          messages: [
            { role: 'system', content: planSystemPrompt },
            { role: 'user', content: task.prompt },
          ],
          temperature: 0.1,
        },
        { provider: options.provider as any, model: options.model }
      );

      if (planRes.usage) {
        storageEngine.recordUsage({
          requestId: planRes.requestId || `req_${Date.now()}`,
          taskId: task.id,
          sessionId: options.sessionId,
          agent: 'planner',
          provider: (planRes.provider || options.provider || 'gemini') as any,
          model: planRes.model || options.model || 'gemini-2.5-flash',
          inputTokens: planRes.usage.inputTokens,
          outputTokens: planRes.usage.outputTokens,
          totalTokens: planRes.usage.totalTokens,
          isEstimated: planRes.usage.isEstimated ?? false,
          estimatedCostUsd: 0,
          timestamp: Date.now(),
          durationMs: planRes.durationMs || 10,
          status: 'success',
        });
      }

      const jsonStr = (planRes.content || '')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      const parsedPlan = JSON.parse(jsonStr);
      if (parsedPlan?.milestones && Array.isArray(parsedPlan.milestones)) {
        plan = parsedPlan;
      } else if (parsedPlan?.steps && Array.isArray(parsedPlan.steps)) {
        plan = {
          requirements: [task.prompt],
          assumptions: [],
          stackChoice: 'Node',
          milestones: parsedPlan.steps.map((s: any) => ({
            id: s.id,
            title: s.description,
            targetFiles: s.targetFiles || [],
            risks: [],
            acceptanceChecks: s.verificationCommand ? [{
              id: `check_${s.id}`,
              command: s.verificationCommand,
              description: s.description,
              expectedExitCode: 0,
            }] : [],
          })),
        };
      }

      task.plan = {
        summary: 'Milestone Execution Plan',
        steps: plan.milestones.map((m) => ({
          id: m.id,
          description: m.title,
          targetFiles: m.targetFiles,
          status: 'completed' as const,
        })),
        createdAt: Date.now(),
      };
      storageEngine.saveTask(task);
    } catch (err: any) {
      logger.warn(`Plan LLM generation fallback: ${err.message}`);
    }

    // --- STAGE 3: IMPLEMENT (Engineer / Coder Stage) ---
    if (options.abortSignal?.aborted) throw new Error('Task cancelled');
    task.stage = 'coding';
    storageEngine.saveTask(task);
    globalActiveTaskRegistry.updateStage(task.id, 'coding', 'coder', 'Implementing code files and test suites');

    bus.emit({
      id: `evt_${Date.now()}`,
      type: 'task_progress',
      sessionId: options.sessionId,
      taskId: options.taskId,
      timestamp: Date.now(),
      agentRole: 'coder' as AgentRole,
      stage: 'coding',
      status: 'running',
      message: 'Writing source files and unit tests...',
    });

    const coderSystemPrompt = `You are a Principal Software Engineer (Coder Agent).
Implement all files required to completely fulfill this request:
"${task.prompt}"

You must provide each file to write in this exact structured format:
<<<FILE: relative/path/to/filename.ext>>>
... file contents here ...
<<<END_FILE>>>

Always include complete source code and automated tests (e.g. unittest, jest, pytest) verifying correct behavior!`;

    const coderMessages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string; toolCalls?: any[] }> = [
      { role: 'system', content: coderSystemPrompt },
      { role: 'user', content: `Please implement all files for: ${task.prompt}` },
    ];

    let generatedContent = '';
    let coderTurns = 0;
    const maxCoderTurns = 5;

    while (coderTurns < maxCoderTurns) {
      coderTurns++;
      if (options.abortSignal?.aborted) throw new Error('Task cancelled');

      let coderRes: any;
      try {
        coderRes = await router.executeForRole(
          'coder',
          {
            requestId: `code_${task.id}_turn_${coderTurns}`,
            systemInstruction: coderSystemPrompt,
            messages: coderMessages as any,
            temperature: 0.1,
          },
          { provider: options.provider as any, model: options.model }
        );
      } catch (coderErr: any) {
        logger.error(`Coder LLM call failed: ${coderErr.message}`);
        return this.composeBlockerReport(
          task,
          options,
          `Model generation failed during implementation: ${coderErr.message}`,
          startTime,
          storageEngine
        );
      }

      generatedContent = coderRes.content || '';

      if (coderRes.usage) {
        storageEngine.recordUsage({
          requestId: coderRes.requestId || `req_${Date.now()}`,
          taskId: task.id,
          sessionId: options.sessionId,
          agent: 'coder',
          provider: (coderRes.provider || options.provider || 'gemini') as any,
          model: coderRes.model || options.model || 'gemini-2.5-flash',
          inputTokens: coderRes.usage.inputTokens,
          outputTokens: coderRes.usage.outputTokens,
          totalTokens: coderRes.usage.totalTokens,
          isEstimated: coderRes.usage.isEstimated ?? false,
          estimatedCostUsd: 0,
          timestamp: Date.now(),
          durationMs: coderRes.durationMs || 10,
          status: 'success',
        });
      }

      const toolCalls = coderRes.toolCalls;
      if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) {
        // No tool calls returned; parse any embedded files in content
        const filesToWrite = this.parseGeneratedFiles(generatedContent);
        for (const file of filesToWrite) {
          const loopCheck = antiLoop.recordToolCall('write_file', { filePath: file.filePath });
          if (loopCheck.isLoop) {
            return this.composeBlockerReport(task, options, loopCheck.reason!, startTime, storageEngine);
          }
          await this.executeTool(
            toolReg,
            'write_file',
            { filePath: file.filePath, content: file.content, overwrite: true },
            toolContext,
            'coder'
          );
        }
        break; // Coding turns complete
      }

      // Add assistant message with tool calls
      coderMessages.push({
        role: 'assistant',
        content: coderRes.content || '',
        toolCalls,
      });

      // Execute tool calls and append tool results
      for (const call of toolCalls) {
        const loopCheck = antiLoop.recordToolCall(call.name, call.arguments);
        if (loopCheck.isLoop) {
          return this.composeBlockerReport(task, options, loopCheck.reason!, startTime, storageEngine);
        }
        const toolRes = await this.executeTool(toolReg, call.name as any, call.arguments, toolContext, 'coder');
        coderMessages.push({
          role: 'tool',
          name: call.name,
          content: JSON.stringify(toolRes.data || { success: toolRes.success }),
        });
      }
    }

    // --- STAGE 4: VERIFICATION LADDER ---
    if (options.abortSignal?.aborted) throw new Error('Task cancelled');
    task.stage = 'verifying';
    storageEngine.saveTask(task);
    globalActiveTaskRegistry.updateStage(task.id, 'verifying', 'reviewer', 'Running verification test ladder');

    bus.emit({
      id: `evt_${Date.now()}`,
      type: 'task_progress',
      sessionId: options.sessionId,
      taskId: options.taskId,
      timestamp: Date.now(),
      agentRole: 'reviewer' as AgentRole,
      stage: 'verifying',
      status: 'running',
      message: 'Executing automated acceptance checks...',
    });

    const verificationChecks: VerificationCheckResult[] = [];
    const checksToRun = plan.milestones.flatMap((m) => m.acceptanceChecks || []);

    // Derive standard check only if a specific test file was generated for this task
    if (checksToRun.length === 0) {
      try {
        const workspaceFiles = fs.readdirSync(options.workspaceRoot);
        const testFile = workspaceFiles.find((f) => f.endsWith('.py') && f.includes('test'));
        if (testFile) {
          checksToRun.push({
            id: 'python_test',
            command: `python ${testFile}`,
            description: 'Run Python test suite',
            expectedExitCode: 0,
          });
        }
      } catch {}
    }

    let blockerReason: string | undefined;

    for (const check of checksToRun) {
      const checkStart = Date.now();
      const loopCheck = antiLoop.recordToolCall('terminal', { command: check.command });
      if (loopCheck.isLoop) {
        blockerReason = loopCheck.reason;
        break;
      }

      const termRes = await this.executeTool(
        toolReg,
        'terminal',
        { command: check.command, timeoutMs: 30_000 },
        toolContext,
        'reviewer'
      );
      const termData = termRes.data as any;
      const exitCode = termData?.exitCode ?? (termRes.success ? 0 : 1);
      const passed = exitCode === (check.expectedExitCode ?? 0);

      const checkResult: VerificationCheckResult = {
        checkId: check.id,
        command: check.command,
        exitCode,
        outputSummary: (termData?.stdout || termData?.stderr || '').slice(0, 300),
        passed,
        durationMs: Date.now() - checkStart,
      };
      verificationChecks.push(checkResult);

      try {
        const wsState = globalWorkingSetManager.getOrCreateSession(options.sessionId, options.workspaceRoot);
        wsState.lastTestCommand = check.command;
      } catch {}

      // --- STAGE 5: TARGETED DEBUGGER LOOP (if check failed) ---
      if (!passed) {
        logger.warn(`Verification check failed: ${check.command}. Entering targeted debugger.`);
        const rawOutput = `${termData?.stdout || ''}\n${termData?.stderr || ''}`;
        const diagnostics = parseCompilerAndRuntimeDiagnostics(rawOutput);

        const errorSignature = diagnostics.diagnostics.length > 0
          ? diagnostics.diagnostics.map((d) => d.message).join('; ')
          : rawOutput.slice(0, 200);

        try {
          globalWorkingSetManager.recordLastError(
            options.sessionId,
            errorSignature,
            check.command,
            diagnostics.diagnostics.map((d) => d.message)
          );
        } catch {}

        const loopErrCheck = antiLoop.recordError(errorSignature);
        if (loopErrCheck.isLoop) {
          blockerReason = loopErrCheck.reason;
          break;
        }

        const debugPrompt = `Verification command failed: "${check.command}".
Exit code: ${exitCode}
Diagnostics: ${JSON.stringify(diagnostics.diagnostics)}
Raw error output:
${rawOutput.slice(0, 1000)}

Form a targeted hypothesis and return the fix in this exact format:
<<<FILE: relative/path/to/filename.ext>>>
... corrected file content ...
<<<END_FILE>>>`;

        try {
          const debugRes = await router.executeForRole(
            'debugger',
            {
              requestId: `debug_${task.id}`,
              systemInstruction: 'You are a Debugging Engineer (Debugger Agent). Fix errors accurately.',
              messages: [
                { role: 'system', content: 'You are a Debugging Engineer (Debugger Agent). Fix errors accurately.' },
                { role: 'user', content: debugPrompt },
              ],
              temperature: 0.1,
            },
            { provider: options.provider as any, model: options.model }
          );

          if (debugRes.toolCalls && Array.isArray(debugRes.toolCalls) && debugRes.toolCalls.length > 0) {
            for (const call of debugRes.toolCalls) {
              await this.executeTool(toolReg, call.name as any, call.arguments, toolContext, 'debugger');
            }
          } else {
            const fixFiles = this.parseGeneratedFiles(debugRes.content || '');
            for (const fix of fixFiles) {
              await this.executeTool(
                toolReg,
                'write_file',
                { filePath: fix.filePath, content: fix.content, overwrite: true },
                toolContext,
                'debugger'
              );
            }
          }

          // Rerun check
          const retestRes = await this.executeTool(
            toolReg,
            'terminal',
            { command: check.command, timeoutMs: 30_000 },
            toolContext,
            'reviewer'
          );
          const retestData = retestRes.data as any;
          const retestExit = retestData?.exitCode ?? (retestRes.success ? 0 : 1);
          if (retestExit === (check.expectedExitCode ?? 0)) {
            checkResult.passed = true;
            checkResult.exitCode = retestExit;
            checkResult.outputSummary = (retestData?.stdout || '').slice(0, 300);
          }
        } catch (dbgErr: any) {
          logger.error(`Debugger attempt failed: ${dbgErr.message}`);
        }
      }
    }

    const allPassed =
      (verificationChecks.length === 0 || verificationChecks.every((c) => c.passed)) && !blockerReason;

    const verificationReport: VerificationReport = {
      allPassed,
      checks: verificationChecks,
      passedCount: verificationChecks.filter((c) => c.passed).length,
      failedCount: verificationChecks.filter((c) => !c.passed).length,
    };

    // --- STAGE 6: DERIVE REAL CHANGESET FROM EVIDENCE & FILESYSTEM ---
    const evidenceList = globalEvidenceLedger.getByTaskId(task.id);
    const createdFiles: string[] = [];
    const modifiedFiles: string[] = [];
    const deletedFiles: string[] = [];

    for (const ev of evidenceList) {
      if (!ev.ok) continue;
      const fPath = String(ev.argsRedacted?.filePath || '');
      if (!fPath) continue;
      const absPath = path.isAbsolute(fPath) ? fPath : path.join(options.workspaceRoot, fPath);

      if (ev.tool === 'write_file') {
        if (fs.existsSync(absPath)) {
          if (!createdFiles.includes(fPath) && !modifiedFiles.includes(fPath)) {
            createdFiles.push(fPath);
          }
        }
      } else if (ev.tool === 'edit_file') {
        if (fs.existsSync(absPath) && !modifiedFiles.includes(fPath)) {
          modifiedFiles.push(fPath);
        }
      } else if (ev.tool === 'delete_file') {
        if (!fs.existsSync(absPath) && !deletedFiles.includes(fPath)) {
          deletedFiles.push(fPath);
        }
      }
    }

    const changeSet: ChangeSet = {
      createdFiles,
      modifiedFiles,
      deletedFiles,
      totalFilesChanged: createdFiles.length + modifiedFiles.length + deletedFiles.length,
    };

    // --- STAGE 7: COMPOSE CLAIMS & RUN CLAIM CHECKER ---
    const claimsToCheck: ClaimItem[] = [
      ...createdFiles.map((f) => ({ type: 'created' as const, subject: f })),
      ...modifiedFiles.map((f) => ({ type: 'modified' as const, subject: f })),
      ...deletedFiles.map((f) => ({ type: 'deleted' as const, subject: f })),
      ...verificationChecks.map((c) => ({
        type: c.passed ? ('passed' as const) : ('failed' as const),
        subject: c.command,
      })),
    ];

    const verifiedClaims = await globalClaimChecker.verifyClaims(
      options.workspaceRoot,
      task.id,
      claimsToCheck
    );

    const status = allPassed ? 'completed' : 'blocked';
    const summary = status === 'completed'
      ? `Task completed successfully: ${changeSet.totalFilesChanged} files changed, all verification checks passed.`
      : `Task verification encountered issues: ${blockerReason || `${verificationReport.failedCount} failing verification check(s)`}.`;

    task.status = status;
    task.stage = 'completed';
    task.resultSummary = summary;
    task.completedAt = Date.now();
    task.changedFiles = [
      ...createdFiles.map((f) => ({
        filePath: f,
        relativePath: f,
        changeType: 'created' as const,
        timestamp: Date.now(),
      })),
      ...modifiedFiles.map((f) => ({
        filePath: f,
        relativePath: f,
        changeType: 'modified' as const,
        timestamp: Date.now(),
      })),
      ...deletedFiles.map((f) => ({
        filePath: f,
        relativePath: f,
        changeType: 'deleted' as const,
        timestamp: Date.now(),
      })),
    ];
    storageEngine.saveTask(task);

    bus.emit({
      id: `evt_${Date.now()}`,
      type: 'agent_message',
      sessionId: options.sessionId,
      taskId: options.taskId,
      timestamp: Date.now(),
      agentRole: 'coordinator' as AgentRole,
      content: summary,
      isStreaming: false,
    });

    bus.emit({
      id: `evt_${Date.now()}`,
      type: 'task_completed',
      sessionId: options.sessionId,
      taskId: options.taskId,
      timestamp: Date.now(),
      status,
      summary,
      totalDurationMs: Date.now() - startTime,
    });

    return {
      taskId: task.id,
      status,
      summary,
      changeSet,
      verificationReport,
      claims: verifiedClaims,
      howToRun: checksToRun.map((c) => c.command),
      blockerReason,
    };
  }

  private composeBlockerReport(
    task: Task,
    options: SupervisorOptions,
    reason: string,
    startTime: number,
    storageEngine: StorageEngine = globalStorage
  ): FinalReport {
    if (options.abortSignal?.aborted) {
      throw new Error('Task cancelled');
    }
    const summary = `Task blocked: ${reason}`;
    task.status = 'blocked';
    task.stage = 'completed';
    task.resultSummary = summary;
    task.completedAt = Date.now();
    storageEngine.saveTask(task);

    globalEventBus.emit({
      id: `evt_${Date.now()}`,
      type: 'agent_message',
      sessionId: options.sessionId,
      taskId: options.taskId,
      timestamp: Date.now(),
      agentRole: 'coordinator' as AgentRole,
      content: summary,
      isStreaming: false,
    });

    globalEventBus.emit({
      id: `evt_${Date.now()}`,
      type: 'task_completed',
      sessionId: options.sessionId,
      taskId: options.taskId,
      timestamp: Date.now(),
      status: 'blocked',
      summary,
      totalDurationMs: Date.now() - startTime,
    });

    return {
      taskId: task.id,
      status: 'blocked',
      summary,
      changeSet: { createdFiles: [], modifiedFiles: [], deletedFiles: [], totalFilesChanged: 0 },
      verificationReport: { allPassed: false, checks: [], failedCount: 1, passedCount: 0 },
      claims: [],
      blockerReason: reason,
    };
  }
}

export const globalEngineeringSupervisor = new EngineeringSupervisor();
