import { describe, it, expect } from 'vitest';
import { detectAgentFromClient } from '../src/detect.js';

describe('detectAgentFromClient', () => {
    it('识别 opencode', () => {
        expect(detectAgentFromClient('opencode')).toBe('opencode');
    });

    it('识别 claude-code', () => {
        expect(detectAgentFromClient('claude-code')).toBe('claude-code');
    });

    it('识别 openclaw', () => {
        expect(detectAgentFromClient('openclaw-acp-client')).toBe('openclaw');
    });

    it('识别 codex', () => {
        expect(detectAgentFromClient('codex-mcp-client')).toBe('codex');
    });

    it('未知客户端返回 null', () => {
        expect(detectAgentFromClient('unknown-client')).toBeNull();
    });

    it('空字符串返回 null', () => {
        expect(detectAgentFromClient('')).toBeNull();
    });
});
