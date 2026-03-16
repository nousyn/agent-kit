import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveAgentPaths } from './paths.js';
import type { AgentType, ScopeOptions } from './types.js';

/**
 * Inject or update prompt into the agent's config file.
 *
 * Uses `<!-- {name}:start -->` / `<!-- {name}:end -->` markers.
 * First call appends to end of file; subsequent calls replace the existing block.
 *
 * @internal — called by the Kit object returned from createKit().
 */
export async function injectPrompt(
    name: string,
    prompt: string,
    agent: AgentType,
    options?: ScopeOptions,
): Promise<void> {
    const { configFile } = resolveAgentPaths(agent, undefined, options);

    // Read existing content
    let existingContent = '';
    try {
        existingContent = await fs.readFile(configFile, 'utf-8');
    } catch {
        // File doesn't exist yet
    }

    const updated = applyPromptInjection(existingContent, name, prompt);

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(configFile), { recursive: true });
    await fs.writeFile(configFile, updated, 'utf-8');
}

/**
 * Check if prompt has already been injected into the agent's config file.
 *
 * @internal — called by the Kit object returned from createKit().
 */
export async function hasPromptInjected(name: string, agent: AgentType, options?: ScopeOptions): Promise<boolean> {
    const { configFile } = resolveAgentPaths(agent, undefined, options);

    try {
        const content = await fs.readFile(configFile, 'utf-8');
        return content.includes(markerStart(name));
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function markerStart(name: string): string {
    return `<!-- ${name}:start -->`;
}

function markerEnd(name: string): string {
    return `<!-- ${name}:end -->`;
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pure function: apply prompt injection to a string.
 * @internal — exported for testing.
 */
export function applyPromptInjection(existingContent: string, name: string, promptContent: string): string {
    const start = markerStart(name);
    const end = markerEnd(name);
    const block = `${start}\n${promptContent}\n${end}`;

    if (existingContent.includes(start)) {
        // Replace existing block
        const regex = new RegExp(`${escapeRegex(start)}[\\s\\S]*?${escapeRegex(end)}`, 'g');
        return existingContent.replace(regex, block);
    }

    // Append to end
    const separator = existingContent.trim() ? '\n\n' : '';
    return existingContent.trimEnd() + separator + block + '\n';
}

/**
 * Resolve the target config file path for an agent + scope.
 */
export function resolveConfigPath(agent: AgentType, options?: ScopeOptions): string {
    const { configFile } = resolveAgentPaths(agent, undefined, options);
    return configFile;
}
