# Agent Hook 横向对比数据表

> 本文档记录 agent-kit 适配的四个 Agent 的完整 Hook 清单与能力对比。
> 供使用者快速查阅各 Agent 在同一能力点上的覆盖情况。

## 版本基准

| Agent       | 版本                                       | 来源                                                                       |
| ----------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| Claude Code | 闭源，以官方文档为准                       | [docs.anthropic.com](https://docs.anthropic.com/en/docs/claude-code/hooks) |
| Codex       | Rust 重写版，与 Claude Code 共享 Hook 协议 | `~/.codex/settings.json`                                                   |
| OpenCode    | 1.2.25                                     | `packages/plugin/src/index.ts` Hooks interface                             |
| OpenClaw    | 2026.3.11                                  | 内部 Hook 11 个 + 插件 Hook 24 个                                          |

## 架构差异总览

| 维度         | Claude Code / Codex                   | OpenCode                   | OpenClaw                                |
| ------------ | ------------------------------------- | -------------------------- | --------------------------------------- |
| Hook 数量    | 21                                    | 17                         | 11 内部 + 24 插件 = 35                  |
| 实现模型     | 外部进程 (shell/http)                 | 进程内插件 (JS 函数)       | 双层: 内部 Hook + 插件 Hook             |
| 协议         | JSON stdin → JSON stdout + exit code  | 函数调用, 修改 output 对象 | 内部: 事件对象; 插件: 函数返回值        |
| 配置方式     | settings.json 声明式                  | TypeScript 插件文件 export | HOOK.md frontmatter + handler.ts        |
| Handler 类型 | 4 种: command / http / prompt / agent | 1 种: async 函数           | 3 种: void / modifying / sync           |
| Matcher      | 正则表达式过滤                        | 无 (钩子名直接匹配)        | 内部: type:action 通配; 插件: 精确匹配  |
| 无效 Hook 名 | 静默忽略                              | 静默忽略 (pull-based)      | 内部: 静默不触发; 插件: 拒绝注册 + warn |

---

## 一、会话生命周期

| 能力         | Claude Code / Codex    | OpenCode | OpenClaw (插件) | OpenClaw (内部) |
| ------------ | ---------------------- | -------- | --------------- | --------------- |
| 会话开始     | `SessionStart`         | `event`  | `session_start` | —               |
| 会话结束     | `SessionEnd`           | `event`  | `session_end`   | —               |
| 指令文件加载 | `InstructionsLoaded`   | —        | —               | —               |
| 配置变更     | `ConfigChange` ★可阻断 | `config` | —               | —               |

## 二、用户输入 / Prompt

| 能力           | Claude Code / Codex               | OpenCode                               | OpenClaw (插件)       | OpenClaw (内部)        |
| -------------- | --------------------------------- | -------------------------------------- | --------------------- | ---------------------- |
| 用户提交前拦截 | `UserPromptSubmit` ★可阻断        | `chat.message`                         | `message_received`    | `message:received`     |
| 系统提示词修改 | `UserPromptSubmit` (context 注入) | `experimental.chat.system.transform`   | `before_prompt_build` | —                      |
| 消息列表修改   | `UserPromptSubmit` (context 注入) | `experimental.chat.messages.transform` | `before_prompt_build` | —                      |
| 命令执行前     | —                                 | `command.execute.before`               | —                     | —                      |
| 消息预处理     | —                                 | —                                      | —                     | `message:preprocessed` |
| 音频转写       | —                                 | —                                      | —                     | `message:transcribed`  |

## 三、LLM 调用参数

| 能力              | Claude Code / Codex | OpenCode       | OpenClaw (插件)        | OpenClaw (内部) |
| ----------------- | ------------------- | -------------- | ---------------------- | --------------- |
| 模型选择/覆盖     | —                   | —              | `before_model_resolve` | —               |
| 请求参数 (温度等) | —                   | `chat.params`  | —                      | —               |
| 请求头修改        | —                   | `chat.headers` | —                      | —               |
| LLM 输入观测      | —                   | —              | `llm_input`            | —               |
| LLM 输出观测      | —                   | —              | `llm_output`           | —               |

## 四、工具调用

| 能力                | Claude Code / Codex  | OpenCode              | OpenClaw (插件)              | OpenClaw (内部) |
| ------------------- | -------------------- | --------------------- | ---------------------------- | --------------- |
| 调用前 (可修改参数) | `PreToolUse` ★可阻断 | `tool.execute.before` | `before_tool_call` ★可阻断   | —               |
| 调用后              | `PostToolUse`        | `tool.execute.after`  | `after_tool_call`            | —               |
| 调用失败后          | `PostToolUseFailure` | —                     | —                            | —               |
| 工具定义修改        | —                    | `tool.definition`     | —                            | —               |
| 工具注册            | —                    | `tool` (对象字典)     | —                            | —               |
| 工具结果持久化      | —                    | —                     | `tool_result_persist` (同步) | —               |

## 五、权限控制

| 能力         | Claude Code / Codex         | OpenCode         | OpenClaw (插件) | OpenClaw (内部) |
| ------------ | --------------------------- | ---------------- | --------------- | --------------- |
| 权限请求拦截 | `PermissionRequest` ★可阻断 | `permission.ask` | —               | —               |

## 六、消息发送 / 持久化

| 能力           | Claude Code / Codex | OpenCode                     | OpenClaw (插件)                       | OpenClaw (内部) |
| -------------- | ------------------- | ---------------------------- | ------------------------------------- | --------------- |
| 消息发送前     | —                   | —                            | `message_sending` ★可取消             | —               |
| 消息发送后     | —                   | —                            | `message_sent`                        | `message:sent`  |
| 消息写入记录前 | —                   | —                            | `before_message_write` (同步) ★可阻断 | —               |
| 文本完成后修改 | —                   | `experimental.text.complete` | —                                     | —               |

## 七、上下文压缩 / 重置

| 能力     | Claude Code / Codex | OpenCode                          | OpenClaw (插件)     | OpenClaw (内部)                |
| -------- | ------------------- | --------------------------------- | ------------------- | ------------------------------ |
| 压缩前   | `PreCompact`        | `experimental.session.compacting` | `before_compaction` | `session:compact:before`       |
| 压缩后   | `PostCompact`       | —                                 | `after_compaction`  | `session:compact:after`        |
| 重置前   | —                   | —                                 | `before_reset`      | —                              |
| 重置命令 | —                   | —                                 | —                   | `command:new`, `command:reset` |

## 八、子 Agent

| 能力              | Claude Code / Codex         | OpenCode | OpenClaw (插件)             | OpenClaw (内部) |
| ----------------- | --------------------------- | -------- | --------------------------- | --------------- |
| 子 Agent 创建前   | `SubagentStart`             | —        | `subagent_spawning` ★可阻断 | —               |
| 子 Agent 创建后   | —                           | —        | `subagent_spawned`          | —               |
| 子 Agent 停止     | `SubagentStop` ★可阻止停止  | —        | `subagent_ended`            | —               |
| 子 Agent 投递路由 | —                           | —        | `subagent_delivery_target`  | —               |
| 主 Agent 停止     | `Stop` ★可阻止停止          | —        | `agent_end`                 | —               |
| Teammate 空闲     | `TeammateIdle` ★可强制继续  | —        | —                           | —               |
| 任务完成          | `TaskCompleted` ★可阻止完成 | —        | —                           | —               |

## 九、Agent 引导 / 初始化

| 能力                   | Claude Code / Codex | OpenCode | OpenClaw (插件)                 | OpenClaw (内部)   |
| ---------------------- | ------------------- | -------- | ------------------------------- | ----------------- |
| Agent 引导 (bootstrap) | —                   | —        | `before_agent_start` (旧版兼容) | `agent:bootstrap` |

## 十、Shell / 环境 / 认证

| 能力             | Claude Code / Codex              | OpenCode    | OpenClaw (插件) | OpenClaw (内部) |
| ---------------- | -------------------------------- | ----------- | --------------- | --------------- |
| Shell 环境变量   | `SessionStart` (CLAUDE_ENV_FILE) | `shell.env` | —               | —               |
| 认证 (OAuth/API) | —                                | `auth`      | —               | —               |

## 十一、通知 / Worktree / MCP / 网关

| 能力                 | Claude Code / Codex         | OpenCode | OpenClaw (插件) | OpenClaw (内部)   |
| -------------------- | --------------------------- | -------- | --------------- | ----------------- |
| 通知处理             | `Notification`              | —        | —               | —                 |
| Worktree 创建        | `WorktreeCreate` ★可阻断    | —        | —               | —                 |
| Worktree 移除        | `WorktreeRemove`            | —        | —               | —                 |
| MCP Elicitation      | `Elicitation` ★可阻断       | —        | —               | —                 |
| MCP Elicitation 结果 | `ElicitationResult` ★可阻断 | —        | —               | —                 |
| 网关启动             | —                           | —        | `gateway_start` | `gateway:startup` |
| 网关停止             | —                           | —        | `gateway_stop`  | —                 |
| 停止命令             | —                           | —        | —               | `command:stop`    |

---

## 阻断能力汇总

| Agent               | 可阻断的 Hook                                                                                                                                                                                   | 阻断机制                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Claude Code / Codex | `PreToolUse`, `PermissionRequest`, `UserPromptSubmit`, `Stop`, `SubagentStop`, `TeammateIdle`, `TaskCompleted`, `ConfigChange`, `Elicitation`, `ElicitationResult`, `WorktreeCreate` (共 11 个) | exit code 2 或 JSON `decision: "block"`   |
| OpenCode            | `permission.ask` (deny); 其他通过修改 output 间接影响                                                                                                                                           | 修改 output 对象 status 字段              |
| OpenClaw (插件)     | `before_tool_call` (block), `message_sending` (cancel), `subagent_spawning` (error), `before_message_write` (block) (共 4 个)                                                                   | Modifying hook 返回值含 block/cancel 标志 |
| OpenClaw (内部)     | 无 (所有错误被 catch, 不传播)                                                                                                                                                                   | —                                         |

---

## 各 Agent 独有能力

| Agent               | 独有 Hook / 能力                                                                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code / Codex | `prompt`/`agent` handler 类型 (LLM 驱动决策); Matcher 正则过滤; `WorktreeCreate/Remove` (VCS 集成); `TeammateIdle`/`TaskCompleted` (团队协作流程控制); `Elicitation` (MCP 用户交互拦截)                                     |
| OpenCode            | `auth` (自定义 OAuth/API 认证); `tool` (注册自定义工具); `chat.headers` (修改 HTTP 请求头); `chat.params` (精确控制 temperature/topP/topK); `tool.definition` (运行时修改工具定义)                                          |
| OpenClaw (插件)     | `before_model_resolve` (动态模型路由); `llm_input`/`llm_output` (完整 LLM I/O 观测); `tool_result_persist`/`before_message_write` (同步热路径, 控制持久化); `subagent_delivery_target` (子 Agent 消息路由); Hook 优先级排序 |
| OpenClaw (内部)     | `message:transcribed`/`message:preprocessed` (音频转写管道); `command:new`/`command:reset`/`command:stop` (CLI 命令事件)                                                                                                    |

---

## 图例

- `—` 表示该 Agent 无此能力
- `★可阻断` 表示该 Hook 支持阻断/拒绝/取消流程
- `(同步)` 表示该 Hook 为同步执行 (非 async), 位于热路径
- `(旧版兼容)` 表示该 Hook 为向后兼容保留, 推荐使用更细粒度的替代 Hook
