// Core factory
export { createKit } from './create-kit.js';

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
    OpenClawEvent,
    AgentEventMap,
    AgentPaths,
} from './types.js';
export { AGENT_TYPES } from './types.js';

// Paths (only detectProjectRoot is standalone; getDataDir & resolvePaths are on Kit)
export { detectProjectRoot } from './paths.js';

// Detection
export { detectAgent, detectAgentFromClient } from './detect.js';
