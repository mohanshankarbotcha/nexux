import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeStandardPath,
  resolveSafePath,
  getSafeRelativePath,
} from './path-guard.js';
import { PathResolutionResult } from '../types/tool.js';
import { PathTraversalError } from '../errors/nexus-error.js';

export interface PathResolverOptions {
  maxDepth?: number;
  maxCandidates?: number;
}

/**
 * Normalizes colloquial phrases like "the demo folder", "in src directory", etc.
 */
export function cleanColloquialPhrase(phrase: string): string {
  if (!phrase || typeof phrase !== 'string') return '';
  let cleaned = phrase.trim();

  // Strip wrapping quotes
  cleaned = cleaned.replace(/^["'`]|["'`]$/g, '').trim();

  // Strip conversational lead-ins
  cleaned = cleaned.replace(/^(go to|open|read|check|show me|look into|in)\s+/i, '');
  cleaned = cleaned.replace(/^(the|a|an)\s+/i, '');

  // Strip trailing descriptors
  cleaned = cleaned.replace(/\s+(folder|directory|dir|file|repo|workspace)$/i, '');

  // Clean remaining whitespace or slashes
  return cleaned.trim();
}

/**
 * Resolves a colloquial or literal path input against a workspace root with
 * exact, case-insensitive, and bounded fuzzy search.
 */
export function resolveWorkspacePath(
  workspaceRoot: string,
  inputPhrase: string,
  options?: PathResolverOptions
): PathResolutionResult {
  const maxDepth = options?.maxDepth ?? 3;
  const maxCandidates = options?.maxCandidates ?? 10;

  if (!inputPhrase || typeof inputPhrase !== 'string' || inputPhrase.trim().length === 0) {
    return {
      status: 'notFound',
      targetInput: inputPhrase,
      reason: 'Empty path input provided',
    };
  }

  const cleaned = cleanColloquialPhrase(inputPhrase);
  if (!cleaned) {
    return {
      status: 'notFound',
      targetInput: inputPhrase,
      reason: 'Could not extract valid file or directory name from phrase',
    };
  }

  // 1. Check direct resolution (exact match or relative to workspace root)
  try {
    const directResolved = resolveSafePath(workspaceRoot, cleaned);
    if (fs.existsSync(directResolved)) {
      return {
        status: 'resolved',
        targetInput: inputPhrase,
        resolvedPath: directResolved,
        relativePath: getSafeRelativePath(workspaceRoot, directResolved),
      };
    }
  } catch (err: any) {
    if (err instanceof PathTraversalError) {
      return {
        status: 'outsideWorkspace',
        targetInput: inputPhrase,
        reason: `Target path '${cleaned}' resolves outside the authorized workspace boundary.`,
      };
    }
  }

  // 2. Scan workspace up to maxDepth collecting entries
  const normalizedRoot = normalizeStandardPath(workspaceRoot);
  const foundEntries: Array<{ fullPath: string; relPath: string; name: string }> = [];

  function scanDir(currentDir: string, currentDepth: number) {
    if (currentDepth > maxDepth || foundEntries.length >= 500) return;
    try {
      const items = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const item of items) {
        if (item.name === '.git' || item.name === 'node_modules' || item.name === '.nexus') {
          continue;
        }
        const full = path.join(currentDir, item.name);
        const rel = path.relative(normalizedRoot, full).replace(/\\/g, '/');
        foundEntries.push({ fullPath: full, relPath: rel, name: item.name });

        if (item.isDirectory()) {
          scanDir(full, currentDepth + 1);
        }
      }
    } catch {}
  }

  scanDir(normalizedRoot, 1);

  // 3. Case-insensitive exact match
  const lowerCleaned = cleaned.toLowerCase().replace(/\\/g, '/');
  const exactCaseMatches = foundEntries.filter(
    (e) =>
      e.relPath.toLowerCase() === lowerCleaned ||
      e.name.toLowerCase() === lowerCleaned
  );

  if (exactCaseMatches.length === 1) {
    const match = exactCaseMatches[0];
    return {
      status: 'resolved',
      targetInput: inputPhrase,
      resolvedPath: match.fullPath,
      relativePath: match.relPath,
    };
  }

  if (exactCaseMatches.length > 1) {
    return {
      status: 'ambiguous',
      targetInput: inputPhrase,
      candidates: exactCaseMatches.map((m) => m.relPath).slice(0, maxCandidates),
      reason: `Multiple items match '${cleaned}' case-insensitively.`,
    };
  }

  // 4. Bounded fuzzy / partial substring match
  const partialMatches = foundEntries.filter(
    (e) =>
      e.relPath.toLowerCase().includes(lowerCleaned) ||
      e.name.toLowerCase().includes(lowerCleaned)
  );

  if (partialMatches.length === 1) {
    const match = partialMatches[0];
    return {
      status: 'resolved',
      targetInput: inputPhrase,
      resolvedPath: match.fullPath,
      relativePath: match.relPath,
      candidates: [match.relPath],
    };
  }

  if (partialMatches.length > 1) {
    return {
      status: 'ambiguous',
      targetInput: inputPhrase,
      candidates: partialMatches.map((m) => m.relPath).slice(0, maxCandidates),
      reason: `Multiple items partially match '${cleaned}'. Please specify the exact path.`,
    };
  }

  return {
    status: 'notFound',
    targetInput: inputPhrase,
    reason: `No file or directory matching '${inputPhrase}' found in workspace.`,
  };
}
