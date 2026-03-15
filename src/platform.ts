import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ResolvedKitConfig, ScopeOptions } from './types.js';

const execFileAsync = promisify(execFile);

const PROJECT_ROOT_MARKERS = ['.git', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod'];

/**
 * Get platform-appropriate data directory path.
 *
 * - global: follows platform conventions (macOS ~/Library/Application Support, Linux XDG, Windows APPDATA)
 * - project: `<projectRoot>/.<name>` (or custom dir name)
 *
 * @internal — called by the Kit object returned from createKit().
 */
export function getDataDir(config: ResolvedKitConfig, options?: ScopeOptions): string {
    const scope = options?.scope ?? 'global';

    if (scope === 'project') {
        if (!options?.projectRoot) {
            throw new Error('getDataDir: projectRoot is required when scope is "project".');
        }
        const dirName = config.dirs?.project ?? `.${config.name}`;
        return path.join(options.projectRoot, dirName);
    }

    // Global scope
    const envVar = config.envOverride ?? `${config.name.toUpperCase().replace(/-/g, '_')}_DATA_DIR`;
    const envDir = process.env[envVar];
    if (envDir) return envDir;

    const dirName = config.dirs?.global ?? config.name;
    const home = os.homedir();
    const platform = process.platform;

    switch (platform) {
        case 'darwin':
            return path.join(home, 'Library', 'Application Support', dirName);
        case 'win32':
            return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), dirName);
        default:
            return path.join(process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'), dirName);
    }
}

/**
 * Detect project root directory.
 *
 * Resolution order: git root > project marker files (.git, package.json, etc.) > cwd fallback.
 * This is an independent function — does not require createKit().
 */
export async function detectProjectRoot(cwd?: string): Promise<string> {
    const startDir = cwd ?? process.cwd();

    // Try git root first
    try {
        const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd: startDir });
        const gitRoot = stdout.trim();
        if (gitRoot) return gitRoot;
    } catch {
        // Not a git repo or git not available
    }

    // Walk up looking for project markers
    let current = path.resolve(startDir);
    while (true) {
        for (const marker of PROJECT_ROOT_MARKERS) {
            try {
                await fs.access(path.join(current, marker));
                return current;
            } catch {
                continue;
            }
        }

        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }

    return path.resolve(startDir);
}
