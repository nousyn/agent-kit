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
 * Hook reminder texts for different lifecycle events.
 * Only perTurn is required; others are used by agents that support them.
 */
export interface HookReminders {
    /** Reminder injected on every user message turn. */
    perTurn: string;
    /** Reminder injected at session start (OpenClaw, OpenCode). */
    sessionStart?: string;
    /** Reminder injected before context compaction (OpenCode only). */
    compaction?: string;
    /** Reminder injected at session end. */
    sessionEnd?: string;
}

/**
 * Configuration passed to register().
 */
export interface ToolConfig {
    /** Tool name — used for prompt markers, hook directories, data directories. */
    name: string;
    /** Prompt content to inject into agent config files. */
    prompt: string;
    /** Hook reminder texts for lifecycle events. */
    reminders?: HookReminders;
    /** Override data directory names. Defaults: global = name, project = `.${name}` */
    dirs?: {
        global?: string;
        project?: string;
    };
    /** Environment variable name to override the global data directory path. */
    envOverride?: string;
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
