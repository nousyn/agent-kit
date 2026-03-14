import { describe, it, expect } from 'vitest';
import { applyPromptInjection } from '../src/prompt.js';

describe('applyPromptInjection', () => {
    const name = 'test-tool';
    const prompt = '## Test Tool\nSome instructions here.';

    it('空内容时注入 prompt block', () => {
        const result = applyPromptInjection('', name, prompt);
        expect(result).toContain('<!-- test-tool:start -->');
        expect(result).toContain('## Test Tool');
        expect(result).toContain('<!-- test-tool:end -->');
    });

    it('已有内容时追加到末尾', () => {
        const existing = '# My Config\nSome existing content.';
        const result = applyPromptInjection(existing, name, prompt);
        expect(result.startsWith('# My Config')).toBe(true);
        expect(result).toContain('<!-- test-tool:start -->');
        expect(result).toContain('## Test Tool');
    });

    it('已有注入块时替换而非追加', () => {
        const existing = `# Header
<!-- test-tool:start -->
old content
<!-- test-tool:end -->
# Footer`;
        const result = applyPromptInjection(existing, name, prompt);

        // 只有一个 start marker
        const startCount = result.split('<!-- test-tool:start -->').length - 1;
        expect(startCount).toBe(1);

        // 内容被替换
        expect(result).not.toContain('old content');
        expect(result).toContain('## Test Tool');

        // 周围内容保留
        expect(result).toContain('# Header');
        expect(result).toContain('# Footer');
    });

    it('不同工具的 marker 互不干扰', () => {
        const existing = `<!-- other-tool:start -->
other content
<!-- other-tool:end -->`;
        const result = applyPromptInjection(existing, name, prompt);

        // 两个工具的块都存在
        expect(result).toContain('<!-- other-tool:start -->');
        expect(result).toContain('<!-- test-tool:start -->');
        expect(result).toContain('other content');
    });

    it('多次注入是幂等的', () => {
        const first = applyPromptInjection('', name, prompt);
        const second = applyPromptInjection(first, name, prompt);
        expect(first).toBe(second);
    });
});
