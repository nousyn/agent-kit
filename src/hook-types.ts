import type { AgentType } from './types.js';

// ---------------------------------------------------------------------------
// Intent types — what the user wants to do, not which hook to use
// ---------------------------------------------------------------------------

/**
 * Content injection intent.
 * Injects text into agent context at various lifecycle points.
 */
export interface InjectIntent {
    type: 'inject';
    /** Reminder injected on every user message turn. */
    perTurn: string;
    /** Reminder injected at session start. */
    sessionStart?: string;
    /** Reminder injected before context compaction. */
    compaction?: string;
    /** Reminder injected at session end. */
    sessionEnd?: string;
}

/**
 * Tool call interception result.
 */
export interface ToolCallInterceptResult {
    /** Block the tool call entirely. */
    block?: boolean;
    /** Reason for blocking (shown to agent). */
    reason?: string;
    /** Modified arguments to pass to the tool (if not blocking). */
    args?: Record<string, unknown>;
}

/**
 * Tool call context passed to handler.
 */
export interface ToolCallContext {
    toolName: string;
    args: Record<string, unknown>;
}

/**
 * Pre-tool-call interception intent.
 * Intercept tool calls before execution — can block or modify arguments.
 */
export interface BeforeToolCallIntent {
    type: 'beforeToolCall';
    /** Regex pattern to match tool names. Omit or '*' to match all. */
    match?: RegExp | string;
    /** Handler that decides whether to block or modify the tool call. */
    handler: (ctx: ToolCallContext) => ToolCallInterceptResult | void;
}

/**
 * Tool call observation context.
 */
export interface ToolCallObserveContext {
    toolName: string;
    args: Record<string, unknown>;
    result: string;
    error?: string;
}

/**
 * Post-tool-call observation intent.
 * Observe tool call results — cannot modify, only react.
 */
export interface AfterToolCallIntent {
    type: 'afterToolCall';
    /** Regex pattern to match tool names. Omit or '*' to match all. */
    match?: RegExp | string;
    /** Handler that reacts to tool call completion. */
    handler: (ctx: ToolCallObserveContext) => void;
}

/**
 * Session lifecycle context.
 */
export interface SessionContext {
    sessionId?: string;
}

/**
 * Session lifecycle intent.
 * React to session start and/or end.
 */
export interface OnSessionIntent {
    type: 'onSession';
    /** Handler called when session starts. */
    start?: (ctx: SessionContext) => void;
    /** Handler called when session ends. */
    end?: (ctx: SessionContext) => void;
}

/**
 * Permission decision.
 */
export type PermissionDecision = 'allow' | 'deny' | 'ask';

/**
 * Permission request context.
 */
export interface PermissionContext {
    toolName: string;
    args: Record<string, unknown>;
}

/**
 * Permission decision intent.
 * Intercept permission requests and decide allow/deny/ask.
 */
export interface OnPermissionIntent {
    type: 'onPermission';
    /** Regex pattern to match tool names. Omit or '*' to match all. */
    match?: RegExp | string;
    /** Handler that decides the permission outcome. */
    handler: (ctx: PermissionContext) => PermissionDecision;
}

/**
 * Union of all intent types.
 */
export type HookIntent =
    | InjectIntent
    | BeforeToolCallIntent
    | AfterToolCallIntent
    | OnSessionIntent
    | OnPermissionIntent;

/**
 * Discriminant values for intent types.
 */
export type IntentType = HookIntent['type'];

// ---------------------------------------------------------------------------
// Native hook names per agent — for raw/extend
// ---------------------------------------------------------------------------

/** Claude Code / Codex native hook event names. */
export type ClaudeCodeHookName =
    | 'SessionStart'
    | 'InstructionsLoaded'
    | 'UserPromptSubmit'
    | 'PreToolUse'
    | 'PermissionRequest'
    | 'PostToolUse'
    | 'PostToolUseFailure'
    | 'Notification'
    | 'SubagentStart'
    | 'SubagentStop'
    | 'Stop'
    | 'TeammateIdle'
    | 'TaskCompleted'
    | 'ConfigChange'
    | 'WorktreeCreate'
    | 'WorktreeRemove'
    | 'PreCompact'
    | 'PostCompact'
    | 'Elicitation'
    | 'ElicitationResult'
    | 'SessionEnd';

/** OpenCode native hook names. */
export type OpenCodeHookName =
    | 'event'
    | 'config'
    | 'tool'
    | 'auth'
    | 'chat.message'
    | 'chat.params'
    | 'chat.headers'
    | 'permission.ask'
    | 'command.execute.before'
    | 'tool.execute.before'
    | 'shell.env'
    | 'tool.execute.after'
    | 'experimental.chat.messages.transform'
    | 'experimental.chat.system.transform'
    | 'experimental.session.compacting'
    | 'experimental.text.complete'
    | 'tool.definition';

/** OpenClaw plugin hook names (24). */
export type OpenClawPluginHookName =
    | 'before_model_resolve'
    | 'before_prompt_build'
    | 'before_agent_start'
    | 'llm_input'
    | 'llm_output'
    | 'agent_end'
    | 'before_compaction'
    | 'after_compaction'
    | 'before_reset'
    | 'message_received'
    | 'message_sending'
    | 'message_sent'
    | 'before_tool_call'
    | 'after_tool_call'
    | 'tool_result_persist'
    | 'before_message_write'
    | 'session_start'
    | 'session_end'
    | 'subagent_spawning'
    | 'subagent_delivery_target'
    | 'subagent_spawned'
    | 'subagent_ended'
    | 'gateway_start'
    | 'gateway_stop';

/** OpenClaw internal hook names (type:action). */
export type OpenClawInternalHookName =
    | 'command:new'
    | 'command:reset'
    | 'command:stop'
    | 'session:compact:before'
    | 'session:compact:after'
    | 'agent:bootstrap'
    | 'gateway:startup'
    | 'message:received'
    | 'message:sent'
    | 'message:transcribed'
    | 'message:preprocessed';

/** All OpenClaw hook names (plugin + internal). */
export type OpenClawHookName = OpenClawPluginHookName | OpenClawInternalHookName;

/** Map from agent type to its native hook name union. */
export type NativeHookNameMap = {
    'claude-code': ClaudeCodeHookName;
    codex: ClaudeCodeHookName;
    opencode: OpenCodeHookName;
    openclaw: OpenClawHookName;
};

// ---------------------------------------------------------------------------
// Raw hook registration — bypass intent layer, write native hook directly
// ---------------------------------------------------------------------------

/**
 * Raw hook registration.
 * Provides the handler code (as string) for a specific agent's native hook.
 * When a raw hook targets the same native hook as an intent, raw wins.
 */
export interface RawHookRegistration<A extends AgentType = AgentType> {
    agent: A;
    hookName: A extends keyof NativeHookNameMap ? NativeHookNameMap[A] : string;
    /** Handler code as string — will be written directly into the generated file. */
    handler: string;
    /** Optional matcher (regex string). Only used by agents that support it. */
    matcher?: string;
}

// ---------------------------------------------------------------------------
// Extend hook registration — augment intent-generated hooks
// ---------------------------------------------------------------------------

/**
 * Extend hook registration.
 * Runs after the intent-generated handler for the same native hook.
 * Cannot replace, only augment.
 */
export interface ExtendHookRegistration<A extends AgentType = AgentType> {
    agent: A;
    hookName: A extends keyof NativeHookNameMap ? NativeHookNameMap[A] : string;
    /** Extension code as string — appended to the intent-generated handler. */
    handler: string;
    /** Optional matcher (regex string). Only used by agents that support it. */
    matcher?: string;
}
