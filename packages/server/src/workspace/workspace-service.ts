import fs from 'node:fs';
import path from 'node:path';
import {
  FileMetadata,
  ListFilesOutput,
  SearchFilesOutput,
  SearchMatchItem,
  WorkspaceError,
  WorkspaceInfo,
  WorkspaceTreeNode,
  resolveSafePath,
  getSafeRelativePath,
  DEFAULT_TOOL_CONFIG,
  logger,
} from '@nexus/core';
import { StorageEngine, globalStorage } from '../storage/storage-engine.js';
import { globalFileCache } from '../cache/file-cache.js';

// Files and directories to ignore by default in file trees and broad searches
const DEFAULT_IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.cache',
  '.next',
  '.turbo',
  'coverage',
  'NEXUS_AI_DATA',
]);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.pdf', '.exe',
  '.dll', '.zip', '.tar', '.gz', '.7z', '.bin', '.iso', '.mp3',
  '.mp4', '.mov', '.avi', '.woff', '.woff2', '.ttf', '.eot', '.wasm'
]);

export class WorkspaceService {
  private storage: StorageEngine;

  constructor(storage: StorageEngine = globalStorage) {
    this.storage = storage;
  }

  /**
   * Validates and registers a workspace path.
   */
  openWorkspace(targetPath: string): WorkspaceInfo {
    if (!targetPath || typeof targetPath !== 'string') {
      throw new WorkspaceError('Target workspace path must be specified');
    }

    const resolved = path.resolve(targetPath);
    if (!fs.existsSync(resolved)) {
      throw new WorkspaceError(`Workspace directory not found: ${resolved}`, 'WORKSPACE_NOT_FOUND', 404);
    }

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      throw new WorkspaceError(`Target path is not a directory: ${resolved}`);
    }

    const workspace: WorkspaceInfo = {
      id: `ws_${Buffer.from(resolved).toString('base64url').slice(0, 16)}`,
      name: path.basename(resolved) || resolved,
      path: resolved,
      createdAt: Date.now(),
      lastOpenedAt: Date.now(),
    };

    this.storage.saveWorkspace(workspace);
    return workspace;
  }

  getRecentWorkspaces(): WorkspaceInfo[] {
    return this.storage.getWorkspaces();
  }

  getCurrentWorkspace(): WorkspaceInfo | null {
    const list = this.getRecentWorkspaces();
    return list.length > 0 ? list[0] : null;
  }

  /**
   * Generates a recursive file tree node structure.
   */
  getFileTree(workspaceRoot: string, maxDepth = 6): WorkspaceTreeNode {
    const rootPath = resolveSafePath(workspaceRoot, '.');

    function buildNode(currentPath: string, depth: number): WorkspaceTreeNode {
      const relPath = getSafeRelativePath(rootPath, currentPath);
      const name = path.basename(currentPath) || currentPath;
      const stat = fs.statSync(currentPath);

      if (!stat.isDirectory()) {
        return {
          name,
          path: currentPath,
          relativePath: relPath,
          isDirectory: false,
          size: stat.size,
        };
      }

      const node: WorkspaceTreeNode = {
        name,
        path: currentPath,
        relativePath: relPath,
        isDirectory: true,
        children: [],
      };

      if (depth >= maxDepth) {
        return node;
      }

      try {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        for (const entry of entries) {
          if (DEFAULT_IGNORED_DIRS.has(entry.name)) continue;

          const entryPath = path.join(currentPath, entry.name);
          node.children?.push(buildNode(entryPath, depth + 1));
        }

        // Sort: directories first, then alphabetical
        node.children?.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
      } catch (err) {
        logger.warn(`Could not read directory contents at ${currentPath}`, err);
      }

      return node;
    }

    return buildNode(rootPath, 0);
  }

  /**
   * Retrieves metadata for a file or directory.
   */
  getFileMetadata(workspaceRoot: string, targetPath: string): FileMetadata {
    const safePath = resolveSafePath(workspaceRoot, targetPath);
    if (!fs.existsSync(safePath)) {
      throw new WorkspaceError(`File not found: ${targetPath}`, 'WORKSPACE_ERROR', 404);
    }

    const stat = fs.statSync(safePath);
    const relPath = getSafeRelativePath(workspaceRoot, safePath);
    const ext = path.extname(safePath).toLowerCase();

    return {
      path: safePath,
      relativePath: relPath,
      name: path.basename(safePath),
      extension: ext,
      sizeBytes: stat.size,
      createdAt: stat.birthtimeMs,
      modifiedAt: stat.mtimeMs,
      isDirectory: stat.isDirectory(),
      isBinary: BINARY_EXTENSIONS.has(ext),
    };
  }

  /**
   * Safely reads content of a text file within workspace boundaries.
   */
  readFileContent(
    workspaceRoot: string,
    targetPath: string,
    startLine?: number,
    endLine?: number
  ): { content: string; totalLines: number; startLine: number; endLine: number; relativePath: string } {
    const safePath = resolveSafePath(workspaceRoot, targetPath);
    if (!fs.existsSync(safePath)) {
      throw new WorkspaceError(`File not found: ${targetPath}`, 'WORKSPACE_ERROR', 404);
    }

    const stat = fs.statSync(safePath);
    if (stat.isDirectory()) {
      throw new WorkspaceError(`Target path is a directory, not a file: ${targetPath}`);
    }

    const ext = path.extname(safePath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      throw new WorkspaceError(`Cannot read binary file as text: ${targetPath}`);
    }

    if (stat.size > DEFAULT_TOOL_CONFIG.maxFileSizeReadBytes) {
      throw new WorkspaceError(
        `File size (${Math.round(stat.size / 1024)} KB) exceeds safety limit of ${Math.round(DEFAULT_TOOL_CONFIG.maxFileSizeReadBytes / 1024)} KB`
      );
    }

    const raw = globalFileCache.readFile(safePath).content;
    const lines = raw.split(/\r?\n/);
    const totalLines = lines.length;

    const sLine = Math.max(1, startLine ?? 1);
    const eLine = Math.min(totalLines, endLine ?? totalLines);

    const slice = lines.slice(sLine - 1, eLine).join('\n');
    const relPath = getSafeRelativePath(workspaceRoot, safePath);

    return {
      content: slice,
      totalLines,
      startLine: sLine,
      endLine: eLine,
      relativePath: relPath,
    };
  }

  /**
   * Searches for text across text files in the workspace.
   */
  searchFiles(
    workspaceRoot: string,
    query: string,
    filePattern?: string,
    maxMatches = DEFAULT_TOOL_CONFIG.maxSearchMatches
  ): SearchFilesOutput {
    if (!query || typeof query !== 'string') {
      throw new WorkspaceError('Search query must be a non-empty string');
    }

    const rootPath = resolveSafePath(workspaceRoot, '.');
    const matches: SearchMatchItem[] = [];
    const lowerQuery = query.toLowerCase();

    function searchDir(currentDir: string): boolean {
      if (matches.length >= maxMatches) return true; // Stop early if limit reached

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return false;
      }

      for (const entry of entries) {
        if (matches.length >= maxMatches) break;
        if (DEFAULT_IGNORED_DIRS.has(entry.name)) continue;

        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          const reachedLimit = searchDir(fullPath);
          if (reachedLimit) return true;
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (BINARY_EXTENSIONS.has(ext)) continue;

          if (filePattern && !entry.name.includes(filePattern)) {
            continue;
          }

          try {
            const stat = fs.statSync(fullPath);
            if (stat.size > DEFAULT_TOOL_CONFIG.maxFileSizeReadBytes) continue;

            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split(/\r?\n/);
            const relPath = getSafeRelativePath(rootPath, fullPath);

            for (let i = 0; i < lines.length; i++) {
              if (matches.length >= maxMatches) break;
              if (lines[i].toLowerCase().includes(lowerQuery)) {
                matches.push({
                  filePath: relPath,
                  lineNumber: i + 1,
                  lineContent: lines[i].trim(),
                });
              }
            }
          } catch {
            // Skip unreadable files
          }
        }
      }

      return matches.length >= maxMatches;
    }

    searchDir(rootPath);

    return {
      query,
      matches,
      totalMatches: matches.length,
      truncated: matches.length >= maxMatches,
    };
  }
}

export const globalWorkspaceService = new WorkspaceService();
