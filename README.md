# Agent Kit

MCP Server / Skill 开发基础设施库。提供 agent 检测、prompt 注入、hook 安装和跨平台数据目录等通用能力，让多个 MCP/Skill 项目共享同一套 agent 适配层，避免重复实现。

## 功能

- **Agent 检测** — 通过文件系统特征或 MCP clientInfo 自动识别 agent 类型（OpenCode、Claude Code、OpenClaw、Codex）
- **Prompt 注入** — 向 agent 配置文件（`AGENTS.md`、`CLAUDE.md`、manifests 等）注入自定义指令，支持幂等更新
- **Intent-based Hook 系统** — 按意图声明，自动翻译为各 agent 原生格式，支持三层优先级和显式降级
- **跨平台数据目录** — 自动适配 macOS / Linux / Windows，支持 global / project 两种作用域
- **零运行时依赖** — 纯 TypeScript，零 dependencies
- **工厂模式** — `createKit(name)` 返回绑定了工具名的函数集，支持解构，无全局状态

## 安装

```bash
npm install @s_s/agent-kit
```

## 快速开始

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

### Hook 系统

Hook 系统分为两个阶段：**声明**和**安装**。

1. **声明**：通过全局 `hooks.*` API 声明意图（`inject` / `beforeToolCall` / `afterToolCall` / `onSession` / `onPermission`），以及 `raw` / `extend` 两种高级注册方式
2. **安装**：调用 `kit.installHooks(agent)` 时，从全局注册中心读取所有声明，翻译为目标 agent 的原生格式并写入磁盘

详细的 API 说明、示例、三层优先级机制和降级行为，请参阅 **[Hook 使用指南](docs/hook-usage.md)**。各 agent 原生 hook 能力的完整横向对比，请参阅 **[Hook 横向对比](docs/hooks-comparison.md)**。

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
