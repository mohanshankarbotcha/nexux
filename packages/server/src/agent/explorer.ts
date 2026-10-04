import { BaseAgent, AgentExecutionContext } from './base-agent.js';
import { AgentRole, ToolDefinition } from '@nexus/core';

export interface ExplorationResult {
  summary: string;
  projectType: string;
  entryPoints: string[];
  relevantFiles: string[];
  patterns: string[];
}

export class ExplorerAgent extends BaseAgent {
  readonly role: AgentRole = 'explorer';
  readonly description = 'Inspects repository, identifies relevant files, conventions, and structures.';

  async run(
    prompt: string,
    context: AgentExecutionContext
  ): Promise<{ summary: string; success: boolean; data?: ExplorationResult }> {
    this.emitAgentStarted('Exploring repository architecture and locating relevant files', context);

    try {
      // 1. Inspect top-level files
      const listRes = await this.callTool('list_files', { directoryPath: '.', recursive: false }, context);
      const topFiles = (listRes.data as any)?.files?.map((f: any) => f.name) || [];

      // 2. Read package.json or README.md if present
      let projectContext = '';
      if (topFiles.includes('package.json')) {
        const pkgRes = await this.callTool('read_file', { filePath: 'package.json', endLine: 60 }, context);
        if (pkgRes.success) {
          projectContext += `\npackage.json:\n${(pkgRes.data as any)?.content}`;
        }
      } else if (topFiles.includes('README.md')) {
        const readmeRes = await this.callTool('read_file', { filePath: 'README.md', endLine: 60 }, context);
        if (readmeRes.success) {
          projectContext += `\nREADME.md:\n${(readmeRes.data as any)?.content}`;
        }
      }

      // 3. Search relevant files based on user prompt
      const words = prompt.split(/\s+/).filter((w) => w.length > 3 && !/^(with|from|that|this|have|make)$/i.test(w));
      const searchHits: string[] = [];

      for (const word of words.slice(0, 3)) {
        const searchRes = await this.callTool('search_files', { query: word, maxMatches: 5 }, context);
        if (searchRes.success && (searchRes.data as any)?.matches) {
          for (const m of (searchRes.data as any).matches) {
            if (!searchHits.includes(m.filePath)) searchHits.push(m.filePath);
          }
        }
      }

      // 4. Synthesize exploration via model
      const systemInstruction = `You are the NEXUS.AI Explorer Agent.
Your job is to analyze repository findings for a developer task.
Return a concise assessment of the repository structure and the key files to inspect or modify.`;

      const userMessage = `Task: "${prompt}"
Top-level files: ${topFiles.join(', ')}
Relevant search hits: ${searchHits.join(', ')}
${projectContext}`;

      const modelRes = await this.callModel(
        {
          systemInstruction,
          messages: [{ role: 'user', content: userMessage }],
          temperature: 0.1,
        },
        context
      );

      const summary = modelRes.content || `Explored repository: ${topFiles.length} top-level entries, ${searchHits.length} relevant files found.`;
      this.emitAgentCompleted(summary, context);

      return {
        summary,
        success: true,
        data: {
          summary,
          projectType: topFiles.includes('package.json') ? 'Node.js/TypeScript' : 'General',
          entryPoints: topFiles.filter((f: string) => f.includes('index') || f.includes('main') || f.includes('app')),
          relevantFiles: searchHits.length > 0 ? searchHits : topFiles.slice(0, 5),
          patterns: [],
        },
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.updateStatus('failed', context, errorMsg);
      return {
        summary: `Exploration failed: ${errorMsg}`,
        success: false,
      };
    }
  }
}
