# Codex vs Lattice 差距分析

> 基于 `CODEX_PRODUCT_REVERSE_ENGINEERING.md`（真实操作逆向）对比 Lattice 当前实现。
> 等级：**MATCH**（一致）/ **CLOSE**（接近）/ **PARTIAL**（部分）/ **MISSING**（缺失）/ **DIFFERENT**（设计不同）。
> 优先级：**P0**（体验级，下一阶段必须）/ **P1**（重要）/ **P2**（增强）。

---

## 1. Information Architecture

| 项 | Codex | Lattice | 等级 | 优先级 |
|---|---|---|---|---|
| 整体结构 | 三栏（sidebar + 会话 + git 面板） | 两栏（sidebar + 内容）+ 底部面板 | DIFFERENT | P0 |
| Git 状态可见性 | 常驻（顶栏 + 右侧面板） | 折叠在 bottom panel，需手动打开 | PARTIAL | P0 |
| Diff 位置 | 融入会话消息流 | 独立 GitPanel（底部 tab） | DIFFERENT | P0 |
| 会话表达 | 顶部 tab 栏（多会话并行可见） | sidebar 会话列表 | DIFFERENT | P1 |
| 模型入口 | sidebar 底部深色 badge | 顶栏 picker | DIFFERENT | P2 |

---

## 2. Sidebar

| 项 | Codex | Lattice | 等级 | 优先级 |
|---|---|---|---|---|
| 宽度 | 280px | 260px | CLOSE | — |
| 项目列表 | 项目 + 描述 + 环境标签 | 项目名 + 路径 | CLOSE | P1 |
| 会话列表 | 项目下 + 会话数 | 项目下 + 消息数 | CLOSE | — |
| 可折叠 | 折叠为图标列 | 无折叠 | MISSING | P2 |
| 模型标识 | 底部深色 badge | 无（在顶栏） | MISSING | P2 |

---

## 3. Session / Thread

| 项 | Codex | Lattice | 等级 | 优先级 |
|---|---|---|---|---|
| 多会话并行 | 顶部 tab 栏 | 后台并行（无 UI 表达） | PARTIAL | P1 |
| 会话命名 | 自动从任务生成 | 需手动/默认 "New session" | PARTIAL | P1 |
| 会话切换 | tab 点击 | sidebar 点击 | CLOSE | — |
| 会话状态表达 | tab 常驻 | sidebar 状态点 | CLOSE | — |

---

## 4. Composer

| 项 | Codex | Lattice | 等级 | 优先级 |
|---|---|---|---|---|
| 形态 | 无边框极简 | 有边框卡片 | DIFFERENT | P0 |
| 附件按钮 | 橙色图标 | 无 | MISSING | P1 |
| 发送按钮 | 圆形深色箭头 | 方形按钮 + 文字 | DIFFERENT | P0 |
| 上方上下文 | 项目 + 分支 | 无 | MISSING | P0 |
| model/reasoning | 不在 composer | 顶栏 picker | DIFFERENT | P2 |
| placeholder | 极淡 | 正常 | CLOSE | — |
| 自动高度 | 有 | 有 | MATCH | — |
| 发送 | 点击按钮 | Enter / 点击 | CLOSE | — |

---

## 5. Agent Execution

| 项 | Codex | Lattice | 等级 | 优先级 |
|---|---|---|---|---|
| 用户消息右对齐 | ✓ | ✓（气泡） | MATCH | — |
| Agent markdown | ✓ | ✓ | MATCH | — |
| thinking 折叠 | 推断有 | ✓ block 折叠 | CLOSE | — |
| tool call 摘要 | 文件变更 +N-M | block 头 + 状态 | CLOSE | P1 |
| 执行状态 | 会话 tab + 响应 | running 指示 | CLOSE | — |

---

## 6. Tool Call / Thinking UI

| 项 | Codex | Lattice | 等级 | 优先级 |
|---|---|---|---|---|
| Tool 折叠 | 推断有 | ✓ 折叠 block | CLOSE | — |
| Tool 参数摘要 | 文件路径 | ✓ 参数摘要 | MATCH | — |
| 变更统计 +N-M | ✓ 融入消息 | ✓ 有 diff，但不在消息流 | PARTIAL | P0 |
| 数据表格渲染 | markdown 表格 | ✓ markdown 表格 | MATCH | — |

---

## 7. Git / Diff

| 项 | Codex | Lattice | 等级 | 优先级 |
|---|---|---|---|---|
| 分支显示 | 顶栏 + 右侧面板 | GitPanel 内 | PARTIAL | P0 |
| 变更统计常驻 | ✓ | 需打开 panel | PARTIAL | P0 |
| diff 融入会话 | ✓ | 独立 panel | DIFFERENT | P0 |
| diff 查看 | 文件列表 + diff | ✓ 文件列表 + diff | CLOSE | — |
| commit | 推断有 | ✓ commit bar | CLOSE | — |

---

## 8. Terminal

| 项 | Codex | Lattice | 等级 | 优先级 |
|---|---|---|---|---|
| 终端 | 未观察到独立终端 | node-pty 完整实现 | DIFFERENT | P2 |
| 命令执行 | 融入会话（tool call） | bash tool + 独立终端 | CLOSE | — |

> 说明：Lattice 的 Terminal 是**超出** Codex 的能力（Codex 未观察到独立 PTY 终端）。保留但应降为可折叠 panel，不侵占主工作区。

---

## 9. Worktree

| 项 | Codex | Lattice | 等级 | 优先级 |
|---|---|---|---|---|
| Worktree 设置 | Settings 有分类 | 无 UI 入口（git 层有 API） | PARTIAL | P1 |

---

## 10. Permission

| 项 | Codex | Lattice | 等级 | 优先级 |
|---|---|---|---|---|
| 权限确认 | Unknown | modal 弹窗（allow once/session/always/deny） | UNKNOWN | — |

> Lattice 的 Permission 后端完整（权限门 + 分级授权），UI 是 modal。Codex 形态未知，暂不调整。

---

## 11. Settings

| 项 | Codex | Lattice | 等级 | 优先级 |
|---|---|---|---|---|
| 结构 | 左侧导航 + 右侧内容 | 单列滚动 | DIFFERENT | P1 |
| 分类 | Git / Worktrees / IDE / 平台 | Appearance / Model / Agent | PARTIAL | P1 |
| 模型/API | 有 | ✓ | MATCH | — |

---

## 12. Design System

| 项 | Codex | Lattice | 等级 | 优先级 |
|---|---|---|---|---|
| 主题 | Light（默认观察） | Dark 默认 + Light | DIFFERENT | P1 |
| Sidebar 背景 | #f0f0f0 | #15151a（dark） | DIFFERENT | P1 |
| 主内容 | #ffffff | #101013（dark） | DIFFERENT | P1 |
| Composer | 无边框 | 有边框 | DIFFERENT | P0 |
| 发送按钮 | 圆形深色箭头 | 方形 ↑ | DIFFERENT | P0 |
| Attachment | 橙色图标 | 无 | MISSING | P1 |
| 圆角/阴影 | 极简低对比 | 有边框+阴影层次 | DIFFERENT | P1 |

> **关键**：Codex（本机）默认是 **Light** 主题，而 Lattice 默认 **Dark**。这是最大的视觉差异。Lattice 应支持 Light 主题作为一等公民，并重新审视 light 下的 token。

---

## 13. 优先级结论

### P0（体验级，下一阶段核心）
1. **Composer 重构**：无边框 + 圆形深色发送按钮 + 橙色 attachment 图标 + 上方项目/分支上下文。
2. **Git/Diff 融入会话流**：文件变更（`path +N-M`）直接出现在消息流，而非独立 panel。
3. **Git 状态常驻顶栏**：分支 + 变更统计始终可见。
4. **Light 主题成为一等公民**：调整 light token（#f0f0f0 sidebar / #fff 主内容）。
5. **三栏布局探索**：右侧常驻 git/diff 面板（或至少顶栏 git 状态）。

### P1（重要）
6. 会话 tab 栏（多会话并行可视化）+ 自动命名。
7. Settings 改为左侧导航 + 右侧内容。
8. 附件按钮（@文件 / 图片）。
9. Worktree UI 入口。
10. 视觉低对比化（弱化边框/阴影，向 Codex 的极简靠近）。

### P2（增强）
11. Sidebar 折叠为图标列。
12. 模型入口移到 sidebar 底部深色 badge。
13. Terminal 保留但确认为"超出 Codex 的能力"，降为可折叠。

---

## 附：Lattice 已超越 Codex 的能力（保持优势）

- **独立 PTY Terminal**（Codex 未观察到）
- **中英文双语**（Codex 本次未观察到）
- **Extension Marketplace UI**（Codex 有 plugins 但未观察到 marketplace 式浏览/安装界面）
- **明确的 Permission 分级授权 UI**（allow once/session/always/deny）
- **可拖动 resize 的 Bottom Panel**
