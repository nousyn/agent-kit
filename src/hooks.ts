import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AGENT_REGISTRY } from './types.js';
import type { AgentType, HookInstallResult } from './types.js';
import type { IntentType, RawHookRegistration } from './hook-types.js';
import { getIntents, getRawHooks, getExtendHooks } from './hook-registry.js';
import { checkAllDegradation } from './hook-capabilities.js';
import { ClaudeCodeTranslator } from './hook-translators/claude-code.js';
import { OpenCodeTranslator } from './hook-translators/opencode.js';
import { OpenClawTranslator } from './hook-translators/openclaw.js';
import type { AgentHookTranslator } from './hook-translators/types.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Translator factory
// ---------------------------------------------------------------------------

function getTranslator(agent: AgentType): AgentHookTranslator {
    switch (agent) {
        case 'claude-code':
            return new ClaudeCodeTranslator('claude-code');
        case 'codex':
            return new ClaudeCodeTranslator('codex');
        case 'opencode':
            return new OpenCodeTranslator();
        case 'openclaw':
            return new OpenClawTranslator();
    }
}

// ---------------------------------------------------------------------------
// installHooks — main entry point
// ---------------------------------------------------------------------------

/**
 * Install hooks for the given agent type.
 *
 * Reads all registered intents, raw hooks, and extend hooks from the hook
 * registry. Translates them into native hook files using the agent-specific
 * translator. Runs degradation checks and conflict detection.
 *
 * @internal — called by the Kit object returned from createKit().
 */
export async function installHooks(name: string, agent: AgentType): Promise<HookInstallResult> {
    const home = os.homedir();
    const entry = AGENT_REGISTRY[agent];
    const hookDir = entry.getHookDir(home, name);

    const result: HookInstallResult = {
        success: false,
        hookDir,
        filesWritten: [],
        settingsUpdated: false,
        notes: [],
        warnings: [],
        skipped: [],
    };

    const intents = getIntents();
    const rawHooks = getRawHooks();
    const extendHooks = getExtendHooks();

    // Check if there's anything to install
    if (intents.length === 0 && rawHooks.size === 0 && extendHooks.size === 0) {
        result.error =
            'No hooks registered. Use hooks.inject(), hooks.beforeToolCall(), etc. to declare hook behavior.';
        return result;
    }

    try {
        // Step 1: Run degradation checks
        const intentTypes = [...new Set(intents.map((i) => i.type))] as IntentType[];
        const degradations = checkAllDegradation(agent, intentTypes);
        for (const d of degradations) {
            if (d.level === 'unsupported') {
                result.warnings.push(d.message);
            } else if (d.level === 'partial') {
                result.warnings.push(d.message);
            }
        }

        // Step 2: Filter raw/extend hooks for this agent
        const agentRawHooks = new Map<string, RawHookRegistration>();
        for (const [key, reg] of rawHooks) {
            if (key.startsWith(`${agent}::`)) {
                agentRawHooks.set(key, reg);
            }
        }

        const agentExtendHooks = new Map<string, readonly import('./hook-types.js').ExtendHookRegistration[]>();
        for (const [key, regs] of extendHooks) {
            if (key.startsWith(`${agent}::`)) {
                agentExtendHooks.set(key, regs);
            }
        }

        // Step 3: Translate intents → native files
        const translator = getTranslator(agent);
        const translation = translator.translate(intents, agentRawHooks, agentExtendHooks, name);

        // Merge translation warnings and skipped
        result.warnings.push(...translation.warnings);
        result.skipped.push(...translation.skipped);

        // Step 4: Write hook files
        if (Object.keys(translation.files).length === 0) {
            result.notes.push('No hook files generated for this agent.');
            result.success = true;
            return result;
        }

        await fs.mkdir(hookDir, { recursive: true });

        for (const [fileName, content] of Object.entries(translation.files)) {
            const filePath = path.join(hookDir, fileName);
            await fs.writeFile(filePath, content, 'utf-8');

            if (fileName.endsWith('.sh')) {
                await fs.chmod(filePath, 0o755);
            }

            result.filesWritten.push(filePath);
        }

        // Step 5: Merge settings.json for agents that need it (Claude Code / Codex)
        if (entry.getSettingsPath) {
            const settingsPath = entry.getSettingsPath(home);
            const shellFiles = Object.keys(translation.files).filter((f) => f.endsWith('.sh'));

            if (shellFiles.length > 0) {
                await mergeHookSettings(settingsPath, hookDir, shellFiles, name);
                result.settingsUpdated = true;
            }
        }

        // Step 6: Agent-specific post-install
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
    const home = os.homedir();
    const entry = AGENT_REGISTRY[agent];
    const hookDir = entry.getHookDir(home, name);

    const removed: string[] = [];

    try {
        // Remove hook directory
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
        if (entry.getSettingsPath) {
            const settingsPath = entry.getSettingsPath(home);
            await cleanHookSettings(settingsPath, name);
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
    const home = os.homedir();
    const entry = AGENT_REGISTRY[agent];
    const hookDir = entry.getHookDir(home, name);

    try {
        const files = await fs.readdir(hookDir);
        return files.length > 0;
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Settings merge (Claude Code / Codex)
// ---------------------------------------------------------------------------

/**
 * Merge hook entries into settings.json for Claude Code / Codex.
 * Maps each shell script to its corresponding native hook event based on filename conventions.
 */
async function mergeHookSettings(
    settingsPath: string,
    hookDir: string,
    shellFiles: string[],
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

    // Map filename patterns to native hook events
    const fileToEvent: Record<string, string> = {
        inject: 'UserPromptSubmit',
        'session-start': 'SessionStart',
        'session-end': 'SessionEnd',
        compaction: 'PreCompact',
        'before-tool': 'PreToolUse',
        'after-tool': 'PostToolUse',
        'on-session-start': 'SessionStart',
        'on-session-end': 'SessionEnd',
        permission: 'PermissionRequest',
    };

    for (const fileName of shellFiles) {
        const activatorPath = path.join(hookDir, fileName);

        // Determine the event from filename
        let event: string | undefined;

        // Check raw hooks first (pattern: toolName-raw-hookname.sh)
        const rawMatch = fileName.match(/^.+-raw-(.+)\.sh$/);
        if (rawMatch) {
            // Raw hooks use the hook name directly (case-insensitive lookup)
            event = rawMatch[1].charAt(0).toUpperCase() + rawMatch[1].slice(1);
        } else {
            // Intent-generated hooks use filename conventions
            for (const [pattern, hookEvent] of Object.entries(fileToEvent)) {
                if (fileName.includes(pattern)) {
                    event = hookEvent;
                    break;
                }
            }
        }

        if (!event) continue;

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
