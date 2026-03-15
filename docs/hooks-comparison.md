# Agent Hook 横向对比数据表

> 基于各 Agent 源码/文档整理，供 agent-kit 使用者快速查阅各 Agent 的 hook 能力。

## 版本基线

| Agent       | 版本                                         | 来源                                                                                                 |
| ----------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Claude Code | 闭源，以官方文档为准                         | [docs.anthropic.com/en/docs/claude-code/hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) |
| Codex       | Rust 重写版（与 Claude Code 共享 hook 协议） | `~/.codex/settings.json`                                                                             |
| OpenCode    | 1.2.25                                       | `packages/plugin/src/index.ts`                                                                       |
| OpenClaw    | 2026.3.11                                    | `src/hooks/` + `src/plugins/`                                                                        |

## 架构差异

| 维度         | Claude Code / Codex                   | OpenCode                   | OpenClaw                                |
| ------------ | ------------------------------------- | -------------------------- | --------------------------------------- |
| 实现模型     | 外部进程（shell/http）                | 进程内插件（JS 函数）      | 双层：内部 Hook + 插件 Hook             |
| 协议         | JSON stdin → JSON stdout + exit code  | 函数调用，修改 output 对象 | 内部：事件对象；插件：函数返回值        |
| 配置方式     | `settings.json` 声明式                | TypeScript 插件文件 export | `HOOK.md` frontmatter + `handler.ts`    |
| Handler 类型 | 4 种：command / http / prompt / agent | 1 种：async 函数           | 3 种：void / modifying / sync           |
| Matcher      | 正则表达式                            | 无（钩子名直接匹配）       | 内部支持 type:action 通配；插件精确匹配 |
| 阻断机制     | exit code 2 或 JSON decision          | 修改 output 字段           | modifying hook 返回 block/cancel        |
| 无效 hook 名 | 静默忽略                              | 静默忽略（pull-based）     | 内部：静默注册不触发；插件：拒绝 + warn |
| Hook 总数    | 21                                    | 17                         | 11 内部 + 24 插件 = 35                  |

---

## 完整 Hook 清单

### 1. 会话生命周期

| 能力         | Claude Code / Codex  | OpenCode | OpenClaw (内部) | OpenClaw (插件) |
| ------------ | -------------------- | -------- | --------------- | --------------- |
| 会话开始     | `SessionStart`       | `event`  | —               | `session_start` |
| 会话结束     | `SessionEnd`         | `event`  | —               | `session_end`   |
| 指令文件加载 | `InstructionsLoaded` | —        | —               | —               |
| 配置变更     | `ConfigChange` ◆     | `config` | —               | —               |

> ◆ = 可阻断

### 2. 用户输入 / Prompt

| 能力         | Claude Code / Codex                | OpenCode                               | OpenClaw (内部)    | OpenClaw (插件)       |
| ------------ | ---------------------------------- | -------------------------------------- | ------------------ | --------------------- |
| 用户提交     | `UserPromptSubmit` ◆               | `chat.message`                         | `message:received` | `message_received`    |
| 系统提示修改 | `UserPromptSubmit`（context 注入） | `experimental.chat.system.transform`   | —                  | `before_prompt_build` |
| 消息列表变换 | —                                  | `experimental.chat.messages.transform` | —                  | —                     |
| 命令执行前   | —                                  | `command.execute.before`               | —                  | —                     |

### 3. LLM 调用参数

| 能力               | Claude Code / Codex | OpenCode       | OpenClaw (内部) | OpenClaw (插件)        |
| ------------------ | ------------------- | -------------- | --------------- | ---------------------- |
| 模型选择/覆盖      | —                   | —              | —               | `before_model_resolve` |
| 请求参数（温度等） | —                   | `chat.params`  | —               | —                      |
| 请求头修改         | —                   | `chat.headers` | —               | —                      |
| LLM 输入观测       | —                   | —              | —               | `llm_input`            |
| LLM 输出观测       | —                   | —              | —               | `llm_output`           |

### 4. 工具调用

| 能力                | Claude Code / Codex  | OpenCode              | OpenClaw (内部) | OpenClaw (插件)               |
| ------------------- | -------------------- | --------------------- | --------------- | ----------------------------- |
| 调用前（阻断/修改） | `PreToolUse` ◆       | `tool.execute.before` | —               | `before_tool_call` ◆          |
| 调用后              | `PostToolUse`        | `tool.execute.after`  | —               | `after_tool_call`             |
| 调用失败后          | `PostToolUseFailure` | —                     | —               | —                             |
| 工具定义修改        | —                    | `tool.definition`     | —               | —                             |
| 工具注册            | —                    | `tool`（字典）        | —               | —                             |
| 工具结果持久化      | —                    | —                     | —               | `tool_result_persist`（同步） |

### 5. 权限控制

| 能力         | Claude Code / Codex   | OpenCode         | OpenClaw (内部) | OpenClaw (插件) |
| ------------ | --------------------- | ---------------- | --------------- | --------------- |
| 权限请求拦截 | `PermissionRequest` ◆ | `permission.ask` | —               | —               |

### 6. 消息发送 / 持久化

| 能力           | Claude Code / Codex | OpenCode                     | OpenClaw (内部) | OpenClaw (插件)                  |
| -------------- | ------------------- | ---------------------------- | --------------- | -------------------------------- |
| 消息发送前     | —                   | —                            | —               | `message_sending` ◆              |
| 消息发送后     | —                   | —                            | `message:sent`  | `message_sent`                   |
| 消息写入记录前 | —                   | —                            | —               | `before_message_write` ◆（同步） |
| 文本完成后     | —                   | `experimental.text.complete` | —               | —                                |

### 7. 上下文压缩 / 重置

| 能力       | Claude Code / Codex | OpenCode                          | OpenClaw (内部)                | OpenClaw (插件)     |
| ---------- | ------------------- | --------------------------------- | ------------------------------ | ------------------- |
| 压缩前     | `PreCompact`        | `experimental.session.compacting` | `session:compact:before`       | `before_compaction` |
| 压缩后     | `PostCompact`       | —                                 | `session:compact:after`        | `after_compaction`  |
| 会话重置前 | —                   | —                                 | `command:new`, `command:reset` | `before_reset`      |

### 8. 子 Agent / 流程控制

| 能力              | Claude Code / Codex | OpenCode | OpenClaw (内部) | OpenClaw (插件)            |
| ----------------- | ------------------- | -------- | --------------- | -------------------------- |
| 子 Agent 创建前   | `SubagentStart`     | —        | —               | `subagent_spawning` ◆      |
| 子 Agent 创建后   | —                   | —        | —               | `subagent_spawned`         |
| 子 Agent 停止     | `SubagentStop` ◆    | —        | —               | `subagent_ended`           |
| 子 Agent 投递路由 | —                   | —        | —               | `subagent_delivery_target` |
| Agent 停止        | `Stop` ◆            | —        | —               | `agent_end`                |
| Teammate 空闲     | `TeammateIdle` ◆    | —        | —               | —                          |
| 任务完成          | `TaskCompleted` ◆   | —        | —               | —                          |

### 9. Shell / 环境 / 认证

| 能力           | Claude Code / Codex               | OpenCode            | OpenClaw (内部) | OpenClaw (插件) |
| -------------- | --------------------------------- | ------------------- | --------------- | --------------- |
| Shell 环境变量 | `SessionStart`（CLAUDE_ENV_FILE） | `shell.env`         | —               | —               |
| 认证           | —                                 | `auth`（OAuth/API） | —               | —               |

### 10. 通知 / Worktree / MCP / 网关

| 能力                 | Claude Code / Codex   | OpenCode | OpenClaw (内部)        | OpenClaw (插件)      |
| -------------------- | --------------------- | -------- | ---------------------- | -------------------- |
| 通知处理             | `Notification`        | —        | —                      | —                    |
| Worktree 创建        | `WorktreeCreate` ◆    | —        | —                      | —                    |
| Worktree 移除        | `WorktreeRemove`      | —        | —                      | —                    |
| MCP Elicitation      | `Elicitation` ◆       | —        | —                      | —                    |
| MCP Elicitation 结果 | `ElicitationResult` ◆ | —        | —                      | —                    |
| 网关启动             | —                     | —        | `gateway:startup`      | `gateway_start`      |
| 网关停止             | —                     | —        | —                      | `gateway_stop`       |
| 命令停止             | —                     | —        | `command:stop`         | —                    |
| 消息转写             | —                     | —        | `message:transcribed`  | —                    |
| 消息预处理           | —                     | —        | `message:preprocessed` | —                    |
| Agent 引导           | —                     | —        | `agent:bootstrap`      | `before_agent_start` |

---

## 阻断能力汇总

标记 ◆ 的 hook 支持阻断。

| Agent               | 可阻断 Hook                                                                                                                                                                                      | 阻断方式                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| Claude Code / Codex | `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `Stop`, `SubagentStop`, `TeammateIdle`, `TaskCompleted`, `ConfigChange`, `Elicitation`, `ElicitationResult`, `WorktreeCreate`（共 11 个） | exit code 2 或 JSON `decision: "block"` |
| OpenCode            | `permission.ask`（deny）                                                                                                                                                                         | 修改 `output.status`                    |
| OpenClaw (插件)     | `before_tool_call`（block）, `message_sending`（cancel）, `subagent_spawning`（error）, `before_message_write`（block）（共 4 个）                                                               | modifying hook 返回值                   |

## 各 Agent 独有能力

| Agent               | 独有 Hook / 能力                                                                                                                                                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code / Codex | `prompt`/`agent` handler 类型（LLM 驱动决策）；正则 Matcher；`WorktreeCreate/Remove`；`TeammateIdle`/`TaskCompleted`（团队流程控制）；`Elicitation`（MCP 交互拦截）                                                                                              |
| OpenCode            | `auth`（自定义认证）；`tool`（注册工具）；`chat.headers`（HTTP 头）；`chat.params`（温度/topP/topK）；`tool.definition`（运行时修改工具定义）；4 个 `experimental.*` 钩子                                                                                        |
| OpenClaw            | 双层 Hook 系统；`before_model_resolve`（动态模型路由）；`llm_input`/`llm_output`（LLM I/O 观测）；`tool_result_persist`/`before_message_write`（同步热路径）；`subagent_delivery_target`（子 Agent 路由）；`gateway_start/stop`（网关生命周期）；Hook 优先级排序 |

---

## 图例

- `—` = 该 Agent 无此能力
- `◆` = 支持阻断/拒绝
- 括号内为补充说明（如"同步"、"字典"等）
