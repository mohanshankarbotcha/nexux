import fs from 'node:fs';
import path from 'node:path';
import {
  WorkspaceError,
  resolveSafePath,
  getSafeRelativePath,
  DEFAULT_TOOL_CONFIG,
  logger,
} from '@nexus/core';
import { WorkspaceService, globalWorkspaceService } from '../workspace/workspace-service.js';

export interface ContextSourceItem {
  filePath: string;
  relativePath: string;
  content: string;
  reason: 'project_instruction' | 'explicit_mention' | 'keyword_match' | 'entry_point';
  score: number;
  byteSize: number;
  estimatedTokens: number;
}

export interface TaskContextPackage {
  taskId: string;
  sessionId: string;
  projectSummary: string;
  projectInstructions?: string;
  items: ContextSourceItem[];
  omittedFiles: string[];
  totalBytes: number;
  totalEstimatedTokens: number;
  generatedAt: number;
}

export interface ContextOptions {
  maxBytes?: number;
  maxTokens?: number;
  maxFiles?: number;
}

const INSTRUCTION_FILE_NAMES = [
  'README.md',
  'readme.md',
  'CONTRIBUTING.md',
  '.nexusrules',
  'AGENTS.md',
];

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but',
  'by', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him',
  'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'let', 'me',
  'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or',
  'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should',
  'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then',
  'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up',
  'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why',
  'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves', 'please', 'add', 'create',
  'update', 'fix', 'implement', 'make'
]);

export class ContextEngine {
  private workspaceService: WorkspaceService;

  constructor(workspaceService: WorkspaceService = globalWorkspaceService) {
    this.workspaceService = workspaceService;
  }

  /**
   * Estimates token count (~4 characters per token for English/code).
   */
  static estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Extracts salient search keywords from a user prompt.
   */
  extractKeywords(prompt: string): string[] {
    const rawTokens = prompt
      .toLowerCase()
      .replace(/[^a-zA-Z0-9_\-\.]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    return Array.from(new Set(rawTokens)).slice(0, 8);
  }

  /**
   * Builds an optimized, relevant, budget-capped context package for an agent task.
   */
  async buildTaskContext(
    workspaceRoot: string,
    prompt: string,
    sessionId: string,
    taskId: string,
    options: ContextOptions = {}
  ): Promise<TaskContextPackage> {
    const maxBytes = options.maxBytes || 64 * 1024; // 64 KB default context budget
    const maxTokens = options.maxTokens || 16_000;
    const maxFiles = options.maxFiles || 8;

    const items: ContextSourceItem[] = [];
    const omittedFiles: string[] = [];
    const visitedPaths = new Set<string>();

    let currentBytes = 0;
    let currentTokens = 0;

    // 1. Look for project instruction files (README, .nexusrules)
    let projectInstructions = '';
    for (const name of INSTRUCTION_FILE_NAMES) {
      try {
        const filePath = path.join(workspaceRoot, name);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8').slice(0, 4000); // Max 4KB per instruction
          projectInstructions += `\n--- [${name}] ---\n${content}\n`;
          visitedPaths.add(name.toLowerCase());
          break; // Take the primary instruction file
        }
      } catch {}
    }

    // 2. Detect explicitly mentioned files in prompt (e.g. "look at src/index.ts")
    const words = prompt.split(/\s+/);
    for (const word of words) {
      const cleanWord = word.replace(/['"`,\(\)]/g, '').trim();
      if (cleanWord.includes('/') || cleanWord.includes('\\') || cleanWord.endsWith('.ts') || cleanWord.endsWith('.js') || cleanWord.endsWith('.json')) {
        try {
          const safePath = resolveSafePath(workspaceRoot, cleanWord);
          if (fs.existsSync(safePath) && !visitedPaths.has(cleanWord.toLowerCase())) {
            const relPath = getSafeRelativePath(workspaceRoot, safePath);
            const content = fs.readFileSync(safePath, 'utf-8').slice(0, 8000);
            const byteSize = Buffer.byteLength(content, 'utf-8');
            const tokens = ContextEngine.estimateTokens(content);

            if (currentBytes + byteSize <= maxBytes && items.length < maxFiles) {
              items.push({
                filePath: safePath,
                relativePath: relPath,
                content,
                reason: 'explicit_mention',
                score: 100,
                byteSize,
                estimatedTokens: tokens,
              });
              visitedPaths.add(cleanWord.toLowerCase());
              visitedPaths.add(relPath.toLowerCase());
              currentBytes += byteSize;
              currentTokens += tokens;
            } else {
              omittedFiles.push(relPath);
            }
          }
        } catch {}
      }
    }

    // 3. Search relevant code using extracted keywords
    const keywords = this.extractKeywords(prompt);
    const candidateFiles = new Map<string, { matches: number; sampleLines: string[] }>();

    for (const kw of keywords) {
      const searchRes = this.workspaceService.searchFiles(workspaceRoot, kw, undefined, 15);
      for (const m of searchRes.matches) {
        const lowerRel = m.filePath.toLowerCase();
        if (visitedPaths.has(lowerRel)) continue;

        let entry = candidateFiles.get(m.filePath);
        if (!entry) {
          entry = { matches: 0, sampleLines: [] };
          candidateFiles.set(m.filePath, entry);
        }
        entry.matches += 1;
        if (entry.sampleLines.length < 3) {
          entry.sampleLines.push(`L${m.lineNumber}: ${m.lineContent}`);
        }
      }
    }

    // Sort candidate files by match count descending
    const sortedCandidates = Array.from(candidateFiles.entries()).sort(
      (a, b) => b[1].matches - a[1].matches
    );

    for (const [relPath, data] of sortedCandidates) {
      if (items.length >= maxFiles || currentBytes >= maxBytes || currentTokens >= maxTokens) {
        omittedFiles.push(relPath);
        continue;
      }

      try {
        const safePath = resolveSafePath(workspaceRoot, relPath);
        const stat = fs.statSync(safePath);
        if (stat.size > DEFAULT_TOOL_CONFIG.maxFileSizeReadBytes) {
          omittedFiles.push(relPath);
          continue;
        }

        const raw = fs.readFileSync(safePath, 'utf-8');
        // Cap single file at 8 KB to prevent a single file dominating the context
        const content = raw.slice(0, 8192);
        const byteSize = Buffer.byteLength(content, 'utf-8');
        const tokens = ContextEngine.estimateTokens(content);

        if (currentBytes + byteSize <= maxBytes) {
          items.push({
            filePath: safePath,
            relativePath: relPath,
            content,
            reason: 'keyword_match',
            score: data.matches * 10,
            byteSize,
            estimatedTokens: tokens,
          });
          visitedPaths.add(relPath.toLowerCase());
          currentBytes += byteSize;
          currentTokens += tokens;
        } else {
          omittedFiles.push(relPath);
        }
      } catch {
        omittedFiles.push(relPath);
      }
    }

    // 4. Compact project summary
    const tree = this.workspaceService.getFileTree(workspaceRoot, 2);
    const topEntries = tree.children?.map((c) => (c.isDirectory ? `${c.name}/` : c.name)).join(', ') || 'empty';
    const projectSummary = `Repository overview: [${topEntries}]. Identified ${items.length} relevant file(s).`;

    return {
      taskId,
      sessionId,
      projectSummary,
      projectInstructions: projectInstructions.trim() || undefined,
      items,
      omittedFiles,
      totalBytes: currentBytes,
      totalEstimatedTokens: currentTokens,
      generatedAt: Date.now(),
    };
  }
}

export const globalContextEngine = new ContextEngine();
