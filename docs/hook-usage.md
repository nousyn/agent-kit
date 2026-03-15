# Hook 使用指南

> agent-kit 的 Hook 系统使用示例和参考。

## 设计理念

agent-kit 的 Hook 系统是**安装器**，不是翻译器。用户提供各 agent 的原生 hook 内容，agent-kit 负责：

- 知道正确的文件路径
- 写入文件并设置权限
- 管理 `settings.json` 合并（Claude Code / Codex）
- 生成 `HOOK.md` frontmatter（OpenClaw）
- 安装 / 卸载生命周期

## 快速开始

```ts
import { createKit, defineHooks } from '@s_s/agent-kit';

// 1. 创建 kit 实例
const kit = createKit('my-tool');

// 2. 声明 hook（分文件组织）
const claudeHooks = defineHooks('claude-code', {
  events: ['UserPromptSubmit'],
  content: '#!/bin/bash\necho "<reminder>Always check docs first.</reminder>"',
});

// 3. 安装到目标 agent
const result = await kit.installHooks('claude-code', claudeHooks);
console.log(result.filesWritten);
```

## defineHooks API

```ts
defineHooks(agent: AgentType, definitions: HookDefinition | HookDefinition[]): HookSet
```

### 参数

| 参数          | 类型                                 | 说明                 |
| ------------- | ------------------------------------ | -------------------- |
| `agent`       | `AgentType`                          | 目标 agent 类型      |
| `definitions` | `HookDefinition \| HookDefinition[]` | 单条或多条 hook 定义 |

### HookDefinition

| 字段          | 类型       | 说明                                                 |
| ------------- | ---------- | ---------------------------------------------------- |
| `events`      | `string[]` | agent 原生事件名数组（必填，至少一个）               |
| `content`     | `string`   | hook 内容（必填，shell 脚本 / TS 代码 / handler 等） |
| `description` | `string`   | OpenClaw 专属 — HOOK.md 描述（可选）                 |

### 运行时校验

`defineHooks` 会校验：

- agent 类型是否合法
- events 中的事件名是否属于该 agent
- content 是否非空

校验失败会直接抛错，确保问题在声明时就被发现。

## 各 Agent 使用示例

### Claude Code / Codex

Claude Code 使用 shell 脚本作为 hook。每个事件对应一个 `.sh` 文件，自动注册到 `~/.claude/settings.json`。

```ts
// 每轮注入提醒
const inject = defineHooks('claude-code', {
  events: ['UserPromptSubmit'],
  content: `#!/bin/bash
echo "<my-tool-reminder>
Always check project docs before making changes.
</my-tool-reminder>"`,
});

// 工具调用前后分别处理
const toolHooks = defineHooks('claude-code', [
  {
    events: ['PreToolUse'],
    content: `#!/bin/bash
TOOL_NAME="$HOOK_TOOL_NAME"
if [[ "$TOOL_NAME" == "Bash" ]]; then
  # 检查危险命令
  INPUT=$(cat -)
  COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
  if [[ "$COMMAND" == *"rm -rf"* ]]; then
    echo '{"decision":"block","reason":"Dangerous command"}'
    exit 0
  fi
fi`,
  },
  {
    events: ['PostToolUse'],
    content: `#!/bin/bash
# 记录工具调用
echo "Tool used: $HOOK_TOOL_NAME" >> /tmp/tool-log.txt`,
  },
]);

// 安装（传入多个 HookSet）
await kit.installHooks('claude-code', [inject, toolHooks]);
```

**生成的文件结构：**

```
~/.claude/hooks/my-tool/
├── my-tool-UserPromptSubmit.sh
├── my-tool-PreToolUse.sh
└── my-tool-PostToolUse.sh
```

`settings.json` 自动合并对应的 hook 条目。

### OpenCode

OpenCode 使用 TypeScript 插件。每个事件对应一个 `-plugin.ts` 文件，放在 `~/.config/opencode/plugins/` 目录。

```ts
const hooks = defineHooks('opencode', {
  events: ['experimental.chat.messages.transform'],
  content: `import type { Plugin } from 'opencode';

export default {
  name: 'my-tool',
  hooks: {
    'experimental.chat.messages.transform': async (messages) => {
      // 每轮注入提醒
      messages.push({
        role: 'user',
        content: '<my-tool-reminder>Check docs first.</my-tool-reminder>',
      });
      return messages;
    },
  },
} satisfies Plugin;`,
});

await kit.installHooks('opencode', hooks);
```

**生成的文件：**

```
~/.config/opencode/plugins/
└── my-tool-experimental-chat-messages-transform-plugin.ts
```

### OpenClaw

OpenClaw 使用 `HOOK.md`（YAML frontmatter）+ `handler.ts`。agent-kit 自动从参数生成 `HOOK.md`，用户只提供 `handler.ts` 内容。

```ts
const hooks = defineHooks('openclaw', {
  events: ['session_start', 'before_tool_call'],
  content: `export default async function handler(event: HookEvent) {
  if (event.type === 'session_start') {
    return {
      inject: '<my-tool-context>Project rules loaded.</my-tool-context>',
    };
  }

  if (event.type === 'before_tool_call') {
    // 可以拦截或修改工具调用
    return event;
  }
}`,
  description: '注入项目规范并监控工具调用',
});

await kit.installHooks('openclaw', hooks);
```

**生成的文件结构：**

```
~/.openclaw/hooks/my-tool/
├── HOOK.md       ← 自动生成（name, description, events）
└── handler.ts    ← 用户提供的内容
```

自动生成的 `HOOK.md`：

```yaml
---
name: my-tool
description: 注入项目规范并监控工具调用
events:
  - session_start
  - before_tool_call
---
```

**注意**：OpenClaw 只支持单条声明。传入数组时只取第一条，并输出 warning。

## 分文件组织

推荐将每个 agent 的 hook 声明放在独立文件中：

```
src/
├── hooks/
│   ├── claude-code.ts
│   ├── opencode.ts
│   └── openclaw.ts
├── kit.ts
└── install.ts
```

```ts
// hooks/claude-code.ts
import { defineHooks } from '@s_s/agent-kit';

export default defineHooks('claude-code', [
  { events: ['UserPromptSubmit'], content: '...' },
  { events: ['PreToolUse'], content: '...' },
]);

// hooks/opencode.ts
import { defineHooks } from '@s_s/agent-kit';

export default defineHooks('opencode', {
  events: ['experimental.chat.messages.transform'],
  content: '...',
});

// install.ts
import { createKit } from '@s_s/agent-kit';
import claudeHooks from './hooks/claude-code';
import opencodeHooks from './hooks/opencode';
import openclawHooks from './hooks/openclaw';

const kit = createKit('my-tool');
const agent = await detectAgent();
if (agent) {
  await kit.installHooks(agent, [claudeHooks, opencodeHooks, openclawHooks]);
  // installHooks 会自动过滤，只安装匹配 agent 的 hooks
}
```

没有循环依赖，没有全局状态，每个文件独立维护。

## 卸载 Hook

```ts
const { uninstallHooks } = createKit('my-tool');
const result = await uninstallHooks('claude-code');
console.log(result.removed); // 被删除的文件列表
```

## 事件名速查

使用 `getValidEvents()` 查询某个 agent 支持的所有事件名：

```ts
import { getValidEvents } from '@s_s/agent-kit';

const events = getValidEvents('claude-code');
// Set { 'SessionStart', 'UserPromptSubmit', 'PreToolUse', ... }
```

### Claude Code / Codex 事件

`SessionStart` `InstructionsLoaded` `UserPromptSubmit` `PreToolUse` `PermissionRequest` `PostToolUse` `PostToolUseFailure` `Notification` `SubagentStart` `SubagentStop` `Stop` `TeammateIdle` `TaskCompleted` `ConfigChange` `WorktreeCreate` `WorktreeRemove` `PreCompact` `PostCompact` `Elicitation` `ElicitationResult` `SessionEnd`

### OpenCode 事件

`event` `config` `tool` `auth` `chat.message` `chat.params` `chat.headers` `permission.ask` `command.execute.before` `tool.execute.before` `shell.env` `tool.execute.after` `experimental.chat.messages.transform` `experimental.chat.system.transform` `experimental.session.compacting` `experimental.text.complete` `tool.definition`

### OpenClaw 事件

**插件钩子：** `before_model_resolve` `before_prompt_build` `before_agent_start` `llm_input` `llm_output` `agent_end` `before_compaction` `after_compaction` `before_reset` `message_received` `message_sending` `message_sent` `before_tool_call` `after_tool_call` `tool_result_persist` `before_message_write` `session_start` `session_end` `subagent_spawning` `subagent_delivery_target` `subagent_spawned` `subagent_ended` `gateway_start` `gateway_stop`

**内部钩子：** `command:new` `command:reset` `command:stop` `session:compact:before` `session:compact:after` `agent:bootstrap` `gateway:startup` `message:received` `message:sent` `message:transcribed` `message:preprocessed`
