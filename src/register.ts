import type { ToolConfig } from './types.js';

let _config: ToolConfig | null = null;

/**
 * Register tool configuration. Must be called once before using
 * config-dependent functions (injectPrompt, installHooks, getDataDir, etc.).
 *
 * Calling register() again replaces the previous configuration.
 */
export function register(config: ToolConfig): void {
    if (!config.name || !config.name.trim()) {
        throw new Error('register: name is required and cannot be empty.');
    }
    if (!config.prompt || !config.prompt.trim()) {
        throw new Error('register: prompt is required and cannot be empty.');
    }
    _config = { ...config };
}

/**
 * Get the registered config. Throws if register() has not been called.
 * @internal
 */
export function getConfig(): ToolConfig {
    if (!_config) {
        throw new Error('No tool registered. Call register() first.');
    }
    return _config;
}

/**
 * Reset registration state. Intended for testing only.
 * @internal
 */
export function _resetForTesting(): void {
    _config = null;
}
