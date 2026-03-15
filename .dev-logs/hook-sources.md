# Hook 系统源码/文档查阅路径

> 供后续快速查阅各 agent 的 hook 功能实现。

---

## OpenCode

**版本**: 1.2.25
**本地路径**: `/Users/cat/Downloads/opencode-1.2.25/packages/opencode/`

| 内容                                            | 路径                                                         |
| ----------------------------------------------- | ------------------------------------------------------------ |
| Plugin 类型定义（Hooks interface, 17 个钩子点） | `packages/plugin/src/index.ts` 第 148-234 行                 |
| Plugin 加载（动态 import, 无校验）              | `packages/opencode/src/plugin/index.ts` 第 48-93 行          |
| Hook 触发（pull-based, trigger 函数）           | `packages/opencode/src/plugin/index.ts` 第 112-127 行        |
| Tool 注册（plugin.tool 消费）                   | `packages/opencode/src/tool/registry.ts` 第 55-60 行         |
| Auth hook 消费                                  | `packages/opencode/src/provider/auth.ts` 第 13-18 行         |
| Permission hook                                 | `packages/opencode/src/provider/provider.ts` 第 1001-1003 行 |
| Config/Event hook                               | `packages/opencode/src/plugin/index.ts` 第 133-148 行        |

**关键特征**: Pull-based 插件系统。宿主用已知名称从插件对象中取值，未知 key 静默忽略。无运行时校验。

---

## OpenClaw

**版本**: 2026.3.11
**本地路径**: `/Users/cat/Downloads/openclaw-2026.3.11/`

| 内容                                               | 路径                                            |
| -------------------------------------------------- | ----------------------------------------------- |
| 内部 Hook 事件类型定义                             | `src/hooks/internal-hooks.ts` 第 13 行          |
| registerInternalHook（无校验）                     | `src/hooks/internal-hooks.ts` 第 214-219 行     |
| triggerInternalHook（精确匹配 type + type:action） | `src/hooks/internal-hooks.ts` 第 270-288 行     |
| Hook 错误处理（try/catch 不传播）                  | `src/hooks/internal-hooks.ts` 第 280-287 行     |
| HOOK.md frontmatter 解析                           | `src/hooks/frontmatter.ts` 第 47-69 行          |
| Hook 目录扫描 + 加载                               | `src/hooks/workspace.ts` 第 76-131, 136-194 行  |
| Hook handler 动态导入                              | `src/hooks/loader.ts` 第 109-127 行             |
| 插件类型化 Hook 名称（24 个）                      | `src/plugins/types.ts` 第 321-382 行            |
| isPluginHookName 校验（Set 硬编码）                | `src/plugins/types.ts` 第 379-382 行            |
| 插件 typed hook 注册 + 校验                        | `src/plugins/registry.ts` 第 519-566 行         |
| 插件 hook 执行引擎                                 | `src/plugins/hooks.ts` 第 184-262 行            |
| Hook runner 全局初始化（catchErrors=true）         | `src/plugins/hook-runner-global.ts` 第 39-46 行 |

**关键特征**: 双层系统。内部 Hook 无校验（string key 直接注册）；Plugin typed Hook 有 Set 校验（未知名称被拒绝 + warn 日志）。

---

## Claude Code

**版本**: 闭源，文档为准
**文档 URL**: `https://docs.anthropic.com/en/docs/claude-code/hooks`

| 内容                                           | 来源                |
| ---------------------------------------------- | ------------------- |
| 21 个 Hook 事件定义                            | 官方文档 hooks 页面 |
| 4 种 handler 类型（command/http/prompt/agent） | 同上                |
| 退出码语义（0/2/其他）                         | 同上                |
| JSON stdin/stdout 协议                         | 同上                |
| matcher 支持                                   | 同上                |
| 各事件能否阻断                                 | 同上                |
| 配置快照机制                                   | 同上                |

**本地参考**: `/Users/cat/Downloads/self-improving-agent/references/hooks-setup.md`

**关键特征**: 外部进程模型。JSON stdin → JSON stdout。未知事件名静默忽略（高概率，文档未明确说明）。非零退出码（非2）= 非阻断错误。

---

## Codex

**版本**: Rust 重写版
**文档 URL**: `https://developers.openai.com/codex`（无独立 hooks 页面）

| 内容                         | 来源                          |
| ---------------------------- | ----------------------------- |
| Hook 系统与 Claude Code 相同 | self-improving-agent 项目验证 |
| settings.json 格式一致       | `.codex/settings.json`        |

**本地参考**: `/Users/cat/Downloads/self-improving-agent/` 中的 Codex 配置

**关键特征**: 与 Claude Code 共享同一套 hook 协议。配置路径为 `~/.codex/settings.json`。

---

## 无效 Hook 行为汇总

| Agent                | 无效/过期 hook 名称                      | Handler 抛错                      |
| -------------------- | ---------------------------------------- | --------------------------------- |
| OpenCode             | 静默忽略（pull-based，永不查找未知 key） | N/A（函数调用，由宿主 try/catch） |
| OpenClaw 内部 Hook   | 静默注册，永不触发                       | 捕获 + 日志，不传播               |
| OpenClaw Plugin Hook | 拒绝注册 + warn 日志                     | 捕获 + 日志（catchErrors=true）   |
| Claude Code          | 高概率静默忽略（文档未明确）             | 非2退出码 = 非阻断错误            |
| Codex                | 同 Claude Code                           | 同 Claude Code                    |
