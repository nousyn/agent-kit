/**
 * Supported agent types (hardcoded, not extensible).
 */
export const AGENT_TYPES = ['opencode', 'claude-code', 'openclaw', 'codex'] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

export type StorageScope = 'global' | 'project';

/**
 * Scope options for operations that support global/project level.
 */
export interface ScopeOptions {
    scope?: StorageScope;
    projectRoot?: string;
}

/**
 * Options for createKit(). Everything except name is optional.
 */
export interface KitOptions {
    /** Override data directory names. Defaults: global = name, project = `.${name}` */
    dirs?: {
        global?: string;
        project?: string;
    };
    /** Environment variable name to override the global data directory path. */
    envOverride?: string;
}

/**
 * Internal resolved config derived from createKit() arguments.
 * @internal
 */
export interface ResolvedKitConfig {
    name: string;
    dirs?: { global?: string; project?: string };
    envOverride?: string;
}

/**
 * The object returned by createKit(). Provides all kit functions bound to the tool name.
 */
export interface Kit {
    /** The tool name this kit is bound to. */
    readonly name: string;

    /** Inject prompt into agent config file. */
    injectPrompt(agent: AgentType, prompt: string, options?: ScopeOptions): Promise<void>;

    /** Check if prompt has been injected. */
    hasPromptInjected(agent: AgentType, options?: ScopeOptions): Promise<boolean>;

    /** Install hooks for the given agent. Accepts one or more HookSet from defineHooks(). */
    installHooks(agent: AgentType, hooks: HookSet | HookSet[]): Promise<HookInstallResult>;

    /** Uninstall hooks for the given agent. */
    uninstallHooks(agent: AgentType): Promise<{ success: boolean; removed: string[]; error?: string }>;

    /** Check if hooks are installed for the given agent. */
    hasHooksInstalled(agent: AgentType): Promise<boolean>;

    /** Get platform-appropriate data directory path. */
    getDataDir(options?: ScopeOptions): string;

    /** Resolve all relevant paths (config file, hook dir, settings file) for an agent. */
    resolvePaths(agent: AgentType, options?: ScopeOptions): AgentPaths;
}

// ---------------------------------------------------------------------------
// Hook definition types
// ---------------------------------------------------------------------------

/** Claude Code / Codex native hook event names. */
export type ClaudeCodeEvent =
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

/** OpenCode native hook event names. */
export type OpenCodeEvent =
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

/** OpenClaw plugin hook event names. */
export type OpenClawPluginEvent =
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

/** OpenClaw internal hook event names (type:action). */
export type OpenClawInternalEvent =
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

/** All OpenClaw hook event names (plugin + internal). */
export type OpenClawEvent = OpenClawPluginEvent | OpenClawInternalEvent;

/** Map from agent type to its event name union. */
export type AgentEventMap = {
    'claude-code': ClaudeCodeEvent;
    codex: ClaudeCodeEvent;
    opencode: OpenCodeEvent;
    openclaw: OpenClawEvent;
};

/**
 * A single hook definition for a specific agent.
 *
 * - `events`: one or more native event names for this agent.
 * - `content`: the hook content (shell script, TypeScript code, handler.ts body, etc.).
 *   Users are fully responsible for the content — agent-kit only writes it to the correct path.
 * - `description`: (OpenClaw only) human-readable description for HOOK.md. Defaults to auto-generated.
 */
export interface HookDefinition<A extends AgentType = AgentType> {
    events: A extends keyof AgentEventMap ? AgentEventMap[A][] : string[];
    content: string;
    /** OpenClaw only — description for HOOK.md. Ignored by other agents. */
    description?: string;
}

/**
 * A validated set of hook definitions for a specific agent, returned by defineHooks().
 * This is an opaque token — users should not construct it directly.
 */
export interface HookSet<A extends AgentType = AgentType> {
    /** @internal brand field */
    readonly __brand: 'HookSet';
    readonly agent: A;
    readonly definitions: readonly HookDefinition<A>[];
}

/**
 * Result of hook installation.
 */
export interface HookInstallResult {
    success: boolean;
    hookDir: string;
    filesWritten: string[];
    settingsUpdated: boolean;
    notes: string[];
    warnings: string[];
    error?: string;
}

/**
 * Internal agent registry entry — config file paths, hook dirs, detection paths.
 */
export interface AgentRegistryEntry {
    /** Agent config file name (e.g. 'AGENTS.md', 'CLAUDE.md') */
    configFileName: string;
    /** Global config file path */
    globalConfigPath: (home: string) => string;
    /** Project-level config file path */
    projectConfigPath: (projectRoot: string) => string;
    /** Hook directory path (parameterized by tool name) */
    getHookDir: (home: string, toolName: string) => string;
    /** Settings.json path for agents that need hook config merged */
    getSettingsPath?: (home: string) => string;
    /** File paths to check for agent detection */
    detectionPaths: (cwd: string, home: string) => string[];
}

/**
 * Resolved paths for an agent at a given scope.
 *
 * Returned by `kit.resolvePaths()` and `resolveAgentPaths()`.
 */
export interface AgentPaths {
    /** Absolute path to the agent config file (e.g. AGENTS.md, CLAUDE.md). */
    configFile: string;
    /** Absolute path to the hook directory. Only present when `toolName` is provided (or via kit.resolvePaths). */
    hookDir?: string;
    /** Absolute path to the agent settings file (e.g. settings.json). Only present for agents that use one (claude-code, codex). */
    settingsFile?: string;
}

/**
 * Options for the standalone `resolveAgentPaths()` function.
 */
export interface ResolveAgentPathsOptions {
    /** Storage scope. Defaults to 'global'. */
    scope?: StorageScope;
    /** Required when scope is 'project'. */
    projectRoot?: string;
    /** Tool/kit name. Required to resolve hookDir. */
    toolName?: string;
}

/**
 * Map from MCP clientInfo.name to AgentType.
 */
export const CLIENT_NAME_MAP: Record<string, AgentType> = {
    opencode: 'opencode',
    'claude-code': 'claude-code',
    'openclaw-acp-client': 'openclaw',
    'codex-mcp-client': 'codex',
};

/**
 * Internal agent registry — unified data source for all agent-specific paths.
 */
export const AGENT_REGISTRY: Record<AgentType, AgentRegistryEntry> = {
    opencode: {
        configFileName: 'AGENTS.md',
        globalConfigPath: (home) => `${home}/.config/opencode/AGENTS.md`,
        projectConfigPath: (cwd) => `${cwd}/AGENTS.md`,
        getHookDir: (home, _toolName) => `${home}/.config/opencode/plugins`,
        detectionPaths: (cwd, home) => [
            `${cwd}/opencode.json`,
            `${cwd}/opencode.jsonc`,
            `${home}/.config/opencode/opencode.json`,
        ],
    },
    'claude-code': {
        configFileName: 'CLAUDE.md',
        globalConfigPath: (home) => `${home}/.claude/CLAUDE.md`,
        projectConfigPath: (cwd) => `${cwd}/CLAUDE.md`,
        getHookDir: (home, toolName) => `${home}/.claude/hooks/${toolName}`,
        getSettingsPath: (home) => `${home}/.claude/settings.json`,
        detectionPaths: (cwd, home) => [`${cwd}/CLAUDE.md`, `${home}/.claude/CLAUDE.md`],
    },
    openclaw: {
        configFileName: 'AGENTS.md',
        globalConfigPath: (home) => `${home}/.openclaw/workspace/AGENTS.md`,
        projectConfigPath: (cwd) => `${cwd}/AGENTS.md`,
        getHookDir: (home, toolName) => `${home}/.openclaw/hooks/${toolName}`,
        detectionPaths: (_cwd, home) => [`${home}/.openclaw/openclaw.json`],
    },
    codex: {
        configFileName: 'AGENTS.md',
        globalConfigPath: (home) => `${home}/.codex/AGENTS.md`,
        projectConfigPath: (cwd) => `${cwd}/AGENTS.md`,
        getHookDir: (home, toolName) => `${home}/.codex/hooks/${toolName}`,
        getSettingsPath: (home) => `${home}/.codex/settings.json`,
        detectionPaths: (cwd, home) => [`${cwd}/.codex/config.toml`, `${home}/.codex/config.toml`],
    },
};
