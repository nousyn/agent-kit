import { describe, it, expect } from 'vitest';
import {
    CAPABILITY_MATRIX,
    checkDegradation,
    checkAllDegradation,
    isIntentFullyUnsupported,
    detectConflicts,
} from '../src/hook-capabilities.js';

describe('hook-capabilities', () => {
    describe('CAPABILITY_MATRIX', () => {
        it('Claude Code 全部 intent 子能力都是 supported', () => {
            const caps = CAPABILITY_MATRIX['claude-code'];
            for (const [intent, subCaps] of Object.entries(caps)) {
                for (const [subCap, entry] of Object.entries(subCaps as Record<string, { level: string }>)) {
                    expect(entry.level, `claude-code.${intent}.${subCap}`).toBe('supported');
                }
            }
        });

        it('OpenCode beforeToolCall.block 是 partial', () => {
            expect(CAPABILITY_MATRIX.opencode.beforeToolCall.block.level).toBe('partial');
        });

        it('OpenCode inject.sessionEnd 是 unsupported', () => {
            expect(CAPABILITY_MATRIX.opencode.inject.sessionEnd.level).toBe('unsupported');
        });

        it('OpenClaw onPermission.decide 是 unsupported', () => {
            expect(CAPABILITY_MATRIX.openclaw.onPermission.decide.level).toBe('unsupported');
        });

        it('OpenClaw beforeToolCall.matcher 是 unsupported', () => {
            expect(CAPABILITY_MATRIX.openclaw.beforeToolCall.matcher.level).toBe('unsupported');
        });
    });

    describe('checkDegradation()', () => {
        it('Claude Code inject 无 warning', () => {
            const warnings = checkDegradation('claude-code', 'inject');
            expect(warnings).toHaveLength(0);
        });

        it('OpenCode inject 有 warning (sessionEnd unsupported)', () => {
            const warnings = checkDegradation('opencode', 'inject');
            expect(warnings.some((w) => w.capability === 'sessionEnd')).toBe(true);
            expect(warnings.some((w) => w.capability === 'compaction')).toBe(true);
        });

        it('仅检查指定的子能力', () => {
            const warnings = checkDegradation('opencode', 'inject', ['perTurn', 'sessionStart']);
            expect(warnings).toHaveLength(0); // perTurn 和 sessionStart 都是 supported
        });

        it('OpenCode beforeToolCall 的 block 和 matcher 有 warning', () => {
            const warnings = checkDegradation('opencode', 'beforeToolCall');
            expect(warnings.some((w) => w.capability === 'block' && w.level === 'partial')).toBe(true);
            expect(warnings.some((w) => w.capability === 'matcher' && w.level === 'unsupported')).toBe(true);
        });

        it('warning 消息格式正确', () => {
            const warnings = checkDegradation('opencode', 'inject');
            for (const w of warnings) {
                expect(w.message).toMatch(/^\[opencode\] inject\./);
                expect(w.agent).toBe('opencode');
                expect(w.intent).toBe('inject');
            }
        });
    });

    describe('checkAllDegradation()', () => {
        it('去重相同 agent + intent + capability 的 warning', () => {
            // 即使传入重复的 intentType 也只报一次
            const warnings = checkAllDegradation('opencode', ['inject', 'inject']);
            const sessionEndWarnings = warnings.filter((w) => w.capability === 'sessionEnd');
            expect(sessionEndWarnings).toHaveLength(1);
        });

        it('聚合多个 intent 类型的 warning', () => {
            const warnings = checkAllDegradation('opencode', ['inject', 'beforeToolCall']);
            expect(warnings.some((w) => w.intent === 'inject')).toBe(true);
            expect(warnings.some((w) => w.intent === 'beforeToolCall')).toBe(true);
        });
    });

    describe('isIntentFullyUnsupported()', () => {
        it('OpenClaw onPermission 全部 unsupported', () => {
            expect(isIntentFullyUnsupported('openclaw', 'onPermission')).toBe(true);
        });

        it('OpenCode inject 不是全部 unsupported', () => {
            expect(isIntentFullyUnsupported('opencode', 'inject')).toBe(false);
        });

        it('Claude Code 所有 intent 都不是全部 unsupported', () => {
            const intentTypes = ['inject', 'beforeToolCall', 'afterToolCall', 'onSession', 'onPermission'] as const;
            for (const t of intentTypes) {
                expect(isIntentFullyUnsupported('claude-code', t), `claude-code ${t}`).toBe(false);
            }
        });
    });

    describe('detectConflicts()', () => {
        it('检测 intent 和 raw 冲突', () => {
            const intentHooks = new Set(['UserPromptSubmit', 'PreToolUse']);
            const rawHooks = new Set(['PreToolUse']);

            const warnings = detectConflicts('claude-code', intentHooks, rawHooks);
            expect(warnings).toHaveLength(1);
            expect(warnings[0]).toContain('PreToolUse');
            expect(warnings[0]).toContain('raw hook');
        });

        it('无冲突时返回空数组', () => {
            const intentHooks = new Set(['UserPromptSubmit']);
            const rawHooks = new Set(['Notification']);

            const warnings = detectConflicts('claude-code', intentHooks, rawHooks);
            expect(warnings).toHaveLength(0);
        });
    });
});
