# Remove Electron — React UI 接入 Tauri 迁移计划

> 最后一步：把正式 Lattice 的 React UI 从 Electron 壳迁到 Tauri 壳，
> 用 Rust Desktop Core + Pi RPC sidecar 替代 Electron main + Pi SDK。
> 原则：React UI 尽量不改、RuntimeAdapter 抽象、Pi 不重写、禁止 Big Bang。

## 1. 现状对比

| 层 | Electron（当前正式） | Tauri PoC（已验证） |
|---|---|---|
| UI | React（26 文件，window.lattice 50 方法） | vanilla JS（临时） |
| Desktop Core | Node.js（Electron main） | **Rust**（workspace/git/pty/settings/marketplace/pi_*） |
| Pi Runtime | in-process SDK | **RPC sidecar**（已验证） |
| 体积 | 285M | ~9.4M + sidecar |

## 2. 接口对齐清单（window.lattice 50 方法 → Rust 命令）

### ✅ 已对齐（Rust 已有等价命令）
| window.lattice | Rust 命令 | 说明 |
|---|---|---|
| openProject | workspace::open_project | |
| listFiles | workspace::list_files | |
| gitStatus/gitDiff/gitCommit/gitBranches/gitListWorktrees/gitCreateWorktree | git::* | 缺 git_checkout |
| createTerminal/terminalInput/terminalResize/killTerminal | pty::* | |
| getSettings/setSettings | settings::* | |
| extInstall/extUninstall/extSearch | marketplace::pi_install/pi_remove/pi_list | 名称映射 |
| prompt/steer/followUp/abort/continueSession | pi_prompt/pi_abort（需补 steer/followUp/continue） | |
| respondPermission | pi_respond_ui | |

### ⬜ 待实现（Rust 缺命令）
| window.lattice | 需新增 Rust 命令 |
|---|---|
| getProjects/removeProject | projects（读 ~/.lattice 状态，复用 Electron 的 AppState 逻辑） |
| getSessions/createSession/openSession/renameSession/deleteSession | session（Pi RPC 的 new_session/get_entries + SessionManager） |
| getSessionState/getSessionMessages | session（Pi RPC 的 get_state/get_messages） |
| getProviders/getModels/setModel/setThinkingLevel/login | model（Pi RPC 的 get_available_models/set_model/set_thinking_level） |
| extList/extToggle | marketplace（Pi RPC 无，需 CLI 或 settings 读） |
| gitCheckout | git::git_checkout |

### 事件系统（9 个 on* 订阅）
- Pi streaming 事件（`pi-event`）已 emit，需**前端适配**为 React store 的事件格式（onSessionEvent/onSessionState）。
- 权限（`ui-request`）→ onPermissionRequest。
- PTY（`pty-data`/`pty-exit`）→ onTerminalData/onTerminalExit。
- Git/Model 变更 → onGitChanged/onModelsChanged（可简化）。

## 3. 迁移子步骤（渐进，每步可验证）

1. **React 构建迁移**：新增独立 Vite 配置（复用 electron-vite 的 renderer 部分），构建到 Tauri `frontendDist`。
2. **window.lattice 桥接层**：写一个前端初始化脚本，用 Tauri `invoke` 封装 Rust 命令 + `listen` 封装事件，暴露 `window.lattice`（接口签名与 Electron preload 一致，React 代码不改）。
3. **Session 命令补齐**：Rust 实现 session 管理（Pi RPC new_session/get_state/get_messages/get_entries + 持久化元数据）。
4. **Model 命令补齐**：Rust 实现 model 管理（Pi RPC get_available_models/set_model/set_thinking_level + auth）。
5. **Extension 命令补齐**：marketplace 桥接 extList/extToggle。
6. **事件适配**：前端适配 pi-event → React store 事件格式。
7. **RuntimeAdapter 切换**：Electron 的 PiRuntimeAdapter（SDK）→ PiRpcAdapter（sidecar）。
8. **Full E2E**：React UI + Tauri 壳完整链路测试。
9. **删除 Electron 壳**：移除 electron main/preload + electron-vite 配置 + electron 依赖。

## 4. 风险与决策

| 风险 | 缓解 |
|---|---|
| React 依赖 window.lattice 细节 | 桥接层保持接口签名一致，React 不改 |
| Session 持久化差异（Pi SDK JSONL vs RPC） | Pi RPC 复用同一 SessionManager（JSONL），无差异 |
| Model auth（OAuth 流） | 复用 Pi CLI 的 auth（~/.pi/agent/auth.json），Rust 只转发 |
| 工作量大 | 每个子步骤独立提交 + 测试 |

## 5. 判定

- **Migrate 决策已确认**（体积 30 倍 + crash 隔离 + 已验证）。
- Remove Electron 是**纯工程迁移**（接口对齐 + 构建迁移），无架构风险。
- 建议按子步骤推进，每步 headless 测试 + 提交。

**状态：PLANNED（子步骤已明确，待执行）**
