import type { AgentType, Kit, KitOptions, ResolvedKitConfig, ScopeOptions, HookSet } from './types.js';
import { injectPrompt, hasPromptInjected } from './prompt.js';
import { installHooks, uninstallHooks, hasHooksInstalled } from './hooks.js';
import { getDataDir, resolveAgentPaths } from './paths.js';

/**
 * Create a kit instance bound to the given tool name.
 *
 * The returned object contains all kit functions (injectPrompt, installHooks,
 * getDataDir, etc.) with the tool name captured in a closure — no global state.
 *
 * Supports destructuring:
 * ```ts
 * const { injectPrompt, installHooks } = createKit('my-mcp');
 * ```
 *
 * @param name - Tool name. Used for prompt markers, hook directories, data directories, etc.
 * @param options - Optional configuration (dirs, envOverride).
 */
export function createKit(name: string, options?: KitOptions): Kit {
    if (!name || !name.trim()) {
        throw new Error('createKit: name is required and cannot be empty.');
    }

    const config: ResolvedKitConfig = {
        name,
        dirs: options?.dirs,
        envOverride: options?.envOverride,
    };

    return {
        get name() {
            return name;
        },

        injectPrompt(agent: AgentType, prompt: string, scopeOptions?: ScopeOptions) {
            if (!prompt || !prompt.trim()) {
                throw new Error('injectPrompt: prompt is required and cannot be empty.');
            }
            return injectPrompt(name, prompt, agent, scopeOptions);
        },

        hasPromptInjected(agent: AgentType, scopeOptions?: ScopeOptions) {
            return hasPromptInjected(name, agent, scopeOptions);
        },

        installHooks(agent: AgentType, hooks: HookSet | HookSet[]) {
            return installHooks(name, agent, hooks);
        },

        uninstallHooks(agent: AgentType) {
            return uninstallHooks(name, agent);
        },

        hasHooksInstalled(agent: AgentType) {
            return hasHooksInstalled(name, agent);
        },

        getDataDir(scopeOptions?: ScopeOptions) {
            return getDataDir(config, scopeOptions);
        },

        resolvePaths(agent: AgentType, scopeOptions?: ScopeOptions) {
            return resolveAgentPaths(agent, name, scopeOptions);
        },
    };
}
