import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveAgentPaths } from './paths.js';
import type { AgentType, HookDefinition, HookInstallResult, HookSet } from './types.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// installHooks — write hook files to disk
// ---------------------------------------------------------------------------

/**
 * Install hooks for the given agent type.
 *
 * Accepts one or more HookSet (from defineHooks()). Filters to only those
 * matching the target agent. Writes content to the agent's hook directory.
 *
 * For Claude Code / Codex: writes shell scripts, merges into settings.json.
 * For OpenCode: writes TypeScript plugin files directly to plugins dir.
 * For OpenClaw: writes HOOK.md + handler.ts, attempts CLI activation.
 *
 * @internal — called by the Kit object returned from createKit().
 */
export async function installHooks(
    name: string,
    agent: AgentType,
    hookSets: HookSet | HookSet[],
): Promise<HookInstallResult> {
    const paths = resolveAgentPaths(agent, name);
    const hookDir = paths.hookDir!;

    const result: HookInstallResult = {
        success: false,
        hookDir,
        filesWritten: [],
        settingsUpdated: false,
        notes: [],
        warnings: [],
    };

    // Normalize and filter to matching agent
    const sets = (Array.isArray(hookSets) ? hookSets : [hookSets]).filter((s) => s.agent === agent);

    if (sets.length === 0) {
        result.error = `No hook definitions found for agent "${agent}".`;
        return result;
    }

    // Collect all definitions from matching sets
    const allDefs: HookDefinition[] = [];
    for (const set of sets) {
        allDefs.push(...set.definitions);
    }

    try {
        // Generate files based on agent type
        const files: Record<string, string> = {};

        switch (agent) {
            case 'claude-code':
            case 'codex':
                generateClaudeCodeFiles(files, allDefs, name);
                break;
            case 'opencode':
                generateOpenCodeFiles(files, allDefs, name);
                break;
            case 'openclaw':
                generateOpenClawFiles(files, allDefs, name);
                break;
        }

        if (Object.keys(files).length === 0) {
            result.notes.push('No hook files generated.');
            result.success = true;
            return result;
        }

        // Write files
        await fs.mkdir(hookDir, { recursive: true });

        for (const [fileName, content] of Object.entries(files)) {
            const filePath = path.join(hookDir, fileName);
            await fs.writeFile(filePath, content, 'utf-8');

            if (fileName.endsWith('.sh')) {
                await fs.chmod(filePath, 0o755);
            }

            result.filesWritten.push(filePath);
        }

        // Merge settings.json for Claude Code / Codex
        if (paths.settingsFile) {
            const shellFiles = Object.keys(files).filter((f) => f.endsWith('.sh'));

            if (shellFiles.length > 0) {
                await mergeHookSettings(paths.settingsFile, hookDir, shellFiles, allDefs, name);
                result.settingsUpdated = true;
            }
        }

        // OpenClaw post-install: attempt CLI activation
        if (agent === 'openclaw') {
            try {
                await execFileAsync('openclaw', ['hooks', 'enable', name]);
                result.notes.push(`Hook activated via \`openclaw hooks enable ${name}\`.`);
            } catch {
                result.notes.push(`Run \`openclaw hooks enable ${name}\` to activate the hook.`);
            }
        }

        result.success = true;
    } catch (err) {
        result.error = err instanceof Error ? err.message : String(err);
    }

    return result;
}

// ---------------------------------------------------------------------------
// uninstallHooks
// ---------------------------------------------------------------------------

/**
 * Uninstall hooks for the given agent type.
 *
 * Removes hook files from the hook directory and cleans up settings.json
 * entries for agents that use them (Claude Code, Codex).
 *
 * @internal — called by the Kit object returned from createKit().
 */
export async function uninstallHooks(
    name: string,
    agent: AgentType,
): Promise<{ success: boolean; removed: string[]; error?: string }> {
    const paths = resolveAgentPaths(agent, name);
    const hookDir = paths.hookDir!;

    const removed: string[] = [];

    try {
        // Remove hook directory contents
        try {
            const files = await fs.readdir(hookDir);
            for (const file of files) {
                const filePath = path.join(hookDir, file);
                await fs.unlink(filePath);
                removed.push(filePath);
            }
            await fs.rmdir(hookDir);
        } catch {
            // Directory may not exist — that's fine
        }

        // Clean settings.json for Claude Code / Codex
        if (paths.settingsFile) {
            await cleanHookSettings(paths.settingsFile, name);
        }

        // Deactivate for OpenClaw
        if (agent === 'openclaw') {
            try {
                await execFileAsync('openclaw', ['hooks', 'disable', name]);
            } catch {
                // Best effort
            }
        }

        return { success: true, removed };
    } catch (err) {
        return { success: false, removed, error: err instanceof Error ? err.message : String(err) };
    }
}

// ---------------------------------------------------------------------------
// hasHooksInstalled
// ---------------------------------------------------------------------------

/**
 * Check if hooks are already installed for the given agent type.
 *
 * @internal — called by the Kit object returned from createKit().
 */
export async function hasHooksInstalled(name: string, agent: AgentType): Promise<boolean> {
    const paths = resolveAgentPaths(agent, name);
    const hookDir = paths.hookDir!;

    try {
        const files = await fs.readdir(hookDir);
        return files.length > 0;
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// File generators — per agent
// ---------------------------------------------------------------------------

/**
 * Claude Code / Codex: each definition × each event → one shell script.
 * Filename: `{toolName}-{event}.sh`
 */
function generateClaudeCodeFiles(files: Record<string, string>, defs: HookDefinition[], toolName: string): void {
    for (const def of defs) {
        for (const event of def.events) {
            const fileName = `${toolName}-${event}.sh`;
            // If multiple definitions target the same event, later ones win
            files[fileName] = def.content;
        }
    }
}

/**
 * OpenCode: each definition × each event → one TypeScript plugin file.
 * Filename: `{toolName}-{event}-plugin.ts`
 *
 * OpenCode plugins dir is flat (all in ~/.config/opencode/plugins/).
 * Content is written as-is — users provide the full plugin file content.
 */
function generateOpenCodeFiles(files: Record<string, string>, defs: HookDefinition[], toolName: string): void {
    for (const def of defs) {
        for (const event of def.events) {
            // Sanitize event name for filename (dots → dashes)
            const sanitized = event.replace(/\./g, '-');
            const fileName = `${toolName}-${sanitized}-plugin.ts`;
            files[fileName] = def.content;
        }
    }
}

/**
 * OpenClaw: generates HOOK.md (YAML frontmatter) + handler.ts.
 * Only uses the first definition (OpenClaw = one hook = one HOOK.md + handler.ts).
 */
function generateOpenClawFiles(files: Record<string, string>, defs: HookDefinition[], toolName: string): void {
    if (defs.length === 0) return;

    const def = defs[0]; // Only first definition used

    // Generate HOOK.md
    const description = def.description || `Hook installed by ${toolName}`;
    const eventsYaml = def.events.map((e) => `  - ${e}`).join('\n');

    files['HOOK.md'] = [
        '---',
        `name: ${toolName}`,
        `description: ${description}`,
        'events:',
        eventsYaml,
        '---',
        '',
    ].join('\n');

    // handler.ts — user-provided content
    files['handler.ts'] = def.content;
}

// ---------------------------------------------------------------------------
// Settings merge (Claude Code / Codex)
// ---------------------------------------------------------------------------

/**
 * Merge hook entries into settings.json for Claude Code / Codex.
 * Maps each shell script filename to its hook event via the definitions.
 */
async function mergeHookSettings(
    settingsPath: string,
    hookDir: string,
    shellFiles: string[],
    defs: HookDefinition[],
    toolName: string,
): Promise<void> {
    let settings: Record<string, unknown> = {};
    try {
        const raw = await fs.readFile(settingsPath, 'utf-8');
        settings = JSON.parse(raw) as Record<string, unknown>;
    } catch {
        // Start fresh
    }

    if (!settings.hooks || typeof settings.hooks !== 'object') {
        settings.hooks = {};
    }
    const hooks = settings.hooks as Record<string, unknown[]>;

    // Build filename → event map from definitions
    const fileToEvent = new Map<string, string>();
    for (const def of defs) {
        for (const event of def.events) {
            const fileName = `${toolName}-${event}.sh`;
            fileToEvent.set(fileName, event as string);
        }
    }

    for (const fileName of shellFiles) {
        const event = fileToEvent.get(fileName);
        if (!event) continue;

        const activatorPath = path.join(hookDir, fileName);

        const hookEntry = {
            matcher: '',
            hooks: [{ type: 'command', command: activatorPath }],
        };

        if (!Array.isArray(hooks[event])) {
            hooks[event] = [];
        }

        // Remove existing entries for this tool
        hooks[event] = hooks[event].filter((entry) => {
            if (!entry || typeof entry !== 'object') return true;
            const e = entry as Record<string, unknown>;
            if (!Array.isArray(e.hooks)) return true;
            return !e.hooks.some((h: unknown) => {
                if (!h || typeof h !== 'object') return false;
                const hook = h as Record<string, unknown>;
                return typeof hook.command === 'string' && hook.command.includes(toolName);
            });
        });

        hooks[event].push(hookEntry);
    }

    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

/**
 * Remove all hook entries for a tool from settings.json.
 */
async function cleanHookSettings(settingsPath: string, toolName: string): Promise<void> {
    let settings: Record<string, unknown>;
    try {
        const raw = await fs.readFile(settingsPath, 'utf-8');
        settings = JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return; // No settings file to clean
    }

    if (!settings.hooks || typeof settings.hooks !== 'object') return;

    const hooks = settings.hooks as Record<string, unknown[]>;
    let changed = false;

    for (const [event, entries] of Object.entries(hooks)) {
        if (!Array.isArray(entries)) continue;

        const filtered = entries.filter((entry) => {
            if (!entry || typeof entry !== 'object') return true;
            const e = entry as Record<string, unknown>;
            if (!Array.isArray(e.hooks)) return true;
            const hasToolHook = e.hooks.some((h: unknown) => {
                if (!h || typeof h !== 'object') return false;
                const hook = h as Record<string, unknown>;
                return typeof hook.command === 'string' && hook.command.includes(toolName);
            });
            return !hasToolHook;
        });

        if (filtered.length !== entries.length) {
            hooks[event] = filtered;
            changed = true;
        }

        // Remove empty event arrays
        if (filtered.length === 0) {
            delete hooks[event];
        }
    }

    // Remove empty hooks object
    if (Object.keys(hooks).length === 0) {
        delete settings.hooks;
    }

    if (changed) {
        await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    }
}
