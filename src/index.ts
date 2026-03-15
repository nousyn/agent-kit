// Core factory
export { createKit } from './create-kit.js';

// Types
export type {
    AgentType,
    StorageScope,
    ScopeOptions,
    KitOptions,
    Kit,
    HookInstallResult,
    SkippedIntent,
} from './types.js';
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

// Platform (only detectProjectRoot is standalone; getDataDir is on Kit)
export { detectProjectRoot } from './platform.js';

// Detection
export { detectAgent, detectAgentFromClient } from './detect.js';

// Hooks — declaration API (global, not bound to kit instance)
export { hooks } from './hook-registry.js';
