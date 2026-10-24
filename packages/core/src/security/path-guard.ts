import fs from 'node:fs';
import path from 'node:path';
import { PathTraversalError, SecurityViolationError, ProtectedPathError } from '../errors/nexus-error.js';

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

export interface PathGuardOptions {
  checkSymlinks?: boolean;
  checkProtected?: boolean;
  allowAppRepoMutation?: boolean;
}

export interface ProtectedCheckResult {
  isProtected: boolean;
  reason?: string;
}

/**
 * Checks if a target path is a protected system, credential, or repository path under Rule R5.
 */
export function isProtectedPath(
  resolvedTarget: string,
  workspaceRoot: string,
  options?: { allowAppRepoMutation?: boolean }
): ProtectedCheckResult {
  const normTarget = normalizeStandardPath(resolvedTarget);
  const normRoot = normalizeStandardPath(workspaceRoot);
  const relPath = path.relative(normRoot, normTarget).replace(/\\/g, '/');
  const lowerRel = relPath.toLowerCase();
  const baseName = path.basename(normTarget).toLowerCase();

  // 1. App data folders (%LOCALAPPDATA%\NEXUS_AI_DATA, .nexus_data)
  const localAppData = process.env.LOCALAPPDATA ? normalizeStandardPath(process.env.LOCALAPPDATA) : '';
  if (localAppData && normTarget.toLowerCase().startsWith(path.join(localAppData, 'nexus_ai_data').toLowerCase())) {
    return {
      isProtected: true,
      reason: 'Application user data and credentials directory is strictly protected (Rule R5).',
    };
  }
  if (lowerRel.includes('.nexus_data') || lowerRel.includes('nexus_test_data')) {
    return {
      isProtected: true,
      reason: 'Application runtime data directory is protected from modification (Rule R5).',
    };
  }

  // 2. Checkpoints and evidence internals (.nexus/checkpoints, .nexus/evidence)
  if (lowerRel.startsWith('.nexus/checkpoints') || lowerRel.startsWith('.nexus/evidence')) {
    return {
      isProtected: true,
      reason: 'NEXUS.AI checkpoint snapshots and evidence ledgers are immutable (Rule R5).',
    };
  }

  // 3. Git internals (.git)
  if (lowerRel === '.git' || lowerRel.startsWith('.git/')) {
    return {
      isProtected: true,
      reason: 'Git internal repository structures (.git) cannot be modified directly (Rule R5).',
    };
  }

  // 4. Credential and secret key files
  if (
    baseName === '.env' ||
    baseName.startsWith('.env.') ||
    baseName.endsWith('.env') ||
    baseName.endsWith('.pem') ||
    baseName.endsWith('.key') ||
    baseName === 'id_rsa' ||
    baseName === 'id_ed25519' ||
    baseName === 'credentials.json' ||
    baseName.startsWith('service-account')
  ) {
    return {
      isProtected: true,
      reason: 'Credential, environment, or secret key files are protected from agent modification (Rule R5).',
    };
  }

  // 5. App repository protection: protect the host application repo itself if workspaceRoot is the app repo
  if (!options?.allowAppRepoMutation) {
    try {
      const rootPkgPath = path.join(normRoot, 'package.json');
      if (fs.existsSync(rootPkgPath)) {
        const pkgContent = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
        if (pkgContent?.name === 'nexus-ai-workspace') {
          // If workspace is the NEXUS repo itself, protect packages, node_modules, and root configs
          if (
            lowerRel.startsWith('packages/') ||
            lowerRel.startsWith('node_modules/') ||
            baseName === 'package.json' ||
            baseName === 'tsconfig.json' ||
            baseName === 'pnpm-workspace.yaml'
          ) {
            return {
              isProtected: true,
              reason: 'NEXUS.AI core application source code is protected against self-mutation without explicit developer opt-in (Rule R5).',
            };
          }
        }
      }
    } catch {}
  }

  return { isProtected: false };
}

/**
 * Validates and safely resolves a relative or absolute path against a workspace root.
 * Guarantees that the resulting path cannot escape the workspace root via ../, null bytes, or symlinks.
 * Throws PathTraversalError, SecurityViolationError, or ProtectedPathError if violation detected.
 */
export function resolveSafePath(
  workspaceRoot: string,
  targetPath: string,
  options?: PathGuardOptions
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

  // Verify protected paths if requested
  if (options?.checkProtected) {
    const protectedCheck = isProtectedPath(resolvedTarget, normalizedRoot, {
      allowAppRepoMutation: options.allowAppRepoMutation,
    });
    if (protectedCheck.isProtected) {
      throw new ProtectedPathError(targetPath, protectedCheck.reason || 'Protected file access disallowed');
    }
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
