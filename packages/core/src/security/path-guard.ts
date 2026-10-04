import fs from 'node:fs';
import path from 'node:path';
import { PathTraversalError, SecurityViolationError } from '../errors/nexus-error.js';

// Windows drive letter / path normalizer
export function normalizeStandardPath(p: string): string {
  let resolved = path.resolve(p);
  // Strip Windows extended-length prefix if present (\\?\)
  if (resolved.startsWith('\\\\?\\')) {
    resolved = resolved.slice(4);
  }
  // Normalize drive letter casing on Windows to lowercase for strict comparison
  return process.platform === 'win32'
    ? resolved.replace(/^([a-zA-Z]):/, (_, drive) => `${drive.toLowerCase()}:`)
    : resolved;
}

/**
 * Validates that an existing path or the ancestor of a path to be created
 * does not resolve through symlinks/junctions outside the workspace boundary.
 */
function verifyNoSymlinkEscape(normalizedRoot: string, resolvedTarget: string, originalPath: string): void {
  let canonicalRoot: string;
  try {
    const realRoot = fs.realpathSync.native ? fs.realpathSync.native(normalizedRoot) : fs.realpathSync(normalizedRoot);
    canonicalRoot = normalizeStandardPath(realRoot);
  } catch {
    canonicalRoot = normalizedRoot;
  }

  // 1. If target file/dir exists on disk, check its real canonical path
  if (fs.existsSync(resolvedTarget)) {
    try {
      const realTarget = fs.realpathSync.native ? fs.realpathSync.native(resolvedTarget) : fs.realpathSync(resolvedTarget);
      const canonicalTarget = normalizeStandardPath(realTarget);
      const isDirect = canonicalTarget === canonicalRoot;
      const isSub = canonicalTarget.startsWith(canonicalRoot + path.sep);
      if (!isDirect && !isSub) {
        throw new PathTraversalError(`Symlink target points outside workspace boundary: '${originalPath}'`);
      }
      return;
    } catch (err: any) {
      if (err instanceof PathTraversalError || err instanceof SecurityViolationError) throw err;
    }
  }

  // 2. If target does not exist yet (e.g. creating a new file), check nearest existing ancestor directory
  let current = path.dirname(resolvedTarget);
  while (current.length >= normalizedRoot.length) {
    if (fs.existsSync(current)) {
      try {
        const realDir = fs.realpathSync.native ? fs.realpathSync.native(current) : fs.realpathSync(current);
        const canonicalDir = normalizeStandardPath(realDir);
        const isDirDirect = canonicalDir === canonicalRoot;
        const isDirSub = canonicalDir.startsWith(canonicalRoot + path.sep);
        if (!isDirDirect && !isDirSub) {
          throw new PathTraversalError(`Directory points outside workspace boundary via symlink: '${originalPath}'`);
        }
      } catch (err: any) {
        if (err instanceof PathTraversalError || err instanceof SecurityViolationError) throw err;
      }
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

/**
 * Validates and safely resolves a relative or absolute path against a workspace root.
 * Guarantees that the resulting path cannot escape the workspace root via ../, null bytes, or symlinks.
 * Throws PathTraversalError or SecurityViolationError if an escape attempt is detected.
 */
export function resolveSafePath(
  workspaceRoot: string,
  targetPath: string,
  options?: { checkSymlinks?: boolean }
): string {
  if (!workspaceRoot || typeof workspaceRoot !== 'string') {
    throw new SecurityViolationError('Invalid workspace root directory');
  }
  if (!targetPath || typeof targetPath !== 'string') {
    throw new SecurityViolationError('Invalid target file path');
  }

  // Reject paths containing null bytes
  if (targetPath.indexOf('\0') !== -1) {
    throw new SecurityViolationError('Path contains forbidden null byte character');
  }

  const normalizedRoot = normalizeStandardPath(workspaceRoot);
  let resolvedTarget: string;

  if (path.isAbsolute(targetPath)) {
    resolvedTarget = normalizeStandardPath(targetPath);
  } else {
    resolvedTarget = normalizeStandardPath(path.join(normalizedRoot, targetPath));
  }

  // Ensure resolvedTarget starts with normalizedRoot + separator or equals normalizedRoot
  const isDirectMatch = resolvedTarget === normalizedRoot;
  const isSubPath = resolvedTarget.startsWith(normalizedRoot + path.sep);

  if (!isDirectMatch && !isSubPath) {
    throw new PathTraversalError(targetPath);
  }

  // Verify symlink target boundary if enabled (default: true)
  const checkSymlinks = options?.checkSymlinks ?? true;
  if (checkSymlinks) {
    verifyNoSymlinkEscape(normalizedRoot, resolvedTarget, targetPath);
  }

  return resolvedTarget;
}

/**
 * Computes a relative path from workspace root, ensuring it is safe and clean.
 */
export function getSafeRelativePath(workspaceRoot: string, absolutePath: string): string {
  const safeAbsolute = resolveSafePath(workspaceRoot, absolutePath);
  const normalizedRoot = normalizeStandardPath(workspaceRoot);
  const rel = path.relative(normalizedRoot, safeAbsolute);
  return rel.replace(/\\/g, '/');
}

