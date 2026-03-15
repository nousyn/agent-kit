# 003 - Hook 机制优化计划

日期：2026-03-15

## 背景

当前 hooks.ts 只实现了一个意图：内容注入（reminders）。四个 Agent 的 hook 系统在数量、协议、能力上差异巨大（详见 `docs/hook-comparison.md`），需要一套分层架构来平衡通用性和完整性。

## 设计原则

1. **Intent-based API** — 按使用者意图建模，不按 hook 名称建模
2. **三层优先级** — Intent（通用）< extend（微调）< raw（完全接管）
3. **显式降级** — 能力缺失不静默跳过，通过 warnings 明确告知
4. **0.x 阶段不背兼容债** — 未发包，架构干净优先，允许 breaking change

## 总体架构

```
┌─────────────────────────────────────────────┐
│  Intent API（核心，跨 Agent 一致语义）        │
│  hooks.inject() / hooks.beforeToolCall() ..  │
├─────────────────────────────────────────────┤
│  extend（在 Intent 结果基础上追加原生能力）    │
│  hooks.extend('claude-code', 'PreToolUse'..) │
├─────────────────────────────────────────────┤
│  raw（完全接管某 Agent 某原生 hook）           │
│  hooks.raw('openclaw', 'gateway_start', ..)  │
├─────────────────────────────────────────────┤
│  翻译器（内部，Intent → 原生 hook 文件生成）   │
│  buildClaudeCodeHook / buildOpenCodeHook ..   │
└─────────────────────────────────────────────┘
```

优先级冲突处理：

- raw 注册的原生 hook 与 Intent 生成的原生 hook 冲突时，raw 胜出 + 输出 warning
- extend 在 Intent 结果之后执行，可修改/追加但不替换
- installHooks() 返回值包含完整的 warnings 和 notes

## 实施阶段

### 阶段 1：类型基础与 Hook 注册中心

重构 hook 相关类型，建立集中式注册中心。从 `ToolConfig` 中移除 `reminders` 字段，hook 意图完全通过 `hooks.*` API 声明。

**任务：**

- 1.1 定义 Intent 类型体系
  - `InjectIntent` — 内容注入（perTurn / sessionStart / compaction / sessionEnd）
  - `BeforeToolCallIntent` — 工具调用前拦截（match / handler → block? / 修改 args?）
  - `AfterToolCallIntent` — 工具调用后观测（match / handler）
  - `OnSessionIntent` — 会话生命周期（start / end handler）
  - `OnPermissionIntent` — 权限决策（handler → allow / deny / ask）
  - `HookIntent = InjectIntent | BeforeToolCallIntent | ...`（联合类型）

- 1.2 定义 raw/extend 注册类型
  - `RawHookRegistration<A extends AgentType>` — agent + nativeHookName + handler 代码（字符串）
  - `ExtendHookRegistration<A extends AgentType>` — agent + nativeHookName + extender 函数

- 1.3 实现 Hook 注册中心（`src/hook-registry.ts`）
  - 模块级单例，存储 intents / raw / extend 注册
  - `hooks.inject(config)` / `hooks.beforeToolCall(config)` / ... → 写入 intents 数组
  - `hooks.raw(agent, hookName, handler)` → 写入 rawHooks map
  - `hooks.extend(agent, hookName, extender)` → 写入 extendHooks map
  - `hooks._resetForTesting()` — 测试用

- 1.4 更新 `HookInstallResult` 类型
  - 新增 `warnings: string[]` — 降级/冲突警告
  - 新增 `skipped: { intent: string; agent: string; reason: string }[]` — 被跳过的意图

### 阶段 2：翻译器重构

将当前的 `buildHookFiles` 从"只处理 reminders"扩展为"处理所有 intent 类型"。

**任务：**

- 2.1 定义翻译器接口
  - `AgentHookTranslator` — `translate(intents, rawHooks, extendHooks) → Record<filename, content>`
  - 每个 Agent 一个实现
  - 翻译器返回 `{ files, warnings, skipped }`

- 2.2 重构 Claude Code / Codex 翻译器
  - inject → UserPromptSubmit shell 脚本（现有逻辑迁移）
  - beforeToolCall → PreToolUse shell 脚本 + settings.json 条目
  - afterToolCall → PostToolUse shell 脚本 + settings.json 条目
  - onSession → SessionStart / SessionEnd shell 脚本
  - onPermission → PermissionRequest shell 脚本
  - raw → 直接写入用户提供的 handler 代码
  - extend → 包装生成的脚本，在末尾追加 extend 逻辑

- 2.3 重构 OpenCode 翻译器
  - inject → experimental.chat.messages.transform（现有逻辑迁移）
  - beforeToolCall → tool.execute.before 插件导出
  - afterToolCall → tool.execute.after 插件导出
  - onSession → event 钩子（过滤 session 相关事件）
  - onPermission → permission.ask 插件导出
  - raw → 直接合并到插件导出对象
  - 降级说明：beforeToolCall 的 block 能力有限（输出 warning）

- 2.4 重构 OpenClaw 翻译器
  - inject → agent:bootstrap handler（现有逻辑迁移）
  - beforeToolCall → before_tool_call 插件 hook
  - afterToolCall → after_tool_call 插件 hook
  - onSession → session_start / session_end 插件 hook
  - onPermission → 降级为 before_tool_call block（输出 warning）
  - raw → 写入额外的 HOOK.md + handler 文件

### 阶段 3：能力矩阵与降级引擎

**任务：**

- 3.1 定义能力矩阵数据结构（`src/hook-capabilities.ts`）
  - 每个 Intent 类型 × 每个 Agent × 每个子能力 → supported / partial / unsupported
  - 例：`beforeToolCall` × `opencode` × `block` → `partial`（需通过清空 args 模拟）
  - 例：`onPermission` × `openclaw` × `*` → `unsupported`

- 3.2 实现降级检查逻辑
  - `installHooks()` 内部调用能力矩阵，生成精确的 warnings
  - warning 格式：`[{agent}] {intent}.{capability}: {reason}. {workaround?}`
  - 例：`[opencode] beforeToolCall.block: OpenCode 的 tool.execute.before 无显式阻断机制，block 通过清空 args 模拟，行为可能不一致。`

- 3.3 冲突检测
  - Intent 生成的原生 hook 与 raw 注册冲突 → warning + raw 胜出
  - 多个 Intent 生成到同一个原生 hook → 合并到同一文件（如 OpenCode 的单一插件文件）

### 阶段 4：installHooks 重写

**任务：**

- 4.1 重写 `installHooks(agent)` 主流程
  - 从 Hook 注册中心读取所有 intents / raw / extend
  - 调用翻译器生成文件
  - 执行冲突检测和降级检查
  - 写入文件
  - 处理 agent 特有的安装后步骤（OpenClaw CLI 激活等）
  - 返回完整的 `HookInstallResult`（含 warnings / skipped）

- 4.2 清理 `ToolConfig` 和 `register()`
  - 从 `ToolConfig` 移除 `reminders` 字段
  - 从 `types.ts` 移除 `HookReminders` 类型
  - `register()` 只负责注册身份（name / prompt / dirs / envOverride）

- 4.3 新增 `uninstallHooks(agent)` 函数
  - 清理安装的 hook 文件
  - 清理 settings.json 中的条目（Claude Code / Codex）

### 阶段 5：测试

**任务：**

- 5.1 Hook 注册中心单元测试
  - 各 Intent 注册/读取
  - raw / extend 注册/读取
  - 冲突检测逻辑

- 5.2 各 Agent 翻译器单元测试
  - 每种 Intent → 文件内容快照测试
  - raw 覆盖 intent 的文件内容
  - extend 合并的文件内容

- 5.3 能力矩阵和降级测试
  - 各种降级场景的 warning 内容
  - 不支持的 Intent 的 skipped 返回

- 5.4 集成测试
  - 完整的 register → hooks.xxx → installHooks 流程

- 5.5 重写现有 hooks.test.ts
  - 将现有 11 个 hook 测试迁移到新 API

### 阶段 6：文档与导出

**任务：**

- 6.1 更新 `src/index.ts` 导出
  - 导出 hooks 命名空间对象（inject / beforeToolCall / afterToolCall / onSession / onPermission / raw / extend）
  - 导出新增类型

- 6.2 更新 `docs/hook-comparison.md`
  - 在每个能力行标注 agent-kit Intent API 是否覆盖

- 6.3 新增 `docs/hook-usage.md`
  - Intent API 使用示例
  - raw / extend 使用示例
  - 降级行为说明
  - 能力矩阵速查表

## 新增/修改文件清单

```
src/
├── hook-types.ts          (新增) Intent 类型、raw/extend 类型
├── hook-registry.ts       (新增) hooks 命名空间对象与注册中心
├── hook-capabilities.ts   (新增) 能力矩阵定义
├── hook-translators/      (新增) 翻译器目录
│   ├── types.ts           翻译器接口
│   ├── claude-code.ts     Claude Code / Codex 翻译器
│   ├── opencode.ts        OpenCode 翻译器
│   └── openclaw.ts        OpenClaw 翻译器
├── hooks.ts               (重写) installHooks / uninstallHooks / hasHooksInstalled
├── types.ts               (更新) 移除 HookReminders, HookInstallResult 增加 warnings / skipped
├── register.ts            (更新) 移除 reminders 相关逻辑
└── index.ts               (更新) 新增导出, 移除 HookReminders 导出

tests/
├── hook-registry.test.ts  (新增)
├── hook-translators.test.ts (新增)
├── hook-capabilities.test.ts (新增)
└── hooks.test.ts          (重写) 迁移到新 API

docs/
├── hook-comparison.md     (更新)
└── hook-usage.md          (新增)
```

## 风险与注意事项

1. **生成代码的正确性** — 翻译器生成的是要在各 Agent 运行时执行的代码（shell/ts），无法在 agent-kit 内部做完整的端到端测试，只能做快照测试 + 人工验证
2. **Agent 版本更新** — hook API 可能随 Agent 版本变化，能力矩阵需要版本标注和定期更新
3. **OpenCode 的 experimental 前缀** — 依赖的核心 hook（messages.transform / session.compacting）标记为实验性，有被移除/更改的风险
4. **单文件 vs 多文件** — OpenCode 插件是单个 .ts 文件，多个 Intent 需要合并到同一个文件中，合并逻辑复杂度较高
