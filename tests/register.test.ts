import { describe, it, expect, beforeEach } from 'vitest';
import { register, getConfig, _resetForTesting } from '../src/register.js';

describe('register', () => {
    beforeEach(() => {
        _resetForTesting();
    });

    it('注册后 getConfig 返回配置', () => {
        register({ name: 'test-tool', prompt: 'test prompt' });
        const config = getConfig();
        expect(config.name).toBe('test-tool');
        expect(config.prompt).toBe('test prompt');
    });

    it('未注册时 getConfig 抛错', () => {
        expect(() => getConfig()).toThrow('No tool registered. Call register() first.');
    });

    it('name 为空时抛错', () => {
        expect(() => register({ name: '', prompt: 'test' })).toThrow('name is required');
    });

    it('prompt 为空时抛错', () => {
        expect(() => register({ name: 'test', prompt: '' })).toThrow('prompt is required');
    });

    it('重复注册会覆盖之前的配置', () => {
        register({ name: 'first', prompt: 'prompt-1' });
        register({ name: 'second', prompt: 'prompt-2' });
        expect(getConfig().name).toBe('second');
    });

    it('注册时传入的 config 是副本，修改原对象不影响已注册配置', () => {
        const config = { name: 'test', prompt: 'original' };
        register(config);
        config.prompt = 'modified';
        expect(getConfig().prompt).toBe('original');
    });
});
