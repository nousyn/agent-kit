import { describe, it, expect, beforeEach } from 'vitest';
import { ClaudeCodeTranslator } from '../src/hook-translators/claude-code.js';
import { OpenCodeTranslator } from '../src/hook-translators/opencode.js';
import { OpenClawTranslator } from '../src/hook-translators/openclaw.js';
import type { HookIntent, RawHookRegistration, ExtendHookRegistration } from '../src/hook-types.js';

const emptyRaw = new Map<string, RawHookRegistration>();
const emptyExtend = new Map<string, readonly ExtendHookRegistration[]>();

describe('ClaudeCodeTranslator', () => {
    const translator = new ClaudeCodeTranslator('claude-code');

    it('inject intent 生成 shell 脚本', () => {
        const intents: HookIntent[] = [{ type: 'inject', perTurn: 'Check something after each turn.' }];

        const result = translator.translate(intents, emptyRaw, emptyExtend, 'test-tool');

        expect(result.files).toHaveProperty('test-tool-inject.sh');
        expect(result.files['test-tool-inject.sh']).toContain('#!/bin/bash');
        expect(result.files['test-tool-inject.sh']).toContain('Check something after each turn.');
    });

    it('inject with sessionStart 生成 SessionStart 脚本', () => {
        const intents: HookIntent[] = [{ type: 'inject', perTurn: 'per-turn', sessionStart: 'session start content' }];

        const result = translator.translate(intents, emptyRaw, emptyExtend, 'test-tool');

        expect(result.files).toHaveProperty('test-tool-session-start.sh');
        expect(result.files['test-tool-session-start.sh']).toContain('session start content');
    });

    it('inject with compaction 生成 PreCompact 脚本', () => {
        const intents: HookIntent[] = [{ type: 'inject', perTurn: 'per-turn', compaction: 'compaction content' }];

        const result = translator.translate(intents, emptyRaw, emptyExtend, 'test-tool');

        expect(result.files).toHaveProperty('test-tool-compaction.sh');
        expect(result.files['test-tool-compaction.sh']).toContain('compaction content');
    });

    it('beforeToolCall intent 生成 PreToolUse 脚本', () => {
        const intents: HookIntent[] = [{ type: 'beforeToolCall', match: /^Bash/, handler: () => {} }];

        const result = translator.translate(intents, emptyRaw, emptyExtend, 'test-tool');

        expect(result.files).toHaveProperty('test-tool-before-tool.sh');
        expect(result.files['test-tool-before-tool.sh']).toContain('PreToolUse');
        expect(result.files['test-tool-before-tool.sh']).toContain('^Bash');
    });

    it('afterToolCall intent 生成 PostToolUse 脚本', () => {
        const intents: HookIntent[] = [{ type: 'afterToolCall', handler: () => {} }];

        const result = translator.translate(intents, emptyRaw, emptyExtend, 'test-tool');

        expect(result.files).toHaveProperty('test-tool-after-tool.sh');
        expect(result.files['test-tool-after-tool.sh']).toContain('PostToolUse');
    });

    it('onPermission intent 生成 PermissionRequest 脚本', () => {
        const intents: HookIntent[] = [{ type: 'onPermission', handler: () => 'allow' as const }];

        const result = translator.translate(intents, emptyRaw, emptyExtend, 'test-tool');

        expect(result.files).toHaveProperty('test-tool-permission.sh');
        expect(result.files['test-tool-permission.sh']).toContain('PermissionRequest');
    });

    it('raw hook 覆盖 intent 时输出 warning', () => {
        const intents: HookIntent[] = [{ type: 'inject', perTurn: 'test' }];

        const rawHooks = new Map<string, RawHookRegistration>([
            [
                'claude-code::UserPromptSubmit',
                {
                    agent: 'claude-code',
                    hookName: 'UserPromptSubmit',
                    handler: '#!/bin/bash\necho "raw"',
                },
            ],
        ]);

        const result = translator.translate(intents, rawHooks, emptyExtend, 'test-tool');

        expect(result.warnings.some((w) => w.includes('raw hook') && w.includes('UserPromptSubmit'))).toBe(true);
        // 不应有 intent 生成的 inject 脚本
        expect(result.files).not.toHaveProperty('test-tool-inject.sh');
        // 但应有 raw hook 的文件
        expect(result.files).toHaveProperty('test-tool-raw-userpromptsubmit.sh');
    });

    it('codex 翻译器生成相同格式', () => {
        const codexTranslator = new ClaudeCodeTranslator('codex');
        const intents: HookIntent[] = [{ type: 'inject', perTurn: 'codex test' }];

        const result = codexTranslator.translate(intents, emptyRaw, emptyExtend, 'test-tool');
        expect(result.files).toHaveProperty('test-tool-inject.sh');
    });

    it('无 intents 时返回空文件', () => {
        const result = translator.translate([], emptyRaw, emptyExtend, 'test-tool');
        expect(Object.keys(result.files)).toHaveLength(0);
    });
});

describe('OpenCodeTranslator', () => {
    const translator = new OpenCodeTranslator();

    it('inject intent 生成单文件插件', () => {
        const intents: HookIntent[] = [{ type: 'inject', perTurn: 'Check something.' }];

        const result = translator.translate(intents, emptyRaw, emptyExtend, 'test-tool');

        expect(result.files).toHaveProperty('test-tool-plugin.ts');
        const plugin = result.files['test-tool-plugin.ts'];
        expect(plugin).toContain('experimental.chat.messages.transform');
        expect(plugin).toContain('TestToolPlugin');
        expect(plugin).toContain('Check something.');
    });

    it('inject with compaction 包含 session.compacting 钩子', () => {
        const intents: HookIntent[] = [{ type: 'inject', perTurn: 'per-turn', compaction: 'compaction context' }];

        const result = translator.translate(intents, emptyRaw, emptyExtend, 'test-tool');
        const plugin = result.files['test-tool-plugin.ts'];

        expect(plugin).toContain('experimental.session.compacting');
        expect(plugin).toContain('compaction context');
    });

    it('inject 输出 experimental 警告', () => {
        const intents: HookIntent[] = [{ type: 'inject', perTurn: 'text' }];

        const result = translator.translate(intents, emptyRaw, emptyExtend, 'test-tool');
        expect(result.warnings.some((w) => w.includes('experimental'))).toBe(true);
    });

    it('beforeToolCall 输出 block 限制警告', () => {
        const intents: HookIntent[] = [{ type: 'beforeToolCall', handler: () => {} }];

        const result = translator.translate(intents, emptyRaw, emptyExtend, 'test-tool');
        expect(result.warnings.some((w) => w.includes('block'))).toBe(true);
    });

    it('多个 intent 合并到单文件', () => {
        const intents: HookIntent[] = [
            { type: 'inject', perTurn: 'reminder' },
            { type: 'beforeToolCall', handler: () => {} },
            { type: 'afterToolCall', handler: () => {} },
        ];

        const result = translator.translate(intents, emptyRaw, emptyExtend, 'test-tool');

        // 只有一个文件
        expect(Object.keys(result.files)).toHaveLength(1);
        const plugin = result.files['test-tool-plugin.ts'];
        expect(plugin).toContain('experimental.chat.messages.transform');
        expect(plugin).toContain('tool.execute.before');
        expect(plugin).toContain('tool.execute.after');
    });

    it('无 intents 时返回空文件', () => {
        const result = translator.translate([], emptyRaw, emptyExtend, 'test-tool');
        expect(Object.keys(result.files)).toHaveLength(0);
    });
});

describe('OpenClawTranslator', () => {
    const translator = new OpenClawTranslator();

    it('inject intent 生成 HOOK.md + handler.ts', () => {
        const intents: HookIntent[] = [
            {
                type: 'inject',
                perTurn: 'Check something.',
                sessionStart: 'Load context at start.',
            },
        ];

        const result = translator.translate(intents, emptyRaw, emptyExtend, 'test-tool');

        expect(result.files).toHaveProperty('HOOK.md');
        expect(result.files).toHaveProperty('handler.ts');
    });

    it('HOOK.md 包含工具名和事件列表', () => {
        const intents: HookIntent[] = [{ type: 'inject', perTurn: 'test' }];

        const result = translator.translate(intents, emptyRaw, emptyExtend, 'test-tool');
        const hookMd = result.files['HOOK.md'];

        expect(hookMd).toContain('name: test-tool');
        expect(hookMd).toContain('agent:bootstrap');
    });

    it('handler.ts 包含注入逻辑', () => {
        const intents: HookIntent[] = [
            { type: 'inject', perTurn: 'per-turn text', sessionStart: 'session start text' },
        ];

        const result = translator.translate(intents, emptyRaw, emptyExtend, 'test-tool');
        const handler = result.files['handler.ts'];

        expect(handler).toContain('per-turn text');
        expect(handler).toContain('session start text');
        expect(handler).toContain('TEST_TOOL_REMINDER.md');
    });

    it('onPermission 被标记为 skipped', () => {
        const intents: HookIntent[] = [{ type: 'onPermission', handler: () => 'allow' as const }];

        const result = translator.translate(intents, emptyRaw, emptyExtend, 'test-tool');

        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0].intent).toBe('onPermission');
        expect(result.skipped[0].agent).toBe('openclaw');
    });

    it('beforeToolCall intent 生成 before_tool_call 处理', () => {
        const intents: HookIntent[] = [{ type: 'beforeToolCall', match: /^Write/, handler: () => {} }];

        const result = translator.translate(intents, emptyRaw, emptyExtend, 'test-tool');
        const handler = result.files['handler.ts'];

        expect(handler).toContain('before_tool_call');
        expect(result.files['HOOK.md']).toContain('before_tool_call');
    });

    it('无 intents 时返回空文件', () => {
        const result = translator.translate([], emptyRaw, emptyExtend, 'test-tool');
        expect(Object.keys(result.files)).toHaveLength(0);
    });
});
