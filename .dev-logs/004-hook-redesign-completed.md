# 004 - Hook 机制优化完成

日期：2026-03-15

## 概要

完成了 `003-hook-redesign-plan.md` 中定义的全部 6 个阶段、22 个任务。
将 hook 系统从"仅处理 reminders"重构为完整的 Intent-based、三层优先级架构。

## 完成内容

### 阶段 1：类型基础与 Hook 注册中心

- **1.1 + 1.2** `src/hook-types.ts` — 5 种 Intent 类型（inject / beforeToolCall / afterToolCall / onSession / onPermission）、4 个 Agent 的原生 hook name 联合类型、Raw / Extend 注册类型
- **1.3** `src/hook-registry.ts` — 模块级单例注册中心，暴露 `hooks` 命名空间对象（inject / beforeToolCall / afterToolCall / onSession / onPermission / raw / extend / \_resetForTesting），以及只读访问器 API
- **1.4** `src/types.ts` — `HookInstallResult` 新增 `warnings: string[]` 和 `skipped: SkippedIntent[]` 字段

### 阶段 2：翻译器重构

- **2.1** `src/hook-translators/types.ts` — `AgentHookTranslator` 接口 + `TranslationResult` + `SettingsHookEntry` 类型
- **2.2** `src/hook-translators/claude-code.ts` — Claude Code / Codex 翻译器，支持 inject / beforeToolCall / afterToolCall / onSession / onPermission / raw / extend
- **2.3** `src/hook-translators/opencode.ts` — OpenCode 翻译器，所有 intent 合并到单文件插件，含 experimental 警告和 block 降级警告
- **2.4** `src/hook-translators/openclaw.ts` — OpenClaw 翻译器，双层 hook (内部 + 插件) 支持，onPermission 标记为 skipped
- **index.ts** — 统一导出

### 阶段 3：能力矩阵与降级引擎

- `src/hook-capabilities.ts` — 完整的能力矩阵数据（5 intent × 4 agent × 2-4 子能力）、`checkDegradation()` / `checkAllDegradation()` / `isIntentFullyUnsupported()` / `detectConflicts()` API

### 阶段 4：installHooks 重写

- **4.1** `src/hooks.ts` — 完全重写 `installHooks()` 主流程：注册中心读取 → 降级检查 → 翻译 → 文件写入 → settings.json 合并 → 后处理
- **4.2** 清理 `ToolConfig` 和 `register()` — 移除 `reminders` 字段和 `HookReminders` 类型
- **4.3** 新增 `uninstallHooks()` — 清理 hook 文件、settings.json 条目、OpenClaw CLI deactivate

### 阶段 5：测试

- `tests/hook-registry.test.ts` — 注册中心完整测试（14 个用例）
- `tests/hook-translators.test.ts` — 三个翻译器单元测试（20 个用例）
- `tests/hook-capabilities.test.ts` — 能力矩阵和降级引擎测试（12 个用例）
- `tests/hooks.test.ts` — 迁移旧测试到新 API（11 个用例）

**结果：8 个测试文件，87 个测试全部通过。**

### 阶段 6：文档与导出

- `src/index.ts` — 更新导出：hooks 命名空间、所有 intent 类型、能力矩阵 API、uninstallHooks
- `docs/hook-usage.md` — 新增完整使用指南（Intent API 示例、三层优先级、降级说明、能力速查）
- `.dev-logs/004-hook-redesign-completed.md` — 本文件

## Breaking Changes

- 移除 `HookReminders` 类型和 `ToolConfig.reminders` 字段
- 移除 `buildHookFiles()` 函数（内部，但旧测试依赖它）
- `HookInstallResult` 新增必填字段 `warnings` 和 `skipped`
- `installHooks()` 不再从 `config.reminders` 读取，必须通过 `hooks.inject()` 声明
- 0.1.0 未发包，无用户影响

## 新增文件

```
src/hook-types.ts              (270 行)
src/hook-registry.ts           (~220 行)
src/hook-capabilities.ts       (~230 行)
src/hook-translators/
    types.ts                   (~80 行)
    claude-code.ts             (~290 行)
    opencode.ts                (~250 行)
    openclaw.ts                (~280 行)
    index.ts                   (4 行)
tests/hook-registry.test.ts    (~165 行)
tests/hook-translators.test.ts (~200 行)
tests/hook-capabilities.test.ts (~115 行)
docs/hook-usage.md             (~180 行)
```

## 修改文件

```
src/hooks.ts          — 完全重写
src/types.ts          — 移除 HookReminders, ToolConfig 移除 reminders, 新增 SkippedIntent
src/index.ts          — 更新导出
tests/hooks.test.ts   — 迁移到新 API
```
