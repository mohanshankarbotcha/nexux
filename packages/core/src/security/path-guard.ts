import path from 'node:path';
import { PathTraversalError, SecurityViolationError } from '../errors/nexus-error.js';

// Windows drive letter / path normalizer
export function normalizeStandardPath(p: string): string {
  const resolved = path.resolve(p);
  // Normalize drive letter casing on Windows to lowercase for strict comparison
  return process.platform === 'win32'
    ? resolved.replace(/^([a-zA-Z]):/, (_, drive) => `${drive.toLowerCase()}:`)
    : resolved;
}

/**
 * Validates and safely resolves a relative or absolute path against a workspace root.
 * Guarantees that the resulting path cannot escape the workspace root.
 * Throws PathTraversalError if an escape attempt is detected.
 */
export function resolveSafePath(workspaceRoot: string, targetPath: string): string {
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
