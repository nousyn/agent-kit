# Agent Kit

MCP Server / Skill 开发基础设施库。提供 agent 检测、prompt 注入、hook 安装和跨平台数据目录等通用能力，让多个 MCP/Skill 项目共享同一套 agent 适配层，避免重复实现。

## Features

- **Agent 检测** — 通过文件系统特征或 MCP clientInfo 自动识别 agent 类型（OpenCode、Claude Code、OpenClaw、Codex）
- **Prompt 注入** — 向 agent 配置文件（`AGENTS.md`、`CLAUDE.md`、manifests 等）注入自定义指令，支持幂等更新
- **Intent-based Hook 系统** — 按用户意图声明 hook 行为（注入内容、拦截工具调用、观测结果、权限决策等），内部自动翻译为各 agent 的原生格式
- **三层优先级** — Intent（通用）< extend（微调）< raw（完全接管），冲突时高层胜出并输出警告
- **显式降级** — 能力矩阵精确记录各 agent 对每种意图的支持程度，不静默跳过
- **跨平台数据目录** — 自动适配 macOS / Linux / Windows，支持 global / project 两种作用域
- **零运行时依赖** — 纯 TypeScript，零 dependencies
- **工厂模式** — `createKit(name)` 返回绑定了工具名的函数集，支持解构，无全局状态

## Install

```bash
npm install @s_s/agent-kit
```

## Quick Start

```typescript
import { createKit, hooks, detectAgent } from '@s_s/agent-kit';

// 1. 创建 kit 实例（支持解构）
const { injectPrompt, installHooks, getDataDir } = createKit('my-mcp');

// 2. 声明 hook 意图（全局 API，不绑定实例）
hooks.inject({
  perTurn: 'Remember to use my-mcp tools when relevant.',
  sessionStart: 'Welcome! Check my-mcp for context.',
  compaction: 'Preserve my-mcp context during compaction.',
});

hooks.beforeToolCall({
  match: /^Bash/,
  handler: (ctx) => {
    if (ctx.args.command?.includes('rm -rf')) {
      return { block: true, reason: 'Dangerous command blocked' };
    }
  },
});

// 3. 检测当前 agent
const agent = await detectAgent();
if (!agent) throw new Error('No supported agent detected');

// 4. 注入 prompt 到 agent 配置文件
await injectPrompt(agent, '## My MCP\nInstructions for the agent...');

// 5. 安装 hooks（自动翻译为 agent 原生格式）
const result = await installHooks(agent);
console.log(`Hooks installed: ${result.filesWritten.join(', ')}`);
console.log(`Warnings: ${result.warnings.join('\n')}`);

// 6. 获取数据目录路径
const dataDir = getDataDir(); // global scope
const projectDir = getDataDir({ scope: 'project', projectRoot: '/path/to/project' });
```

也可以不解构，直接使用 kit 对象：

```typescript
const kit = createKit('my-mcp');
await kit.injectPrompt(agent, prompt);
await kit.installHooks(agent);
```

## API

### `createKit(name, options?)`

创建一个绑定了工具名的 kit 实例。返回的对象包含所有需要工具名的函数。

```typescript
createKit(name: string, options?: KitOptions): Kit
```

| 参数                  | 类型                                    | 说明                             |
| --------------------- | --------------------------------------- | -------------------------------- |
| `name`                | `string`                                | 工具名称（必填）                 |
| `options.dirs`        | `{ global?: string, project?: string }` | 自定义数据目录名                 |
| `options.envOverride` | `string`                                | 覆盖全局数据目录路径的环境变量名 |

`name` 是整个包的核心锚点：

- Prompt 标记：`<!-- {name}:start -->` / `<!-- {name}:end -->`
- Hook 目录 / 文件名前缀
- 项目级数据目录：`.{name}`
- 环境变量：`{NAME}_DATA_DIR`（默认，大写 + 下划线）

返回的 Kit 对象包含以下方法：

| 方法                                    | 说明                          |
| --------------------------------------- | ----------------------------- |
| `injectPrompt(agent, prompt, options?)` | 注入 prompt 到 agent 配置文件 |
| `hasPromptInjected(agent, options?)`    | 检查 prompt 是否已注入        |
| `installHooks(agent)`                   | 安装 hooks                    |
| `uninstallHooks(agent)`                 | 卸载 hooks                    |
| `hasHooksInstalled(agent)`              | 检查 hooks 是否已安装         |
| `getDataDir(options?)`                  | 获取跨平台数据目录路径        |

### Hook 声明 API

通过 `hooks.*` 命名空间声明 hook 意图。`hooks` 是全局的，不绑定 kit 实例。所有声明在调用 `installHooks()` 时生效。

#### `hooks.inject(config)`

内容注入——将文本注入到 agent 上下文的各个生命周期点。

```typescript
hooks.inject({
  perTurn: string;        // 必填 — 每轮对话注入
  sessionStart?: string;  // 会话开始时注入
  compaction?: string;    // 上下文压缩前注入
  sessionEnd?: string;    // 会话结束时注入
});
```

#### `hooks.beforeToolCall(config)`

工具调用前拦截——可阻断或修改参数。

```typescript
hooks.beforeToolCall({
  match?: RegExp | string;  // 工具名匹配（正则或字符串，省略匹配全部）
  handler: (ctx: ToolCallContext) => ToolCallInterceptResult | void;
});
```

#### `hooks.afterToolCall(config)`

工具调用后观测——只读，无法修改。

```typescript
hooks.afterToolCall({
  match?: RegExp | string;
  handler: (ctx: ToolCallObserveContext) => void;
});
```

#### `hooks.onSession(config)`

会话生命周期回调。

```typescript
hooks.onSession({
  start?: (ctx: SessionContext) => void;
  end?: (ctx: SessionContext) => void;
});
```

#### `hooks.onPermission(config)`

权限决策拦截。

```typescript
hooks.onPermission({
  match?: RegExp | string;
  handler: (ctx: PermissionContext) => 'allow' | 'deny' | 'ask';
});
```

#### `hooks.raw(registration)`

绕过 Intent 层，直接写入 agent 原生 hook 代码。当 raw 与 Intent 冲突时，raw 胜出并输出 warning。

```typescript
hooks.raw({
  agent: 'claude-code',
  hookName: 'Notification',
  handler: '#!/bin/bash\ncurl -X POST https://webhook.example.com',
});
```

#### `hooks.extend(registration)`

在 Intent 生成的 hook 之后追加逻辑。不替换，只补充。

```typescript
hooks.extend({
  agent: 'opencode',
  hookName: 'tool.execute.after',
  handler: 'console.log("Tool execution completed");',
});
```

### Kit 方法详情

#### `kit.injectPrompt(agent, prompt, options?)`

向 agent 配置文件注入提示内容。

```typescript
injectPrompt(agent: AgentType, prompt: string, options?: ScopeOptions): Promise<void>
```

- 首次调用：追加到文件末尾
- 后续调用：替换已有标记块（幂等更新）
- 自动创建目录和文件

#### `kit.installHooks(agent)`

为指定 agent 安装 hooks。从 hook 注册中心读取所有声明，翻译为原生格式，写入文件。

```typescript
installHooks(agent: AgentType): Promise<HookInstallResult>
```

返回值包含完整的降级信息：

```typescript
interface HookInstallResult {
  success: boolean;
  hookDir: string;
  filesWritten: string[];
  settingsUpdated: boolean;
  notes: string[];
  warnings: string[]; // 降级/冲突警告
  skipped: SkippedIntent[]; // 被跳过的意图
  error?: string;
}
```

各 agent 的翻译方式：

| Agent               | 生成内容                                                |
| ------------------- | ------------------------------------------------------- |
| claude-code / codex | Shell 脚本（多个原生 hook），自动注册到 `settings.json` |
| openclaw            | `HOOK.md` + `handler.ts`（内部 hook + 插件 hook）       |
| opencode            | 单个 TypeScript 插件文件（多个 hook 合并）              |

#### `kit.uninstallHooks(agent)`

清理已安装的 hook 文件和 settings.json 条目。

```typescript
uninstallHooks(agent: AgentType): Promise<{ success: boolean; removed: string[]; error?: string }>
```

#### `kit.getDataDir(options?)`

获取跨平台数据目录路径。

```typescript
getDataDir(options?: ScopeOptions): string
```

| 作用域           | 路径                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `global`（默认） | macOS: `~/Library/Application Support/{name}` / Linux: `~/.local/share/{name}` / Windows: `%APPDATA%/{name}` |
| `project`        | `{projectRoot}/.{name}`                                                                                      |

全局路径可通过环境变量覆盖（默认变量名：`{NAME}_DATA_DIR`）。

### 独立函数

以下函数不依赖 kit 实例，可直接使用。

#### `detectAgent(cwd?)`

通过文件系统特征检测当前环境中的 agent 类型。

```typescript
detectAgent(cwd?: string): Promise<AgentType | null>
```

按固定顺序检测：opencode → claude-code → openclaw → codex。返回第一个匹配的类型，或 `null`。

#### `detectAgentFromClient(clientName)`

将 MCP `clientInfo.name` 映射为 `AgentType`。

```typescript
detectAgentFromClient(clientName: string): AgentType | null
```

| clientName            | AgentType     |
| --------------------- | ------------- |
| `opencode`            | `opencode`    |
| `claude-code`         | `claude-code` |
| `openclaw-acp-client` | `openclaw`    |
| `codex-mcp-client`    | `codex`       |

#### `detectProjectRoot(cwd?)`

检测项目根目录。

```typescript
detectProjectRoot(cwd?: string): Promise<string>
```

优先使用 `git rev-parse --show-toplevel`，失败则向上遍历查找标记文件（`.git`、`package.json`、`pyproject.toml`、`Cargo.toml`、`go.mod`），都未找到则回退到 `cwd`。

### 能力矩阵 API

编程式查询各 agent 对各 intent 的支持程度。

```typescript
import { CAPABILITY_MATRIX, checkDegradation, isIntentFullyUnsupported } from '@s_s/agent-kit';

// 查询特定能力
CAPABILITY_MATRIX.opencode.beforeToolCall.block.level; // 'partial'

// 检查某 intent 在某 agent 上的降级情况
const warnings = checkDegradation('opencode', 'beforeToolCall');

// 检查是否完全不支持
isIntentFullyUnsupported('openclaw', 'onPermission'); // true
```

## Types

```typescript
type AgentType = 'opencode' | 'claude-code' | 'openclaw' | 'codex';

type StorageScope = 'global' | 'project';

interface ScopeOptions {
  scope?: StorageScope; // 默认 'global'
  projectRoot?: string; // scope 为 'project' 时必填
}

interface KitOptions {
  dirs?: { global?: string; project?: string };
  envOverride?: string;
}

interface Kit {
  readonly name: string;
  injectPrompt(agent: AgentType, prompt: string, options?: ScopeOptions): Promise<void>;
  hasPromptInjected(agent: AgentType, options?: ScopeOptions): Promise<boolean>;
  installHooks(agent: AgentType): Promise<HookInstallResult>;
  uninstallHooks(agent: AgentType): Promise<{ success: boolean; removed: string[]; error?: string }>;
  hasHooksInstalled(agent: AgentType): Promise<boolean>;
  getDataDir(options?: ScopeOptions): string;
}

interface HookInstallResult {
  success: boolean;
  hookDir: string;
  filesWritten: string[];
  settingsUpdated: boolean;
  notes: string[];
  warnings: string[];
  skipped: SkippedIntent[];
  error?: string;
}

interface SkippedIntent {
  intent: string;
  agent: string;
  reason: string;
}

type SupportLevel = 'supported' | 'partial' | 'unsupported';
```

## Supported Agents

| Agent       | 检测方式                | Prompt 目标文件 | Hook 形式                  |
| ----------- | ----------------------- | --------------- | -------------------------- |
| OpenCode    | `opencode.json`         | `AGENTS.md`     | TypeScript 插件            |
| Claude Code | `.claude/settings.json` | `CLAUDE.md`     | Shell 脚本 + settings.json |
| OpenClaw    | `.openclaw/`            | manifest        | `HOOK.md` + `handler.ts`   |
| Codex       | `.codex/`               | `AGENTS.md`     | Shell 脚本 + settings.json |

## Development

```bash
git clone git@github.com:nousyn/agent-kit.git
cd agent-kit
npm install
npm run build
npm test
```

### Scripts

| Command                | Description                  |
| ---------------------- | ---------------------------- |
| `npm run build`        | Compile TypeScript           |
| `npm run dev`          | Watch mode compilation       |
| `npm test`             | Run tests (Vitest)           |
| `npm run test:watch`   | Watch mode tests             |
| `npm run prettier:fix` | Format all files             |
| `npm run release`      | Interactive release workflow |

### Release

```bash
npm run release
```

Interactive script that walks through: git check → branch check → version selection → format → test → build → publish → push.

## License

MIT
