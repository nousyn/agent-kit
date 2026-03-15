# 006 — Hook 系统重写：从翻译器到安装器

日期：2026-03-16

## 背景

v1.0.0 的 Intent-based Hook 系统在实际评估中暴露了根本性问题：

1. **handler 函数不可序列化** — `beforeToolCall`、`afterToolCall`、`onPermission` 的 JS 回调函数在跨进程 agent（Claude Code/Codex fork shell 脚本）中无法执行，三个翻译器的 handler 实现全部是占位符注释
2. **翻译器硬编码了业务逻辑** — OpenCode 翻译器内嵌 `_seenSessions` 状态追踪和 sessionID 判断；OpenClaw 翻译器硬编码 `subagent` 过滤。这些本该由用户决定
3. **唯一真正可用的功能是纯文本注入**（`inject.perTurn`），其他 intent 类型跨 agent 均不工作
4. **能力矩阵和降级系统维护成本高**，但对只需要文本注入的实际场景毫无价值

结论：Intent 层、翻译器层、能力矩阵应全部删除。新模型是 agent-kit 作为"安装器"，用户提供完整 hook 内容。

## 新设计

### 核心 API

```ts
// 1. 声明（纯函数，无副作用，无全局状态）
const hooks = defineHooks('claude-code', {
  events: ['PreToolUse', 'PostToolUse'],
  content: '#!/bin/bash\n...',
});

// 2. 安装（kit 实例方法）
await kit.installHooks('claude-code', hooks);
```

### 关键决策

- **events 统一为数组** — 所有 agent 用同一种声明形态。一条声明 = events[] + content。Claude Code 等"一文件一事件"的 agent，内部自动拆分为多文件
- **声明/安装分离** — `defineHooks()` 是纯函数返回数据对象，`installHooks()` 接收数据。支持分文件组织，无循环依赖
- **OpenClaw 特殊处理** — 多条声明只取第一条 + warning（OpenClaw 一个 hook = 一对 HOOK.md + handler.ts）
- **HOOK.md 自动生成** — name 从 kit name 派生，events 从声明提取，description 为可选参数（默认 `"Hook installed by {name}"`）
- **运行时事件名校验** — `defineHooks()` 校验事件名是否属于目标 agent 的合法事件集

### agent-kit 的职责边界

agent-kit **只负责**：

- 知道各 agent 的 hook 文件路径
- 写入用户提供的内容到正确位置
- 管理 settings.json 合并（Claude Code / Codex）
- 生成 OpenClaw HOOK.md frontmatter
- 安装/卸载生命周期（OpenClaw CLI 激活/停用）

agent-kit **不负责**：

- 将抽象意图翻译为原生代码（已删除）
- 跨 agent 功能抽象（已删除）
- 能力矩阵和降级检查（已删除）

## 删除的文件

- `src/hook-types.ts` (270行) — 5 种 intent 类型定义
- `src/hook-registry.ts` (261行) — 全局 hooks.\* 注册表
- `src/hook-capabilities.ts` (293行) — 能力矩阵 + 降级检查
- `src/hook-translators/` (5文件，1116行) — 三个翻译器 + 类型
- `tests/hook-registry.test.ts`
- `tests/hook-translators.test.ts`
- `tests/hook-capabilities.test.ts`

总计删除约 1940 行代码。

## 新增/重写的文件

- `src/define-hooks.ts` (新增) — defineHooks 纯函数 + 事件名校验
- `src/hooks.ts` (重写) — 简化为文件写入 + settings.json 合并
- `src/types.ts` (更新) — 新增 HookDefinition、HookSet、AgentEventMap 等类型
- `src/create-kit.ts` (更新) — installHooks 新签名
- `src/index.ts` (更新) — 移除旧导出，添加新导出
- `tests/define-hooks.test.ts` (新增) — defineHooks 校验测试
- `tests/hooks.test.ts` (重写) — 文件写入集成测试
- `README.md` (更新) — Hook 章节全面重写
- `docs/hook-usage.md` (重写) — 新 API 使用指南

## 测试

63 个测试全部通过（6 个测试文件）。构建无错误。
