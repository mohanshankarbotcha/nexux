import fs from 'node:fs';
import path from 'node:path';
import { ProjectProfile, logger, resolveSafePath } from '@nexus/core';

export class ProjectProfileManager {
  private inMemoryCache = new Map<string, { profile: ProjectProfile; mtimeMs: number }>();

  /**
   * Discovers and retrieves the project profile for a workspace.
   * If .nexus/project.json is present and up to date, it is read directly.
   */
  async getProfile(workspaceRoot: string): Promise<ProjectProfile> {
    const normRoot = path.resolve(workspaceRoot);
    const nexusDir = path.join(normRoot, '.nexus');
    const profileFile = path.join(nexusDir, 'project.json');

    // Check if .nexus/project.json exists
    if (fs.existsSync(profileFile)) {
      try {
        const fileStat = fs.statSync(profileFile);
        const cached = this.inMemoryCache.get(normRoot);
        if (cached && cached.mtimeMs === fileStat.mtimeMs) {
          return cached.profile;
        }

        const raw = fs.readFileSync(profileFile, 'utf-8');
        const parsed = JSON.parse(raw) as ProjectProfile;
        if (parsed.language && parsed.packageManager) {
          this.inMemoryCache.set(normRoot, { profile: parsed, mtimeMs: fileStat.mtimeMs });
          return parsed;
        }
      } catch (err: any) {
        logger.warn(`ProjectProfileManager: Error reading .nexus/project.json: ${err.message}`);
      }
    }

    // Discover from repository inspection
    const discovered = await this.discoverProfile(normRoot);
    await this.persistProfile(normRoot, discovered);
    return discovered;
  }

  /**
   * Updates specific fields of the project profile (e.g. learned test or build commands).
   */
  async updateProfile(workspaceRoot: string, updates: Partial<ProjectProfile>): Promise<ProjectProfile> {
    const current = await this.getProfile(workspaceRoot);
    const updated: ProjectProfile = {
      ...current,
      ...updates,
      scripts: { ...current.scripts, ...(updates.scripts || {}) },
      detectedAt: Date.now(),
    };
    await this.persistProfile(workspaceRoot, updated);
    return updated;
  }

  /**
   * Clears in-memory cache.
   */
  clearCache(workspaceRoot?: string): void {
    if (workspaceRoot) {
      this.inMemoryCache.delete(path.resolve(workspaceRoot));
    } else {
      this.inMemoryCache.clear();
    }
  }

  /**
   * Automatically discovers package manager, language, and commands from project manifests.
   */
  private async discoverProfile(workspaceRoot: string): Promise<ProjectProfile> {
    let packageManager: ProjectProfile['packageManager'] = 'unknown';
    let language: ProjectProfile['language'] = 'unknown';
    const scripts: Record<string, string> = {};
    let testCommand: string | undefined;
    let buildCommand: string | undefined;
    let runCommand: string | undefined;

    const pkgJsonPath = path.join(workspaceRoot, 'package.json');
    const pnpmLockPath = path.join(workspaceRoot, 'pnpm-lock.yaml');
    const yarnLockPath = path.join(workspaceRoot, 'yarn.lock');
    const bunLockPath = path.join(workspaceRoot, 'bun.lockb');
    const pyprojectPath = path.join(workspaceRoot, 'pyproject.toml');
    const requirementsPath = path.join(workspaceRoot, 'requirements.txt');
    const cargoPath = path.join(workspaceRoot, 'Cargo.toml');
    const goModPath = path.join(workspaceRoot, 'go.mod');

    // 1. Node.js / JavaScript / TypeScript detection
    if (fs.existsSync(pkgJsonPath)) {
      if (fs.existsSync(pnpmLockPath)) packageManager = 'pnpm';
      else if (fs.existsSync(yarnLockPath)) packageManager = 'yarn';
      else if (fs.existsSync(bunLockPath)) packageManager = 'bun';
      else packageManager = 'npm';

      language = 'javascript';
      const tsconfigPath = path.join(workspaceRoot, 'tsconfig.json');
      if (fs.existsSync(tsconfigPath)) {
        language = 'typescript';
      }

      try {
        const pkgContent = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        if (pkgContent.scripts && typeof pkgContent.scripts === 'object') {
          Object.assign(scripts, pkgContent.scripts);
          if (scripts['test']) {
            testCommand = `${packageManager} test`;
          }
          if (scripts['build']) {
            buildCommand = `${packageManager} run build`;
          }
          if (scripts['start']) {
            runCommand = `${packageManager} start`;
          } else if (scripts['dev']) {
            runCommand = `${packageManager} run dev`;
          }
        }
      } catch (err: any) {
        logger.warn(`ProjectProfileManager: Error parsing package.json: ${err.message}`);
      }
    }
    // 2. Python detection
    else if (fs.existsSync(pyprojectPath) || fs.existsSync(requirementsPath)) {
      language = 'python';
      packageManager = 'pip';
      testCommand = 'pytest';
      runCommand = 'python main.py';
    }
    // 3. Rust detection
    else if (fs.existsSync(cargoPath)) {
      language = 'rust';
      packageManager = 'cargo';
      testCommand = 'cargo test';
      buildCommand = 'cargo build';
      runCommand = 'cargo run';
    }
    // 4. Go detection
    else if (fs.existsSync(goModPath)) {
      language = 'go';
      packageManager = 'go';
      testCommand = 'go test ./...';
      buildCommand = 'go build';
      runCommand = 'go run .';
    }
    // 5. Fallback inspection by file extensions
    else {
      try {
        const files = fs.readdirSync(workspaceRoot);
        if (files.some((f) => f.endsWith('.py'))) {
          language = 'python';
          testCommand = 'pytest';
        } else if (files.some((f) => f.endsWith('.ts'))) {
          language = 'typescript';
        } else if (files.some((f) => f.endsWith('.html'))) {
          language = 'html';
        }
      } catch {}
    }

    return {
      packageManager,
      language,
      scripts,
      testCommand,
      buildCommand,
      runCommand,
      detectedAt: Date.now(),
    };
  }

  /**
   * Persists project profile to .nexus/project.json
   */
  private async persistProfile(workspaceRoot: string, profile: ProjectProfile): Promise<void> {
    const normRoot = path.resolve(workspaceRoot);
    const nexusDir = path.join(normRoot, '.nexus');
    const profileFile = path.join(nexusDir, 'project.json');

    try {
      if (!fs.existsSync(nexusDir)) {
        fs.mkdirSync(nexusDir, { recursive: true });
      }
      fs.writeFileSync(profileFile, JSON.stringify(profile, null, 2), 'utf-8');
      const stat = fs.statSync(profileFile);
      this.inMemoryCache.set(normRoot, { profile, mtimeMs: stat.mtimeMs });
    } catch (err: any) {
      logger.warn(`ProjectProfileManager: Failed to persist .nexus/project.json: ${err.message}`);
    }
  }
}

export const globalProjectProfileManager = new ProjectProfileManager();
