// Types
export type { AgentType, StorageScope, ScopeOptions, HookReminders, ToolConfig, HookInstallResult } from './types.js';
export { AGENT_TYPES, CLIENT_NAME_MAP } from './types.js';

// Register
export { register } from './register.js';

// Platform
export { getDataDir, detectProjectRoot } from './platform.js';

// Detection
export { detectAgent, detectAgentFromClient } from './detect.js';

// Prompt
export { injectPrompt, hasPromptInjected } from './prompt.js';

// Hooks
export { installHooks, hasHooksInstalled } from './hooks.js';
