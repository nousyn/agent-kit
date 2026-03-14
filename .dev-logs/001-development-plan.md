# 001 - agent-kit 开发计划

日期：2026-03-14

## 项目定位

面向 MCP Server 与 Skill 开发的 Agent 适配工具包：检测、提示词注入、钩子安装、跨平台数据目录。

npm 包名：`@s_s/agent-kit`

## 设计决策

1. **面向函数 + 模块级单例 register 模式** — 不用 class，通过 `register()` 写入配置，后续函数自动读取
2. **AgentType 硬编码 4 种** — opencode、claude-code、openclaw、codex，不支持扩展
3. **Scope** — 支持 global/project，默认 global
4. **钩子** — 声明式配置 + 高层工厂函数，调用方只传 reminders 内容，包内部处理各 agent 差异
5. **纯库** — 只导出函数，不含 CLI

## 公共 API（9 个函数）

### 需要先 register

| 函数                                 | 职责                                                |
| ------------------------------------ | --------------------------------------------------- |
| `register(config)`                   | 注册工具配置（name、prompt、reminders），模块级单例 |
| `injectPrompt(agent, options?)`      | 注入/更新提示词到 agent 配置文件                    |
| `hasPromptInjected(agent, options?)` | 检测提示词是否已注入                                |
| `installHooks(agent)`                | 生成并安装各 agent 的钩子文件                       |
| `hasHooksInstalled(agent)`           | 检测钩子是否已安装                                  |
| `getDataDir(options?)`               | 获取跨平台数据目录路径（global 或 project）         |

### 独立函数

| 函数                                | 职责                                     |
| ----------------------------------- | ---------------------------------------- |
| `detectAgent(cwd?)`                 | 通过文件存在性探测 agent 类型            |
| `detectAgentFromClient(clientName)` | 通过 MCP clientInfo.name 映射 agent 类型 |
| `detectProjectRoot(cwd?)`           | 探测项目根目录（git root > 标记文件）    |

## 技术栈

- TypeScript 5.9 ESM
- Vitest 4.0
- Prettier 3.8
- Husky 9

与 mnemo 保持一致。

## 实现计划

### 第一阶段：项目初始化

1. 项目脚手架 — package.json、tsconfig.json、vitest、prettier、husky
2. 类型定义 `src/types.ts`

### 第二阶段：核心实现

按依赖顺序：

3. `src/register.ts` — register + 内部 getConfig
4. `src/platform.ts` — getDataDir、detectProjectRoot
5. `src/detect.ts` — detectAgent、detectAgentFromClient
6. `src/prompt.ts` — injectPrompt、hasPromptInjected
7. `src/hooks.ts` — installHooks、hasHooksInstalled
8. `src/index.ts` — 统一导出

### 第三阶段：测试

9. 每个模块对应测试文件

## 目录结构

```
agent-kit/
├── src/
│   ├── types.ts
│   ├── register.ts
│   ├── platform.ts
│   ├── detect.ts
│   ├── prompt.ts
│   ├── hooks.ts
│   └── index.ts
├── tests/
│   ├── register.test.ts
│   ├── platform.test.ts
│   ├── detect.test.ts
│   ├── prompt.test.ts
│   └── hooks.test.ts
├── .dev-logs/
├── package.json
├── tsconfig.json
└── vitest.config.ts
```
