# Tauri 迁移决策

> 基于真实 PoC 数据，决定 Lattice 是否从 Electron 迁移到 Tauri + Rust + Pi RPC sidecar。

## 1. PoC 验证结果

### 1.1 Pi RPC Sidecar（Node PoC）—— 8/8 通过

`poc/pi-sidecar/sidecar.mjs` 验证：

| 验收项 | 结果 |
|---|---|
| Start（spawn Pi RPC 进程） | ✅ |
| Session（get_state，sessionId 生成） | ✅ |
| Prompt（agent_start） | ✅ |
| Streaming（text_delta，124 chars） | ✅ |
| Tool Call（tool_execution_start） | ✅ |
| Cancel（abort） | ✅ |
| Crash 检测（SIGKILL 后进程退出） | ✅ |
| Restart（新 sidecar 恢复工作） | ✅ |

### 1.2 Rust spawn Pi（Headless cargo test）—— 通过

`poc/tauri-app/src-tauri/tests/pi_spawn.rs` 验证：
- Rust `Command::new("node").arg(cli.js --mode rpc)` 成功 spawn Pi
- JSONL 通信：get_state 响应 + prompt + agent_start + text_delta streaming
- **结论：Rust 能作为 Desktop Core 管理 Pi sidecar 并转发事件**

### 1.3 Bundle 体积对比

| 指标 | Electron | Tauri PoC |
|---|---|---|
| 应用体积 | **285M**（Lattice.app） | **9.4M**（二进制，未含 bundle 壳） |
| 说明 | Chromium + Node 打包 | Rust + 系统 WKWebView |

**Tauri 体积约为 Electron 的 1/30**。即使加上 Pi sidecar（Node ~30M + Pi dist ~15M + provider SDK ~50M ≈ 95M），总体积仍约 105M，为 Electron 的 37%。

## 2. 架构对比

| 维度 | Electron（当前） | Tauri（PoC 目标） |
|---|---|---|
| UI | React（Chromium） | React（系统 WebView）✅ 可复用 |
| Desktop Core | Node.js（Electron main） | Rust |
| Pi Runtime | **in-process SDK** | **RPC sidecar 子进程** |
| Crash 隔离 | 无（SDK 同进程） | ✅ sidecar 隔离（已验证） |
| 体积 | 285M | ~105M（含 sidecar） |
| RuntimeAdapter | ✅ 已有抽象 | ✅ 保持（唯一 Runtime 接口） |

## 3. 决策

### 结论：**MIGRATE**（渐进迁移到 Tauri）

**依据（真实数据）**：
1. **体积**：9.4M vs 285M，30 倍差距（决定性）。
2. **Pi sidecar 可行性已验证**：Node PoC 8/8 + Rust headless 测试通过。
3. **Crash isolation 已验证**：SIGKILL Pi 后 Rust/Node 能检测退出并重启。
4. **React UI 可保留**：Tauri 用系统 WebView，前端 TS/React/Design System 全部复用。
5. **不重写 Pi**：Pi 保持 Node/TS，作为 RPC sidecar。

**未验证（诚实声明）**：
- Memory（Idle RSS）未精确测量（PoC 为 minimal，需完整应用后测）。
- Startup（冷启动）未精确测量。
- Windows/Linux 未真实运行（Tauri 理论跨平台，但需实测）。
- 完整迁移的工程工作量（Rust 需实现 Workspace/Git/PTY/Permission 等 Desktop Core）。

## 4. 迁移顺序（渐进，禁止 Big Bang）

```
Tauri Skeleton          ✅（PoC 已建）
Pi RPC sidecar          ✅（已验证）
Workspace / Filesystem  → 待实现
Git / Worktree          → 待实现
PTY                    → 待实现（portable-pty crate）
Permission             → 待实现
Settings               → 待实现
Marketplace Bridge     → 待实现
Full E2E               → 待实现
Remove Electron        → 最后
```

每个模块迁移后运行原有测试（unit/integration/E2E）。

## 5. Pi sidecar 关键设计（PoC 已确立）

```
Tauri Rust (Desktop Core)
    │  Command::new("node").arg(cli.js --mode rpc)
    │  JSONL stdin/stdout
    ▼
Pi Runtime Process（Node/TS，原生，不重写）
```

- `pi_prompt` / `pi_abort` / `pi_crash` / `pi_status` 命令（Rust 侧）
- 事件通过 Tauri `emit("pi-event", ...)` 转发到 WebView
- Pi 进程退出 → Rust 检测 → emit("pi-exit") → 可重启恢复

## 6. 保留项

- **React + TypeScript UI + Design System**（完整复用）
- **RuntimeAdapter 抽象**（未来可扩展 CodexRuntimeAdapter 等）
- **Pi Runtime**（Node/TS，RPC sidecar，不重写）
- **Extension Marketplace**（Lattice 特色）
- **品牌 / Logo**

---

**最终判定：MIGRATE（渐进迁移 Tauri + Rust + Pi RPC sidecar）**
