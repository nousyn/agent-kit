# 005 - createKit 工厂模式重构完成

日期：2026-03-15

## 概要

将 API 从 `register()` 单例模式重构为 `createKit()` 工厂模式。
消除全局状态，支持解构，`prompt` 从注册阶段移至 `injectPrompt()` 调用点。

## 背景 & 动机

- `register(name, { prompt, ... })` 存在全局单例问题：一个进程只能注册一个工具
- `prompt` 绑定在注册时不合理 — MCP 由单一 agent 调用，prompt 在注入时才知道目标 agent
- 开发者期望 `const { injectPrompt, installHooks } = createKit('my-mcp')` 的解构风格

## 设计决策

1. **`prompt` 归属 `injectPrompt()` 调用点**：MCP 由单一已知 agent 调用，无"注册一次、向多个 agent 注入相同 prompt"的场景。不同 agent 需要不同 prompt 时，开发者必须分别调用。
2. **`hooks.*` 保持全局**：Hook 声明本质是静态的（在模块顶层、`createKit` 之前声明）。`createKit` 返回的 `installHooks()` 内部从全局注册中心读取。
3. **`KitOptions` 仅保留 `dirs` 和 `envOverride`**：`name` 作为第一参数；`prompt` 完全移除。

## 完成内容

### 新增文件

| 文件                       | 行数 | 说明                                     |
| -------------------------- | ---- | ---------------------------------------- |
| `src/create-kit.ts`        | 63   | 工厂函数，返回 `Kit` 对象，闭包捕获 name |
| `tests/create-kit.test.ts` | 78   | 11 个测试用例                            |

### 修改文件

| 文件                     | 变更                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `src/types.ts`           | `ToolConfig` → `KitOptions`（仅 dirs/envOverride）；新增 `ResolvedKitConfig`（内部）、`Kit` 接口；移除 `prompt` 字段 |
| `src/prompt.ts`          | `injectPrompt(name, prompt, agent, options?)` — 显式接收 name/prompt 参数                                            |
| `src/hooks.ts`           | `installHooks(name, agent)`、`uninstallHooks(name, agent)`、`hasHooksInstalled(name, agent)` — 显式接收 name 参数    |
| `src/platform.ts`        | `getDataDir(config, options?)` — 接收 `ResolvedKitConfig` 而非从全局读取                                             |
| `src/index.ts`           | 导出 `createKit` 作为主入口；移除 `register` 导出；底层函数不再直接导出（通过 Kit 对象访问）                         |
| `tests/hooks.test.ts`    | 移除 register 依赖，直接调用 `installHooks(name, agent)`                                                             |
| `tests/platform.test.ts` | 简化为仅测试 `detectProjectRoot`；getDataDir 测试移至 create-kit.test.ts                                             |
| `README.md`              | 完全重写，以 createKit + 解构为主要模式                                                                              |
| `docs/hook-usage.md`     | 更新为 createKit 模式                                                                                                |

### 删除文件

| 文件                     | 说明           |
| ------------------------ | -------------- |
| `src/register.ts`        | 旧单例注册模块 |
| `tests/register.test.ts` | 对应测试       |

## Breaking Changes

- 移除 `register()` 函数和 `ToolConfig` 类型
- 移除 `getConfig()` — 不再有全局配置
- `injectPrompt` / `installHooks` / `getDataDir` 等不再作为独立顶层导出（通过 `createKit` 返回的 Kit 对象访问）
- `prompt` 不再是配置项，改为 `injectPrompt()` 的参数
- 0.1.0 未发包，无用户影响

## 测试结果

8 个测试文件，86 个测试全部通过。tsc 构建通过。
