# Hook 使用指南

> agent-kit 的 Intent-based Hook API 使用示例和参考。

## 快速开始

```ts
import { register, hooks, installHooks } from '@s_s/agent-kit';

// 1. 注册工具身份
register({
  name: 'my-tool',
  prompt: 'My tool system prompt...',
});

// 2. 声明 hook 意图
hooks.inject({
  perTurn: '每轮提示文本',
  sessionStart: '会话开始提示文本',
  compaction: '上下文压缩时保留的文本',
});

// 3. 安装到目标 Agent
const result = await installHooks('claude-code');
console.log(result.warnings); // 降级/冲突警告
console.log(result.skipped); // 被跳过的意图
```

## Intent API

### hooks.inject() — 内容注入

将文本注入到 Agent 的上下文中。这是最常用的 hook 意图。

```ts
hooks.inject({
  perTurn: '必填 — 每轮对话都会注入的提醒文本',
  sessionStart: '可选 — 会话开始时注入',
  compaction: '可选 — 上下文压缩前注入',
  sessionEnd: '可选 — 会话结束时注入',
});
```

**各 Agent 支持情况：**

| 子能力       | Claude Code | Codex | OpenCode        | OpenClaw      |
| ------------ | ----------- | ----- | --------------- | ------------- |
| perTurn      | ✅          | ✅    | ✅              | ✅            |
| sessionStart | ✅          | ✅    | ✅              | ✅            |
| compaction   | ✅          | ✅    | ⚠️ experimental | ✅            |
| sessionEnd   | ✅          | ✅    | ❌              | ⚠️ 可能不传达 |

### hooks.beforeToolCall() — 工具调用前拦截

在工具调用执行前进行拦截，可以阻断或修改参数。

```ts
hooks.beforeToolCall({
  match: /^(Bash|Write)/, // 可选 — 正则匹配工具名
  handler: (ctx) => {
    // ctx.toolName — 工具名
    // ctx.args — 工具参数
    if (ctx.args.path?.includes('/etc/')) {
      return { block: true, reason: '不允许修改 /etc/ 目录' };
    }
    // 修改参数
    return { args: { ...ctx.args, verbose: true } };
  },
});
```

**各 Agent 支持情况：**

| 子能力     | Claude Code | Codex | OpenCode      | OpenClaw      |
| ---------- | ----------- | ----- | ------------- | ------------- |
| intercept  | ✅          | ✅    | ✅            | ✅            |
| block      | ✅          | ✅    | ⚠️ 模拟       | ✅            |
| modifyArgs | ✅          | ✅    | ✅            | ✅            |
| matcher    | ✅          | ✅    | ❌ 代码内过滤 | ❌ 代码内过滤 |

### hooks.afterToolCall() — 工具调用后观测

观测工具调用结果，不能修改。

```ts
hooks.afterToolCall({
  match: 'Bash',
  handler: (ctx) => {
    console.log(`${ctx.toolName} 返回: ${ctx.result}`);
    if (ctx.error) console.error(`错误: ${ctx.error}`);
  },
});
```

### hooks.onSession() — 会话生命周期

在会话开始/结束时执行逻辑。

```ts
hooks.onSession({
  start: (ctx) => console.log('会话开始:', ctx.sessionId),
  end: (ctx) => console.log('会话结束:', ctx.sessionId),
});
```

### hooks.onPermission() — 权限决策

拦截权限请求并决定 allow/deny/ask。

```ts
hooks.onPermission({
  match: 'Bash',
  handler: (ctx) => {
    if (ctx.args.command?.startsWith('git ')) return 'allow';
    return 'ask';
  },
});
```

**注意：** OpenClaw 不支持此意图。

## 三层优先级

### 1. Intent（通用层）

上面介绍的 `hooks.inject()` / `hooks.beforeToolCall()` 等都是 Intent 层。
Intent 由翻译器转换为各 Agent 的原生 hook。

### 2. Extend（微调层）

在 Intent 生成的 hook 之后追加逻辑。不能替换，只能补充。

```ts
hooks.extend({
  agent: 'opencode',
  hookName: 'tool.execute.after',
  handler: 'console.log("Tool execution completed");',
});
```

### 3. Raw（完全接管层）

绕过 Intent 层，直接写入原生 hook 代码。当 raw 与 Intent 冲突时，raw 胜出并输出 warning。

```ts
hooks.raw({
  agent: 'claude-code',
  hookName: 'Notification',
  handler: '#!/bin/bash\ncurl -X POST https://webhook.example.com',
});
```

## 降级行为

`installHooks()` 返回值包含完整的降级信息：

```ts
const result = await installHooks('opencode');

// warnings: 降级和冲突警告
for (const w of result.warnings) {
  console.warn(w);
  // 例: [opencode] inject.compaction: Relies on experimental.session.compacting...
}

// skipped: 完全跳过的意图
for (const s of result.skipped) {
  console.warn(`${s.intent} skipped on ${s.agent}: ${s.reason}`);
}
```

## 能力矩阵速查

使用编程式 API 查询能力：

```ts
import { CAPABILITY_MATRIX, checkDegradation, isIntentFullyUnsupported } from '@s_s/agent-kit';

// 查询特定能力
const level = CAPABILITY_MATRIX.opencode.beforeToolCall.block.level;
// 'partial'

// 检查降级
const warnings = checkDegradation('opencode', 'beforeToolCall');

// 检查是否完全不支持
const unsupported = isIntentFullyUnsupported('openclaw', 'onPermission');
// true
```

## 卸载 Hook

```ts
import { uninstallHooks } from '@s_s/agent-kit';

const result = await uninstallHooks('claude-code');
console.log(result.removed); // 被删除的文件列表
```
