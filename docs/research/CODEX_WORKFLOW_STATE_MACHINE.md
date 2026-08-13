# Codex Workflow State Machine

> 基于真实操作逆向（ChatGPT.app v26.803 Codex workspace）。
> 状态与转换标注：
> - **OBSERVED**：本轮/上轮真实操作确认
> - **INFERRED**：从已观察证据合理推断（非直接观察）
> - **NOT OBSERVED**：未能触发/观察到（GUI 自动化限制或功能需特定条件）

## 0. 逆向方法限制（诚实声明）

- 本机 ChatGPT（Electron）**不暴露 web content AX 树**，且当前模型无法看图。
- 逆向依赖：OCR 文字+坐标 + CGEvent 坐标点击 + 颜色采样。
- GUI 坐标点击**可靠性不稳定**（动态布局 + 窗口焦点），因此部分中间态（thinking/tool running）未能稳定捕捉。
- 以下状态机中，**核心会话生命周期已 OBSERVED**，工具级中间态多数为 INFERRED / NOT OBSERVED。

---

## 1. 会话生命周期状态机

```
                    ┌────────────────────────────┐
                    │      Session Idle           │  OBSERVED
                    │  (空会话，composer 可见)     │
                    └───────────┬────────────────┘
                                │ 用户输入 + 点击发送
                                ▼
                    ┌────────────────────────────┐
                    │    Prompt Submitted         │  OBSERVED
                    │  (顶部新增会话 tab，自动命名) │
                    └───────────┬────────────────┘
                                │
                                ▼
                    ┌────────────────────────────┐
                    │        Thinking             │  NOT OBSERVED
                    │  (推理块，疑似折叠/隐藏)      │
                    └───────────┬────────────────┘
                                │
                                ▼
                    ┌────────────────────────────┐
                    │       Tool Running          │  NOT OBSERVED
                    │  (read/edit/write/shell)    │
                    └───────────┬────────────────┘
                                │
                                ▼
                    ┌────────────────────────────┐
                    │      Diff / Changed Files   │  OBSERVED(部分)
                    │  (消息流中 path +N -M)       │
                    └───────────┬────────────────┘
                                │
                                ▼
                    ┌────────────────────────────┐
                    │        Completed            │  OBSERVED
                    │  (Markdown 响应 + git 状态更新)│
                    └────────────────────────────┘
```

## 2. 各状态详述

### 2.1 Session Idle（OBSERVED）
- 空会话状态：主内容区空白，底部 composer 可见。
- composer 上方显示「项目名 • 分支名」（如 `qlib • main`）。
- composer 结构：attachment 图标（左）+ 无边框输入框 + 发送按钮（右，输入后出现）。

### 2.2 Prompt Submitted（OBSERVED）
- 用户点击发送按钮后，顶部 tab 栏**新增会话 tab**，标题**自动从任务文字生成**（如 "List directory files"）。
- 用户消息右对齐（x≈0.60）。
- git 状态出现（`+0-0`）+ 分支（`main`）。

### 2.3 Thinking（NOT OBSERVED）
- 简单只读任务未观察到 thinking 块。
- **INFERRED**：Codex 应有 thinking（配置 reasoning=high），可能默认折叠，OCR 无法识别折叠态。
- 未能捕捉 running 态（需要更复杂任务 + 高频截图，GUI 自动化限制）。

### 2.4 Tool Running（NOT OBSERVED）
- 未观察到显式 tool-call 卡片（read/edit/write/shell 的 running/success/failure）。
- **INFERRED**：工具执行结果以**文件变更摘要**（path +N-M）呈现，而非原始 JSON。
- 未能触发 edit/write 以观察 running 态。

### 2.5 Diff / Changed Files（OBSERVED 部分）
- Agent 修改文件后，变更以 `path +N -M` 行出现在**消息流中**。
- 总变更统计可见（`+1903 -38`、`+77-1`）。
- git 分支 + upstream 可见（`dev → origin/main`）。
- **NOT OBSERVED**：点击单个变更文件后的 diff viewer 展开、inline diff vs side panel 关系。

### 2.6 Completed（OBSERVED）
- Agent 响应为 Markdown（标题/列表/表格）。
- git 变更统计更新（+0-0 → +N-M）。
- 响应后 composer 消失（被会话内容占据，需新建会话重新获得 composer）。

## 3. 分支状态

### 3.1 Failed / Retry（NOT OBSERVED）
- 未能触发失败（deepseek 替换环境下，简单任务均成功）。
- 未能观察 retry/fix 循环。

### 3.2 Cancelled（NOT OBSERVED）
- 未能观察取消状态。

### 3.3 Follow-up（NOT OBSERVED）
- 未能观察 follow-up 队列。

### 3.4 Parallel Running（NOT OBSERVED）
- 顶部 tab 栏支持多会话并存（OBSERVED），但**未验证**多会话同时运行的调度/隔离。

## 4. Permission（NOT OBSERVED）
- 未触发权限审批（只读任务 + 无沙箱配置）。
- 无法确认 modal / inline / 分级授权形态。

## 5. Terminal（NOT OBSERVED）
- 未观察到独立 Interactive Terminal。
- Agent 命令执行结果以会话消息呈现（OBSERVED）。
- **结论**：Codex 无独立的 PTY 终端面板（命令通过 tool call 融入会话）。

## 6. Worktree（NOT OBSERVED 细节，入口 OBSERVED）
- Settings 中存在「Worktrees」分类（OBSERVED）。
- 未观察到 worktree 创建/切换/合并的 UI 与 git 状态。
- Session↔Worktree 关系未能验证。

## 7. 打开项目 / 会话（OBSERVED）
- Cmd+O 打开「Select Project Root」对话框（macOS NSOpenPanel，含 iCloud/用户/Macintosh HD 侧边栏）。
- 点击项目 → 主内容区显示项目详情（项目名 + 路径 `~/workspace/<name>`）。
- Cmd+N 新建会话（tab）。

---

## 8. 逆向结论（FROZEN）

**已充分理解（可指导 Lattice 实现）：**
1. 三栏布局（sidebar 280px | 会话 | git 面板）
2. Composer 极简无边框 + 圆形发送按钮 + attachment + 项目/分支上下文
3. 会话 = tab，多会话并行表达
4. Diff 融入会话流（path +N-M）
5. Git 状态常驻（分支 + 变更统计）
6. Light 主题（#f0f0f0 / #fff）
7. 无独立 Terminal（区别于 Lattice 的 PTY）

**未能深入（GUI 自动化限制，标记 NOT OBSERVED）：**
- Thinking/Tool 的 running/completed 中间态
- Permission 形态
- Worktree 完整链路
- Parallel 真实并行验证
- Failed/Retry/Cancel 状态

**判定：CODEX_REVERSE_ENGINEERING = FROZEN**

除非未来出现重大产品版本，不再继续无限研究 Codex。剩余 NOT OBSERVED 项，通过后续 Lattice 实现时的用户体验判断补齐，不再逆向。
