// Core factory
export { createKit } from './create-kit.js';

// Prompt utilities
export { resolveConfigPath } from './prompt.js';

// Hook definition
export { defineHooks, getValidEvents } from './define-hooks.js';

// Types
export type {
    AgentType,
    StorageScope,
    ScopeOptions,
    KitOptions,
    Kit,
    HookInstallResult,
    HookDefinition,
    HookSet,
    ClaudeCodeEvent,
    OpenCodeEvent,
    OpenClawPluginEvent,
    OpenClawInternalEvent,
    OpenClawEvent,
    AgentEventMap,
    AgentPaths,
} from './types.js';
export { AGENT_TYPES, CLIENT_NAME_MAP } from './types.js';

// Paths (only detectProjectRoot is standalone; getDataDir & resolvePaths are on Kit)
export { detectProjectRoot } from './paths.js';

// Detection
export { detectAgent, detectAgentFromClient } from './detect.js';
