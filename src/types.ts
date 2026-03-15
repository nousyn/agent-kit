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

    /** Install hooks for the given agent. */
    installHooks(agent: AgentType): Promise<HookInstallResult>;

    /** Uninstall hooks for the given agent. */
    uninstallHooks(agent: AgentType): Promise<{ success: boolean; removed: string[]; error?: string }>;

    /** Check if hooks are installed for the given agent. */
    hasHooksInstalled(agent: AgentType): Promise<boolean>;

    /** Get platform-appropriate data directory path. */
    getDataDir(options?: ScopeOptions): string;
}

/**
 * Describes an intent that was skipped during hook installation.
 */
export interface SkippedIntent {
    /** The intent type that was skipped (e.g. 'onPermission'). */
    intent: string;
    /** The agent for which it was skipped. */
    agent: string;
    /** Human-readable reason for skipping. */
    reason: string;
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
    /** Degradation and conflict warnings (e.g. raw overrides, partial support). */
    warnings: string[];
    /** Intents that were completely skipped for this agent. */
    skipped: SkippedIntent[];
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
