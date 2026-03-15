// Types
export type { AgentType, StorageScope, ScopeOptions, ToolConfig, HookInstallResult, SkippedIntent } from './types.js';
export { AGENT_TYPES, CLIENT_NAME_MAP } from './types.js';

// Hook intent types
export type {
    InjectIntent,
    BeforeToolCallIntent,
    AfterToolCallIntent,
    OnSessionIntent,
    OnPermissionIntent,
    HookIntent,
    IntentType,
    ToolCallContext,
    ToolCallInterceptResult,
    ToolCallObserveContext,
    SessionContext,
    PermissionDecision,
    PermissionContext,
    RawHookRegistration,
    ExtendHookRegistration,
} from './hook-types.js';

// Hook capability types
export type { SupportLevel, CapabilityEntry, DegradationWarning } from './hook-capabilities.js';
export {
    CAPABILITY_MATRIX,
    checkDegradation,
    checkAllDegradation,
    isIntentFullyUnsupported,
} from './hook-capabilities.js';

// Register
export { register } from './register.js';

// Platform
export { getDataDir, detectProjectRoot } from './platform.js';

// Detection
export { detectAgent, detectAgentFromClient } from './detect.js';

// Prompt
export { injectPrompt, hasPromptInjected } from './prompt.js';

// Hooks — declaration API
export { hooks } from './hook-registry.js';

// Hooks — installation
export { installHooks, uninstallHooks, hasHooksInstalled } from './hooks.js';
