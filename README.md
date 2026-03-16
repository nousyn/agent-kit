# Agent Kit

MCP Server / Skill 开发基础设施库。提供 agent 检测、prompt 注入、hook 安装和跨平台数据目录等通用能力，让多个 MCP/Skill 项目共享同一套 agent 适配层，避免重复实现。

## 功能

- **Agent 检测** — 通过文件系统特征或 MCP clientInfo 自动识别 agent 类型（OpenCode、Claude Code、OpenClaw、Codex）
- **Prompt 注入** — 向 agent 配置文件（`AGENTS.md`、`CLAUDE.md`、manifests 等）注入自定义指令，支持幂等更新
- **Hook 安装** — 用户提供完整 hook 内容，agent-kit 负责写入正确路径、管理 settings.json 和生命周期
- **跨平台数据目录** — 自动适配 macOS / Linux / Windows，支持 global / project 两种作用域
- **零运行时依赖** — 纯 TypeScript，零 dependencies
- **工厂模式** — `createKit(name)` 返回绑定了工具名的函数集，支持解构，无全局状态

## 安装

```bash
npm install @s_s/agent-kit
```

## 快速开始

```typescript
import { createKit, defineHooks, detectAgent } from '@s_s/agent-kit';

// 1. 创建 kit 实例
const { injectPrompt, installHooks, getDataDir } = createKit('my-mcp');

// 2. 声明 hook（每个 agent 独立声明，内容由用户完全控制）
// hooks/claude-code.ts
const claudeHooks = defineHooks('claude-code', [
  {
    events: ['UserPromptSubmit'],
    content: '#!/bin/bash\necho "<reminder>Use my-mcp tools.</reminder>"',
  },
  {
    events: ['PreToolUse'],
    content:
      '#!/bin/bash\n# 拦截危险操作\nTOOL_NAME="$HOOK_TOOL_NAME"\nif [[ "$TOOL_NAME" == "Bash" ]]; then echo "checked"; fi',
  },
]);

// hooks/opencode.ts
const opencodeHooks = defineHooks('opencode', {
  events: ['experimental.chat.messages.transform'],
  content: `export default {
    name: 'my-mcp',
    hooks: {
      'experimental.chat.messages.transform': async (messages) => {
        messages.push({ role: 'user', content: '<reminder>Use my-mcp tools.</reminder>' });
        return messages;
      },
    },
  };`,
});

// 3. 检测当前 agent
const agent = await detectAgent();
if (!agent) throw new Error('No supported agent detected');

// 4. 注入 prompt
await injectPrompt(agent, '## My MCP\nInstructions for the agent...');

// 5. 安装 hooks
const result = await installHooks(agent, [claudeHooks, opencodeHooks]);
console.log(`Hooks installed: ${result.filesWritten.join(', ')}`);

// 6. 获取数据目录路径
const dataDir = getDataDir(); // global scope
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

| 方法                                    | 说明                                                      |
| --------------------------------------- | --------------------------------------------------------- |
| `injectPrompt(agent, prompt, options?)` | 注入 prompt 到 agent 配置文件                             |
| `hasPromptInjected(agent, options?)`    | 检查 prompt 是否已注入                                    |
| `installHooks(agent, hooks)`            | 安装 hooks（传入 defineHooks 声明）                       |
| `uninstallHooks(agent)`                 | 卸载 hooks                                                |
| `hasHooksInstalled(agent)`              | 检查 hooks 是否已安装                                     |
| `getDataDir(options?)`                  | 获取跨平台数据目录路径                                    |
| `resolvePaths(agent, options?)`         | 解析 agent 相关路径（配置文件、hook 目录、settings 文件） |

### Kit 方法详情

#### `kit.injectPrompt(agent, prompt, options?)`

向 agent 配置文件注入提示内容。

```typescript
injectPrompt(agent: AgentType, prompt: string, options?: ScopeOptions): Promise<void>
```

- 首次调用：追加到文件末尾
- 后续调用：替换已有标记块（幂等更新）
- 自动创建目录和文件

#### `kit.installHooks(agent, hooks)`

为指定 agent 安装 hooks。接受一个或多个 `HookSet`（由 `defineHooks()` 返回），将内容写入 agent 的 hook 目录。

```typescript
installHooks(agent: AgentType, hooks: HookSet | HookSet[]): Promise<HookInstallResult>
```

- 自动过滤：只处理与 `agent` 匹配的 `HookSet`，其余忽略
- Claude Code / Codex：写入 shell 脚本 + 自动注册到 `settings.json`
- OpenCode：写入 TypeScript 插件文件到 plugins 目录
- OpenClaw：生成 `HOOK.md`（YAML frontmatter）+ `handler.ts`

返回值：

```typescript
interface HookInstallResult {
  success: boolean;
  hookDir: string;
  filesWritten: string[];
  settingsUpdated: boolean;
  notes: string[];
  warnings: string[];
  error?: string;
}
```

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

#### `kit.resolvePaths(agent, options?)`

解析指定 agent 的所有相关路径。自动使用 kit 的 `name` 作为 toolName，使用侧无需关心。

```typescript
resolvePaths(agent: AgentType, options?: ScopeOptions): AgentPaths
```

返回值：

```typescript
interface AgentPaths {
  configFile: string; // agent 配置文件路径（始终返回）
  hookDir?: string; // hook 目录路径（始终返回，因为 kit 已绑定 toolName）
  settingsFile?: string; // settings.json 路径（仅 claude-code / codex）
}
```

示例：

```typescript
const kit = createKit('mnemo');

// Global scope
const paths = kit.resolvePaths('claude-code');
// → {
//     configFile: '~/.claude/CLAUDE.md',
//     hookDir: '~/.claude/hooks/mnemo',
//     settingsFile: '~/.claude/settings.json',
//   }

// Project scope
const paths = kit.resolvePaths('opencode', { scope: 'project', projectRoot: '/my/project' });
// → {
//     configFile: '/my/project/AGENTS.md',
//     hookDir: '~/.config/opencode/plugins',
//   }
```

### Hook 系统

Hook 系统分为两个阶段：**声明**和**安装**。

1. **声明**：通过 `defineHooks(agent, definitions)` 纯函数声明 hook 内容。每个 agent 独立声明，内容由用户完全控制。支持分文件组织。
2. **安装**：调用 `kit.installHooks(agent, hooks)` 时，将声明内容写入目标 agent 的 hook 目录。

#### `defineHooks(agent, definitions)`

纯函数，不依赖任何实例或全局状态。做运行时校验（事件名合法性、content 非空），返回类型安全的 `HookSet` 数据对象。

```typescript
import { defineHooks } from '@s_s/agent-kit';

// 单条声明
const hooks = defineHooks('claude-code', {
  events: ['PreToolUse', 'PostToolUse'], // 多事件共享同一内容
  content: '#!/bin/bash\necho "hook fired"',
});

// 多条声明
const hooks = defineHooks('claude-code', [
  { events: ['PreToolUse'], content: '#!/bin/bash\necho "pre"' },
  { events: ['PostToolUse'], content: '#!/bin/bash\necho "post"' },
]);

// OpenClaw — 支持 description 参数
const hooks = defineHooks('openclaw', {
  events: ['session_start', 'before_tool_call'],
  content: 'export default async function(event) { return event; }',
  description: '注入项目规范到每轮对话',
});
```

**设计原则**：agent-kit 是"安装器"而非"翻译器"。用户提供各 agent 的原生 hook 内容，agent-kit 只负责：

- 知道正确的文件路径
- 写入文件
- 管理 settings.json 合并（Claude Code / Codex）
- 安装 / 卸载生命周期

详细的使用示例和各 agent 事件名列表，请参阅 **[Hook 使用指南](docs/hook-usage.md)**。各 agent 原生 hook 能力的完整横向对比，请参阅 **[Hook 横向对比](docs/hooks-comparison.md)**。

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

## 类型

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
  installHooks(agent: AgentType, hooks: HookSet | HookSet[]): Promise<HookInstallResult>;
  uninstallHooks(agent: AgentType): Promise<{ success: boolean; removed: string[]; error?: string }>;
  hasHooksInstalled(agent: AgentType): Promise<boolean>;
  getDataDir(options?: ScopeOptions): string;
  resolvePaths(agent: AgentType, options?: ScopeOptions): AgentPaths;
}

// Agent 路径
interface AgentPaths {
  configFile: string;
  hookDir?: string;
  settingsFile?: string;
}

// Hook 定义
interface HookDefinition<A extends AgentType = AgentType> {
  events: string[]; // agent 原生事件名
  content: string; // hook 内容（shell 脚本、TypeScript 代码等）
  description?: string; // OpenClaw 专属 — HOOK.md 描述
}

// defineHooks() 返回的数据对象
interface HookSet<A extends AgentType = AgentType> {
  readonly agent: A;
  readonly definitions: readonly HookDefinition<A>[];
}

interface HookInstallResult {
  success: boolean;
  hookDir: string;
  filesWritten: string[];
  settingsUpdated: boolean;
  notes: string[];
  warnings: string[];
  error?: string;
}
```

## 支持的 Agent

| Agent       | 检测方式                | Prompt 目标文件 | Hook 形式                  |
| ----------- | ----------------------- | --------------- | -------------------------- |
| OpenCode    | `opencode.json`         | `AGENTS.md`     | TypeScript 插件            |
| Claude Code | `.claude/settings.json` | `CLAUDE.md`     | Shell 脚本 + settings.json |
| OpenClaw    | `.openclaw/`            | manifest        | `HOOK.md` + `handler.ts`   |
| Codex       | `.codex/`               | `AGENTS.md`     | Shell 脚本 + settings.json |

> 各 agent 的完整 hook 能力横向对比，请参阅 [docs/hooks-comparison.md](docs/hooks-comparison.md)。

## 开发

```bash
git clone git@github.com:nousyn/agent-kit.git
cd agent-kit
npm install
npm run build
npm test
```

### 脚本

| 命令                   | 说明               |
| ---------------------- | ------------------ |
| `npm run build`        | 编译 TypeScript    |
| `npm run dev`          | 监听模式编译       |
| `npm test`             | 运行测试（Vitest） |
| `npm run test:watch`   | 监听模式测试       |
| `npm run prettier:fix` | 格式化所有文件     |
| `npm run release`      | 交互式发布流程     |

### 发布

```bash
npm run release
```

交互式脚本，依次执行：git 检查 → 分支检查 → 版本选择 → 格式化 → 测试 → 构建 → 发布 → 推送。

## 许可证

MIT
