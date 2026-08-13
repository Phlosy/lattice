# Codex Desktop 逆向 — 实时笔记（工作草稿）

> 基于真实操作 + OCR + 截图存档。坐标用归一化（截图内，origin 左下）。
> 截图存 research/codex-ui/

## 环境
- ChatGPT.app v26.803.61601（最新版，内含 Codex workspace）
- 窗口：1512x859 @ (0,33)
- 主题：light（sidebar #f4f4f4，主内容 #ffffff，tab栏 #e9eaea）
- 模型：deepseek（config.toml: model=deepseek-v4-pro, reasoning=high）

## 布局（初步）
- 顶部多层：
  - 窗口 tab 栏（文件 tabs，如 "oversold-rebour x" + "+"）
  - 导航栏（< > + 项目名 "# strategy-research" + × 关闭 + + 新建）
  - 会话上下文（标题 + git 分支 "dev → origin/main" + 变更 "+1903 -38"）
- 左侧 sidebar（宽约 174px，x_norm 0.045~0.16）：
  - 项目列表（pi-gui / glib / steward / probability-first / strategy-research）
  - 会话列表（项目下）
  - 底部模型标识（深色 badge "deepseek"）
- 主内容（x_norm 0.16~0.95，白色）：
  - 会话消息
  - diff/文件变更列表（每个文件 +N -M）
- Composer：位置未确认（当前 diff 视图可能隐藏）

## 关键发现
1. Diff 融入会话：文件变更列表直接显示在会话消息流中，带 +N -M 行数统计
2. 顶部有 git 分支信息（dev → origin/main）+ 变更统计
3. 点击左上 "Codex" → 主内容清空（导航/主页视图）
4. 点击右上 "+" → 打开新 tab/会话

## 待探索
- Composer（新建活跃会话）
- Agent 执行各状态（thinking/tool/command）
- Settings / Skills / Automations
- Worktree / Parallel
- Permission
- 精确尺寸（sidebar 宽、顶栏高、composer 高）
