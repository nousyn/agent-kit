import type { HookIntent, RawHookRegistration, ExtendHookRegistration } from '../hook-types.js';
import type { SkippedIntent } from '../types.js';

// ---------------------------------------------------------------------------
// Translator output
// ---------------------------------------------------------------------------

/**
 * Result of translating intents into native hook files for a specific agent.
 */
export interface TranslationResult {
    /** Map of filename → file content to write to the hook directory. */
    files: Record<string, string>;
    /** Warnings about degradation, conflicts, or partial support. */
    warnings: string[];
    /** Intents that were completely skipped (unsupported by this agent). */
    skipped: SkippedIntent[];
}

// ---------------------------------------------------------------------------
// Settings update descriptor (for Claude Code / Codex)
// ---------------------------------------------------------------------------

/**
 * Describes a settings.json hook entry to merge.
 * Used by agents that need hook config in a central settings file (Claude Code, Codex).
 */
export interface SettingsHookEntry {
    /** Native hook event name (e.g. 'UserPromptSubmit', 'PreToolUse'). */
    event: string;
    /** Regex matcher string. Empty string matches all. */
    matcher: string;
    /** Handler type and command/URL. */
    hook: { type: 'command'; command: string };
}

// ---------------------------------------------------------------------------
// Translator interface
// ---------------------------------------------------------------------------

/**
 * Translates intent-based hook declarations into native hook files for a specific agent.
 *
 * Each agent has its own translator implementation that understands:
 * - How to map intents to native hook event names
 * - How to generate handler code (shell scripts, TypeScript plugins, etc.)
 * - How to merge multiple intents targeting the same native hook
 * - How to apply raw overrides and extend augmentations
 * - What capabilities are partially or fully unsupported
 */
export interface AgentHookTranslator {
    /**
     * Translate all registered hook declarations into native files.
     *
     * @param intents - All registered intents from the hook registry.
     * @param rawHooks - Raw hook registrations for this agent.
     * @param extendHooks - Extend hook registrations for this agent.
     * @param toolName - The registered tool name (used for file naming, markers, etc.)
     * @returns Translation result with files, warnings, and skipped intents.
     */
    translate(
        intents: readonly HookIntent[],
        rawHooks: ReadonlyMap<string, RawHookRegistration>,
        extendHooks: ReadonlyMap<string, readonly ExtendHookRegistration[]>,
        toolName: string,
    ): TranslationResult;

    /**
     * Get settings entries that need to be merged into the agent's settings file.
     * Only applicable for agents that use a central settings file (Claude Code, Codex).
     * Returns empty array for agents that don't need settings.json updates.
     *
     * @param hookDir - The directory where hook files are written.
     * @param toolName - The registered tool name.
     */
    getSettingsEntries(hookDir: string, toolName: string): SettingsHookEntry[];
}
