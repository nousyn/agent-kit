import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getConfig } from './register.js';
import { AGENT_REGISTRY } from './types.js';
import type { AgentType, HookInstallResult, HookReminders } from './types.js';

const execFileAsync = promisify(execFile);

/**
 * Install hooks for the given agent type.
 * Generates hook files from registered reminders and writes them to the agent's hook directory.
 *
 * Requires register().
 */
export async function installHooks(agent: AgentType): Promise<HookInstallResult> {
    const config = getConfig();
    const home = os.homedir();
    const entry = AGENT_REGISTRY[agent];
    const hookDir = entry.getHookDir(home, config.name);

    const result: HookInstallResult = {
        success: false,
        hookDir,
        filesWritten: [],
        settingsUpdated: false,
        notes: [],
    };

    if (!config.reminders) {
        result.error = 'No reminders configured. Register with reminders to use hooks.';
        return result;
    }

    try {
        const files = buildHookFiles(agent, config.name, config.reminders);

        // Step 1: Write hook files
        await fs.mkdir(hookDir, { recursive: true });

        for (const [fileName, content] of Object.entries(files)) {
            const filePath = path.join(hookDir, fileName);
            await fs.writeFile(filePath, content, 'utf-8');

            if (fileName.endsWith('.sh')) {
                await fs.chmod(filePath, 0o755);
            }

            result.filesWritten.push(filePath);
        }

        // Step 2: Merge settings.json for agents that need it (Claude Code / Codex)
        if (entry.getSettingsPath) {
            const settingsPath = entry.getSettingsPath(home);
            const activatorFileName = Object.keys(files).find((f) => f.endsWith('.sh'));
            if (activatorFileName) {
                const activatorPath = path.join(hookDir, activatorFileName);
                await mergeHookSettings(settingsPath, activatorPath, config.name);
                result.settingsUpdated = true;
            }
        }

        // Step 3: Agent-specific post-install
        if (agent === 'openclaw') {
            try {
                await execFileAsync('openclaw', ['hooks', 'enable', config.name]);
                result.notes.push(`Hook activated via \`openclaw hooks enable ${config.name}\`.`);
            } catch {
                result.notes.push(`Run \`openclaw hooks enable ${config.name}\` to activate the hook.`);
            }
        }

        result.success = true;
    } catch (err) {
        result.error = err instanceof Error ? err.message : String(err);
    }

    return result;
}

/**
 * Check if hooks are already installed for the given agent type.
 *
 * Requires register().
 */
export async function hasHooksInstalled(agent: AgentType): Promise<boolean> {
    const config = getConfig();
    const home = os.homedir();
    const entry = AGENT_REGISTRY[agent];
    const hookDir = entry.getHookDir(home, config.name);

    const files = buildHookFiles(agent, config.name, config.reminders ?? { perTurn: '' });
    for (const fileName of Object.keys(files)) {
        try {
            await fs.access(path.join(hookDir, fileName));
            return true;
        } catch {
            continue;
        }
    }

    return false;
}

// ---------------------------------------------------------------------------
// Hook file generation — high-level factory
// ---------------------------------------------------------------------------

/**
 * Build hook files for a given agent type.
 * Returns Record<filename, content>.
 * @internal — exported for testing.
 */
export function buildHookFiles(agent: AgentType, toolName: string, reminders: HookReminders): Record<string, string> {
    switch (agent) {
        case 'claude-code':
        case 'codex':
            return buildShellHookFiles(toolName, reminders);
        case 'openclaw':
            return buildOpenClawHookFiles(toolName, reminders);
        case 'opencode':
            return buildOpenCodeHookFiles(toolName, reminders);
    }
}

// ---------------------------------------------------------------------------
// Claude Code / Codex — shell script
// ---------------------------------------------------------------------------

function buildShellHookFiles(toolName: string, reminders: HookReminders): Record<string, string> {
    const script = `#!/bin/bash
# ${capitalize(toolName)} Activator Hook
# Triggers on UserPromptSubmit

set -e

cat << 'EOF'
${reminders.perTurn}
EOF
`;
    return { [`${toolName}-activator.sh`]: script };
}

// ---------------------------------------------------------------------------
// OpenClaw — HOOK.md + handler.ts
// ---------------------------------------------------------------------------

function buildOpenClawHookFiles(toolName: string, reminders: HookReminders): Record<string, string> {
    const hookMd = `---
name: ${toolName}
description: "${capitalize(toolName)} hook - injects reminder during agent bootstrap"
metadata: {"openclaw":{"events":["agent:bootstrap"]}}
---
`;

    const reminderParts = [reminders.sessionStart, reminders.perTurn].filter(Boolean).join('\n\n');

    const handlerTs = `const REMINDER_CONTENT = \`
${reminderParts}
\`;

const handler = async (event) => {
    if (event.type !== 'agent' || event.action !== 'bootstrap') {
        return;
    }

    if (event.sessionKey && event.sessionKey.includes(':subagent:')) {
        return;
    }

    if (Array.isArray(event.context.bootstrapFiles)) {
        event.context.bootstrapFiles.push({
            path: '${toolName.toUpperCase().replace(/-/g, '_')}_REMINDER.md',
            content: REMINDER_CONTENT,
            virtual: true,
        });
    }
};

export default handler;
`;

    return {
        'HOOK.md': hookMd,
        'handler.ts': handlerTs,
    };
}

// ---------------------------------------------------------------------------
// OpenCode — TypeScript plugin
// ---------------------------------------------------------------------------

function buildOpenCodeHookFiles(toolName: string, reminders: HookReminders): Record<string, string> {
    const exportName = toPascalCase(toolName) + 'Reminder';

    const sessionStartReminder = reminders.sessionStart
        ? `${reminders.sessionStart}\n\n${reminders.perTurn}`
        : reminders.perTurn;

    const hasCompaction = !!reminders.compaction;

    const pluginTs = `/**
 * ${capitalize(toolName)} Reminder Plugin for OpenCode
 */

const SESSION_START_REMINDER = \`${sessionStartReminder}\`;

const PER_TURN_REMINDER = \`${reminders.perTurn}\`;
${hasCompaction ? `\nconst COMPACTION_REMINDER = \`${reminders.compaction}\`;` : ''}

const seenSessions = new Set();

export const ${exportName} = async () => {
    return {
        "experimental.chat.messages.transform": async (_input, output) => {
            const messages = output.messages;
            if (!messages || messages.length === 0) return;

            const sessionID = messages[0]?.info?.sessionID;
            const isNewSession = sessionID && !seenSessions.has(sessionID);
            if (sessionID) seenSessions.add(sessionID);

            const reminder = isNewSession ? SESSION_START_REMINDER : PER_TURN_REMINDER;

            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].info?.role === "user") {
                    messages[i].parts.push({ type: "text", text: reminder });
                    break;
                }
            }
        },${
            hasCompaction
                ? `
        "experimental.session.compacting": async (_input, output) => {
            output.context.push(COMPACTION_REMINDER);
        },`
                : ''
        }
    };
};
`;

    return { [`${toolName}-reminder.ts`]: pluginTs };
}

// ---------------------------------------------------------------------------
// Settings merge (Claude Code / Codex)
// ---------------------------------------------------------------------------

async function mergeHookSettings(settingsPath: string, activatorPath: string, toolName: string): Promise<void> {
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

    const hookEntry = {
        matcher: '',
        hooks: [{ type: 'command', command: activatorPath }],
    };

    if (!Array.isArray(hooks.UserPromptSubmit)) {
        hooks.UserPromptSubmit = [];
    }

    // Remove existing entries for this tool
    hooks.UserPromptSubmit = hooks.UserPromptSubmit.filter((entry) => {
        if (!entry || typeof entry !== 'object') return true;
        const e = entry as Record<string, unknown>;
        if (!Array.isArray(e.hooks)) return true;
        return !e.hooks.some((h: unknown) => {
            if (!h || typeof h !== 'object') return false;
            const hook = h as Record<string, unknown>;
            return typeof hook.command === 'string' && hook.command.includes(toolName);
        });
    });

    hooks.UserPromptSubmit.push(hookEntry);

    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function toPascalCase(str: string): string {
    return str
        .split(/[-_]/)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
        .join('');
}
