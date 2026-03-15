import { describe, it, expect, beforeEach } from 'vitest';
import { register, _resetForTesting as resetRegister } from '../src/register.js';
import { hooks } from '../src/hook-registry.js';
import { ClaudeCodeTranslator } from '../src/hook-translators/claude-code.js';
import { OpenCodeTranslator } from '../src/hook-translators/opencode.js';
import { OpenClawTranslator } from '../src/hook-translators/openclaw.js';
import type { RawHookRegistration, ExtendHookRegistration } from '../src/hook-types.js';
import { getIntents, getRawHooks, getExtendHooks } from '../src/hook-registry.js';

const emptyRaw = new Map<string, RawHookRegistration>();
const emptyExtend = new Map<string, readonly ExtendHookRegistration[]>();

describe('hooks — 翻译器集成 (迁移自旧 buildHookFiles 测试)', () => {
    beforeEach(() => {
        resetRegister();
        hooks._resetForTesting();
    });

    describe('claude-code / codex — shell 脚本', () => {
        it('inject 生成 shell 脚本', () => {
            const translator = new ClaudeCodeTranslator('claude-code');
            hooks.inject({ perTurn: '<test-reminder>Check something after each turn.</test-reminder>' });

            const result = translator.translate(getIntents(), emptyRaw, emptyExtend, 'test-tool');
            expect(result.files).toHaveProperty('test-tool-inject.sh');

            const script = result.files['test-tool-inject.sh'];
            expect(script).toContain('#!/bin/bash');
            expect(script).toContain('<test-reminder>Check something after each turn.</test-reminder>');
        });

        it('codex 生成相同格式', () => {
            const translator = new ClaudeCodeTranslator('codex');
            hooks.inject({ perTurn: 'codex test' });

            const result = translator.translate(getIntents(), emptyRaw, emptyExtend, 'test-tool');
            expect(result.files).toHaveProperty('test-tool-inject.sh');
        });
    });

    describe('openclaw — HOOK.md + handler.ts', () => {
        it('inject 生成 HOOK.md 和 handler.ts', () => {
            const translator = new OpenClawTranslator();
            hooks.inject({
                perTurn: '<test-reminder>Check something after each turn.</test-reminder>',
                sessionStart: '<test-start>Load context at session start.</test-start>',
            });

            const result = translator.translate(getIntents(), emptyRaw, emptyExtend, 'test-tool');
            expect(Object.keys(result.files).sort()).toEqual(['HOOK.md', 'handler.ts']);
        });

        it('HOOK.md 包含工具名', () => {
            const translator = new OpenClawTranslator();
            hooks.inject({ perTurn: 'test' });

            const result = translator.translate(getIntents(), emptyRaw, emptyExtend, 'test-tool');
            expect(result.files['HOOK.md']).toContain('name: test-tool');
        });

        it('handler.ts 包含 sessionStart 和 perTurn', () => {
            const translator = new OpenClawTranslator();
            hooks.inject({
                perTurn: '<test-reminder>Check something after each turn.</test-reminder>',
                sessionStart: '<test-start>Load context at session start.</test-start>',
            });

            const result = translator.translate(getIntents(), emptyRaw, emptyExtend, 'test-tool');
            const handler = result.files['handler.ts'];
            expect(handler).toContain('<test-start>Load context at session start.</test-start>');
            expect(handler).toContain('<test-reminder>Check something after each turn.</test-reminder>');
        });

        it('handler.ts 注入的虚拟文件名基于工具名', () => {
            const translator = new OpenClawTranslator();
            hooks.inject({ perTurn: 'test' });

            const result = translator.translate(getIntents(), emptyRaw, emptyExtend, 'test-tool');
            expect(result.files['handler.ts']).toContain('TEST_TOOL_REMINDER.md');
        });
    });

    describe('opencode — TypeScript plugin', () => {
        it('inject 生成 plugin 文件', () => {
            const translator = new OpenCodeTranslator();
            hooks.inject({ perTurn: 'Check something.' });

            const result = translator.translate(getIntents(), emptyRaw, emptyExtend, 'test-tool');
            expect(Object.keys(result.files)).toEqual(['test-tool-plugin.ts']);
        });

        it('导出名为 PascalCase + Plugin', () => {
            const translator = new OpenCodeTranslator();
            hooks.inject({ perTurn: 'test' });

            const result = translator.translate(getIntents(), emptyRaw, emptyExtend, 'test-tool');
            expect(result.files['test-tool-plugin.ts']).toContain('export const TestToolPlugin');
        });

        it('包含 messages.transform 钩子', () => {
            const translator = new OpenCodeTranslator();
            hooks.inject({ perTurn: 'test' });

            const result = translator.translate(getIntents(), emptyRaw, emptyExtend, 'test-tool');
            expect(result.files['test-tool-plugin.ts']).toContain('experimental.chat.messages.transform');
        });

        it('有 compaction 时包含 compacting 钩子', () => {
            const translator = new OpenCodeTranslator();
            hooks.inject({
                perTurn: 'per-turn',
                compaction: '<test-compact>Save before compaction.</test-compact>',
            });

            const result = translator.translate(getIntents(), emptyRaw, emptyExtend, 'test-tool');
            const plugin = result.files['test-tool-plugin.ts'];
            expect(plugin).toContain('experimental.session.compacting');
            expect(plugin).toContain('<test-compact>Save before compaction.</test-compact>');
        });

        it('无 compaction 时不包含 compacting 钩子', () => {
            const translator = new OpenCodeTranslator();
            hooks.inject({ perTurn: 'check something' });

            const result = translator.translate(getIntents(), emptyRaw, emptyExtend, 'test-tool');
            expect(result.files['test-tool-plugin.ts']).not.toContain('experimental.session.compacting');
        });
    });
});
