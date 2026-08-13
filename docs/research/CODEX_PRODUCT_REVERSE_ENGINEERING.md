# Codex Desktop 产品逆向规格

> 基于对**本机安装的 ChatGPT.app v26.803（内含 Codex 工作区）** 的真实操作 + OCR + 屏幕截图存档。
> 方法：CGWindowList 窗口测量 + Vision OCR 提取文字/位置 + 坐标点击操作。
> 置信等级约定：**Observed**（实测确认）/ **Estimated**（合理估计）/ **Unknown**（未能确认）。
> 截图存档：`research/codex-ui/`（01-home … 14-settings）。

## 0. 环境与方法说明

| 项 | 值 |
|---|---|
| 产品 | ChatGPT.app v26.803.61601（Codex 工作区，非独立 Codex.app） |
| 窗口 | 1512×859 @ (0,33)（实测） |
| 主题 | **Light**（本次全程观察到的默认主题） |
| 模型 | deepseek-v4-pro（`~/.codex/config.toml`），reasoning=high |
| 观察方式 | OCR 文字+坐标、CGWindowList、颜色采样；AX UI 树不可用（Electron 未暴露 web content accessibility） |

---

## 1. 完整 Information Architecture（Observed + Estimated）

```
Codex Workspace（Electron 单窗口，三栏）
├── 顶部多层导航区
│   ├── L1 窗口 Tab 栏（会话/文件 tabs，自动命名，+ 新建，× 关闭，< > 前进后退）
│   ├── L2 品牌/导航栏（Codex 标识 + 问答入口 + 搜索/面包屑）
│   └── L3 会话上下文栏（会话标题 + git 分支 + 变更统计）
├── 左侧 Sidebar（宽 ≈280px）
│   ├── 项目列表（可折叠，含项目描述/环境标签）
│   ├── 会话列表（项目下，含会话数）
│   └── 底部模型标识（深色 badge，显示当前模型名）
├── 中间 Agent Workspace（会话消息流）
│   ├── 用户消息（右对齐）
│   ├── Agent 消息（markdown，左对齐）
│   └── 文件变更/diff 融入消息流（+N -M）
├── 右侧 Git/Diff 面板（项目 + 分支 + 变更统计 +N-M）
└── 底部 Composer（极简无边框，非永久常驻）
```

**关键 IA 洞察**：Codex 不是"聊天软件"，而是**三栏 Coding Workspace**——左侧项目/会话导航，中间 agent 会话，右侧 git/diff 状态。Git 状态是**常驻可见的**，diff 是会话流的一部分。

---

## 2. 页面与 Panel 划分（Observed）

| Panel | 位置（归一化坐标） | 尺寸（逻辑 px） | 背景色 |
|---|---|---|---|
| Sidebar | x 0~0.185 | **宽 280px** | #f0f0f0（浅灰） |
| 分隔线 | x 0.185~0.19 | ~7px | #e8e8e8 |
| 主内容 | x 0.19~1.0 | 宽 ~1232px | #ffffff |
| 顶栏（多层） | y 0.90~1.0 | 高 ~86px | #e9eaea（tab 栏）/#f4f5f5 |
| Composer | 底部 y 0.03~0.16 | 高 ~110px | #ffffff（无边框） |
| Git 面板 | 右侧 x 0.79~0.97 | 宽 ~272px | #ffffff |

---

## 3. Sidebar 设计（Observed）

- **宽度**：280px（折叠后更窄，仅图标）。
- **结构**（自上而下）：
  1. 项目列表（每个项目：图标 + 名称 + 可展开描述/环境标签如 "Python · Conda"）
  2. 当前项目下的会话列表（会话名 + 消息数）
  3. 底部：模型标识（**深色 badge**，显示 "deepseek"，是 model 入口）
- **可折叠**：点击折叠按钮后 Sidebar 收窄为图标列。
- **项目层级**：项目名下方可显示描述（如 "Pi Coding Desktop App"）和环境标签。

---

## 4. Session / Thread 模型（Observed）

- **会话 = 一个 tab**：每个会话在顶部 tab 栏占据一个 tab，标题**自动从首个任务文字生成**（如 "List directory files"）。
- 支持多个 tab 并存（顶部 tab 栏 + 新建 + 关闭）。
- Sidebar 会话列表与会话 tab **联动**（同一会话名出现两处）。
- 会话组织在项目之下（项目 → 会话 两层）。
- 未观察到显式的"重命名"入口（可能通过右键或会话详情，**Unknown**）。

---

## 5. Agent Workspace（Observed）

- **用户消息**：右对齐（x≈0.605），气泡样式（Estimated）。
- **Agent 消息**：左对齐（x≈0.24），**Markdown 渲染**（标题、列表、代码块、表格）。
- **文件变更**：Agent 修改文件后，变更列表以 `path +N -M` 形式直接出现在消息流中。
- **数据表格**：Agent 输出表格时以 Markdown 表格渲染（列头 factor/rank IC/rank ICIR/t/pos%）。
- 消息流从顶栏下方开始，到底部 composer 上方结束。

---

## 6. Composer（Observed，重点）

- **位置**：底部，y≈0.03~0.16，**无边框**（纯白背景，极简）。
- **结构**（一行从左到右）：
  1. **Attachment 按钮**（左 x≈0.36）：**橙色/铜色图标**（rgb 210,95,40 附近），形似回形针/加号。
  2. **输入框**（中）：无边框 textarea，多行，placeholder 极淡（OCR 几乎不可见）。
  3. **发送按钮**（右 x≈0.82，中心 y≈0.044）：**圆形、深色实心箭头**（rgb 26,28,31），未输入时浅灰（rgb 240,241,241）。
- **上方上下文**（y≈0.146）：`项目名` + `分支名`（如 "qlib" + "main"）。
- **非永久常驻**：发送后 Composer 被会话内容占据；需新建会话或聚焦时出现。
- **发送方式**：点击圆形发送按钮（Enter/Cmd+Enter 未观察到触发发送，**Observed 发送按钮点击有效**）。

---

## 7. Agent Execution Timeline（Observed）

```
用户输入 → 点击发送按钮
→ 顶栏新增会话 tab（自动命名）
→ Agent 执行（deepseek 简单任务约 16s）
→ Markdown 响应（文件列表等）
→ git 变更统计更新（+0-0 → +N-M）
```

- 简单只读任务**未观察到显式的 thinking/tool-call 中间态**（可能已折叠或模型直接回答）。
- 响应是纯 Markdown（"Here are the files and folders in …" + 列表）。

---

## 8. Tool Call UI（Estimated）

- 未在本次会话中捕获到显式的 tool-call 卡片（任务过于简单）。
- 从文件变更列表（+N-M）推断：工具执行结果以**文件变更摘要**而非原始 JSON 呈现。
- **Unknown**：running/completed/error 的精确视觉形态（需触发更复杂任务）。

---

## 9. Thinking UI（Unknown）

- 本次任务未观察到 thinking 块（可能：deepseek 不展示，或默认折叠且 OCR 无法识别）。
- 推断：Codex 应有折叠的 thinking（reasoning=high 配置下）。

---

## 10. Git / Diff（Observed，重要）

- **Git 状态常驻**：
  - 顶栏 L3 显示分支（"dev → origin/main"）+ 变更统计（"+0-0"）。
  - 右侧面板显示项目名 + 变更（"+77-1"）。
- **Diff 融入会话**：文件变更以 `path +N -M` 行出现在消息流中，N/M 为增删行数。
- **变更统计**：+1903 -38 等总统计可见。
- **Settings 有 Git 与 Worktrees 分类**（见 §15）。

---

## 11. Terminal（Unknown / 未观察到）

- 本次探索**未找到独立 Terminal**。命令执行结果以会话消息（文件变更）呈现。
- 推断：Codex 无独立常驻终端，命令通过 tool call 执行，结果融入会话。
- **Unknown**：是否存在可展开的 Terminal 面板。

---

## 12. Worktree（Observed 入口，细节 Unknown）

- Settings 中存在 **"Worktrees"** 导航项（Observed）。
- 未观察到 worktree 的会话级 UI（需要深入 Settings 或触发多任务）。
- 推断：Worktree 是 Codex 的会话隔离机制（与 git worktree 对应）。

---

## 13. Parallel Agent（Observed 部分）

- **多 tab 并存**：顶部 tab 栏支持多个会话 tab 同时打开（Observed）。
- 每个 tab = 一个会话（并行执行的基础）。
- **Unknown**：并行执行的调度/状态细节。

---

## 14. Permission（Unknown）

- 本次任务为只读（列目录），未触发权限确认。
- **Unknown**：Permission 是 modal/inline，及其信息展示方式。

---

## 15. Settings（Observed 部分）

- 打开方式：**Cmd+,**（Observed）。
- 形态：左侧导航 + 右侧内容的两栏面板。
- 左侧导航项（OCR 识别到）：**Git、Worktrees**，另有 VS Code 集成、macOS ChatGPT 平台设置等。
- 说明：Codex Settings 覆盖 Git、Worktree、IDE 集成、平台行为。

---

## 16. Skills（Unknown）

- 未观察到独立的 Skills 页面。Skills 可能在 composer 的 "/" 命令或插件体系中。

---

## 17. Automations（Unknown）

- 未观察到独立 Automations 页面。

---

## 18. Desktop Interaction（Observed 部分）

- **快捷键**：`Cmd+N`（新建会话/tab，Observed）、`Cmd+,`（Settings，Observed）。
- **发送**：点击圆形发送按钮（Enter/Cmd+Enter 未确认有效）。
- **Sidebar 折叠**：点击折叠按钮。
- **导航**：顶栏 `< >` 前进/后退按钮。
- **Composer 聚焦**：点击输入区后光标闪烁，支持输入。

---

## 19. Design System（Observed/Estimated）

### 色彩（Light 主题，Observed 实测值）
| 用途 | 颜色 | 置信 |
|---|---|---|
| 主内容背景 | #ffffff | Observed |
| Sidebar 背景 | #f0f0f0 | Observed |
| Tab 栏背景 | #e9eaea | Observed |
| 分隔线 | #e8e8e8 | Observed |
| 正文文字 | #1a1c1f（深色 rgb 26,28,31） | Observed |
| 发送按钮（激活） | #1a1c1f | Observed |
| 发送按钮（未激活） | #f0f1f1 | Observed |
| Attachment 图标 | #d25f28（橙铜色） | Observed |
| 模型 badge 背景 | #222326（深色） | Observed |

### 尺寸
| 项 | 值 | 置信 |
|---|---|---|
| Sidebar 宽 | 280px | Observed |
| 顶栏高 | ~86px（多层） | Estimated |
| Composer 高 | ~110px | Estimated |
| 窗口 | 1512×859 | Observed |

### Typography（Estimated）
- 界面正文 ~13px（OCR 无法精确测量字号）。
- 会话标题、项目名有字重区分（加粗）。
- **Unknown**：精确字体家族（系统默认 sans，符合 macOS 惯例）。

### 视觉风格
- **极简、低对比**：浅灰分层（#f0f0f0 / #e9eaea / #fff），无重边框、无阴影。
- **Composer 无边框**，靠按钮图标（橙 attachment + 深色圆形 send）提示交互。
- **圆角**：发送按钮圆形；其他圆角 Estimated（小圆角 4-8px）。

---

## 20. Keyboard Shortcut（Observed）
| 快捷键 | 功能 | 置信 |
|---|---|---|
| Cmd+N | 新建会话/tab | Observed |
| Cmd+, | 打开 Settings | Observed |
| Esc | 关闭弹窗/面板 | Observed（关闭 Settings） |
| Enter / Cmd+Enter | 发送 | **未确认**（Observed 无效，发送靠点击按钮） |

---

## 21. Loading / Empty / Error State（Observed 部分）

- **空会话状态**：新建会话后主内容区空白，仅底部 composer + 上方项目/分支上下文。
- **执行中**：发送后会话 tab 立即出现，响应生成约 16s（无显式 loading 动画被捕获）。
- **Error**：Unknown。

---

## 附：与 Lattice 相关的关键产品判断

1. **三栏布局**是核心差异——Lattice 当前是两栏（sidebar + 内容），缺少**常驻的 Git/Diff 右侧面板**。
2. **Diff 融入会话流**——不是独立面板，而是 `path +N-M` 直接出现在消息里。
3. **Composer 极简无边框**——Lattice 的 composer 有边框卡片，偏"表单"而非"输入区"。
4. **会话 = tab**——Lattice 用 sidebar 会话列表，Codex 用顶部 tab 栏表达"多会话并行"。
5. **Git 状态常驻顶栏**——分支 + 变更统计始终可见，是 Coding Agent 的身份标识。
6. **模型入口在 sidebar 底部**（深色 badge），而非顶栏。
