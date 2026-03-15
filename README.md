# Agent Kit

MCP Server / Skill 开发基础设施库。提供 agent 检测、prompt 注入、hook 安装和跨平台数据目录等通用能力，让多个 MCP/Skill 项目共享同一套 agent 适配层，避免重复实现。

## Features

- **Agent 检测** — 通过文件系统特征或 MCP clientInfo 自动识别 agent 类型（OpenCode、Claude Code、OpenClaw、Codex）
- **Prompt 注入** — 向 agent 配置文件（`AGENTS.md`、`CLAUDE.md`、manifests 等）注入自定义指令，支持幂等更新
- **Hook 系统** — 声明式配置生命周期提醒（per-turn、session-start、compaction、session-end），内部处理各 agent 的格式差异
- **跨平台数据目录** — 自动适配 macOS / Linux / Windows，支持 global / project 两种作用域
- **零运行时依赖** — 纯 TypeScript，零 dependencies
- **函数式 API + 单例注册** — `register()` 一次配置，后续函数自动读取，无需逐个传参

## Install

```bash
npm install @s_s/agent-kit
```

## Quick Start

```typescript
import { register, detectAgent, injectPrompt, installHooks, getDataDir } from '@s_s/agent-kit';

// 1. 注册工具配置（必须首先调用）
register({
  name: 'my-mcp',
  prompt: '## My MCP\nInstructions for the agent...',
  reminders: {
    perTurn: 'Remember to use my-mcp tools when relevant.',
    sessionStart: 'Welcome! Check my-mcp for context.',
  },
});

// 2. 检测当前 agent
const agent = await detectAgent();
if (!agent) throw new Error('No supported agent detected');

// 3. 注入 prompt 到 agent 配置文件
await injectPrompt(agent);

// 4. 安装生命周期 hooks
const result = await installHooks(agent);
console.log(`Hooks installed: ${result.filesWritten.join(', ')}`);

// 5. 获取数据目录路径
const dataDir = getDataDir(); // global scope
const projectDir = getDataDir({ scope: 'project', projectRoot: '/path/to/project' });
```

## API

### `register(config)`

注册工具配置。**必须在使用其他依赖配置的函数之前调用一次。**

```typescript
register(config: ToolConfig): void
```

| 参数                 | 类型                                    | 说明                                                          |
| -------------------- | --------------------------------------- | ------------------------------------------------------------- |
| `config.name`        | `string`                                | 工具名称（必填）。决定 prompt 标记、hook 目录名、数据目录名等 |
| `config.prompt`      | `string`                                | 注入 agent 配置文件的提示内容（必填）                         |
| `config.reminders`   | `HookReminders`                         | 生命周期提醒文本（安装 hooks 时必填）                         |
| `config.dirs`        | `{ global?: string, project?: string }` | 自定义数据目录名                                              |
| `config.envOverride` | `string`                                | 覆盖全局数据目录路径的环境变量名                              |

`name` 是整个包的核心锚点：

- Prompt 标记：`<!-- {name}:start -->` / `<!-- {name}:end -->`
- Hook 目录 / 文件名前缀
- 项目级数据目录：`.{name}`
- 环境变量：`{NAME}_DATA_DIR`（默认，大写 + 下划线）

### `detectAgent(cwd?)`

通过文件系统特征检测当前环境中的 agent 类型。不需要 `register()`。

```typescript
detectAgent(cwd?: string): Promise<AgentType | null>
```

按固定顺序检测：opencode → claude-code → openclaw → codex。返回第一个匹配的类型，或 `null`。

### `detectAgentFromClient(clientName)`

将 MCP `clientInfo.name` 映射为 `AgentType`。不需要 `register()`。

```typescript
detectAgentFromClient(clientName: string): AgentType | null
```

| clientName            | AgentType     |
| --------------------- | ------------- |
| `opencode`            | `opencode`    |
| `claude-code`         | `claude-code` |
| `openclaw-acp-client` | `openclaw`    |
| `codex-mcp-client`    | `codex`       |

### `detectProjectRoot(cwd?)`

检测项目根目录。不需要 `register()`。

```typescript
detectProjectRoot(cwd?: string): Promise<string>
```

优先使用 `git rev-parse --show-toplevel`，失败则向上遍历查找标记文件（`.git`、`package.json`、`pyproject.toml`、`Cargo.toml`、`go.mod`），都未找到则回退到 `cwd`。

### `injectPrompt(agent, options?)`

向 agent 配置文件注入提示内容。需要 `register()`。

```typescript
injectPrompt(agent: AgentType, options?: ScopeOptions): Promise<void>
```

- 首次调用：追加到文件末尾
- 后续调用：替换已有标记块（幂等更新）
- 自动创建目录和文件

### `hasPromptInjected(agent, options?)`

检查提示是否已注入。

```typescript
hasPromptInjected(agent: AgentType, options?: ScopeOptions): Promise<boolean>
```

### `installHooks(agent)`

为指定 agent 安装生命周期 hooks。需要 `register()` 且 `config.reminders` 不为空。

```typescript
installHooks(agent: AgentType): Promise<HookInstallResult>
```

各 agent 的 hook 形式：

| Agent               | 生成内容                                                          |
| ------------------- | ----------------------------------------------------------------- |
| claude-code / codex | Shell 脚本（`UserPromptSubmit` hook），自动注册到 `settings.json` |
| openclaw            | `HOOK.md` + `handler.ts`（`agent:bootstrap` 事件）                |
| opencode            | TypeScript 插件（区分新会话 / 后续轮次 / compaction）             |

### `hasHooksInstalled(agent)`

检查 hooks 是否已安装。

```typescript
hasHooksInstalled(agent: AgentType): Promise<boolean>
```

### `getDataDir(options?)`

获取跨平台数据目录路径。需要 `register()`。

```typescript
getDataDir(options?: ScopeOptions): string
```

| 作用域           | 路径                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `global`（默认） | macOS: `~/Library/Application Support/{name}` / Linux: `~/.local/share/{name}` / Windows: `%APPDATA%/{name}` |
| `project`        | `{projectRoot}/.{name}`                                                                                      |

全局路径可通过环境变量覆盖（默认变量名：`{NAME}_DATA_DIR`）。

## Types

```typescript
type AgentType = 'opencode' | 'claude-code' | 'openclaw' | 'codex';

type StorageScope = 'global' | 'project';

interface ScopeOptions {
  scope?: StorageScope; // 默认 'global'
  projectRoot?: string; // scope 为 'project' 时必填
}

interface HookReminders {
  perTurn: string; // 必填
  sessionStart?: string;
  compaction?: string; // 仅 OpenCode
  sessionEnd?: string;
}

interface ToolConfig {
  name: string;
  prompt: string;
  reminders?: HookReminders;
  dirs?: { global?: string; project?: string };
  envOverride?: string;
}

interface HookInstallResult {
  success: boolean;
  hookDir: string;
  filesWritten: string[];
  settingsUpdated: boolean;
  notes: string[];
  error?: string;
}
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
