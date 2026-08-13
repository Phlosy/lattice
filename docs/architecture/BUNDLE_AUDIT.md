# Lattice Bundle Audit

> 对 macOS (arm64) 构建产物的体积分析 + Electron 内瘦身记录。
> 数据来源：`du` / `asar list` / `asar extract` 实测。
> 日期：本轮（v1.0.0）。

## 1. 体积构成（优化前）

`Lattice.app` 总计 **395M**，`release/` 总计 676M（含 dmg + zip）。

| Component | Raw Size | 必要？ | 可移除？ | 说明 |
|---|---|---|---|---|
| **Electron Framework** | 275M | ✅ 必要 | ❌ 不可（除非迁移 Tauri） | Chromium + Node 运行时，Electron 固定成本 |
| **app.asar**（应用+依赖） | 80M | ✅ 必要 | 部分可瘦 | 含 56M source map（可删） |
| **app.asar.unpacked** | 39M | ✅ 必要 | 部分可瘦 | Pi dist + clipboard + node-pty + photon |

### app.asar 内部（80M，node_modules 前 25）

| 依赖 | 体积 | 用途 | 可移除？ |
|---|---|---|---|
| @earendil-works | 22M | **Pi Runtime**（coding-agent/ai/agent-core） | ❌ 核心 |
| @mistralai | 19M | Mistral SDK（Pi 多 provider） | ⚠️ 若只保留 DeepSeek/OpenAI 可移 |
| @mariozechner | 12M | clipboard（TUI 剪贴板） | ✅ 已移除 |
| @google | 12M | Google genai SDK | ⚠️ 同上 |
| openai | 11M | OpenAI SDK | ⚠️ 同上 |
| @opentelemetry | 10M | 遥测 | ⚠️ 可评估 |
| web-streams-polyfill | 8.6M | polyfill（Node22 原生支持） | ⚠️ 可评估 |
| typebox | 5.7M | Pi 工具 schema | ❌ 核心 |
| @anthropic-ai | 5.4M | Anthropic SDK | ⚠️ 同上 |
| zod | 4.5M | schema | ❌ 传递依赖 |
| highlight.js | 2.6M | TUI 高亮 | ⚠️ Desktop 用 react-markdown |
| **source map（.map）** | **56M** | 调试用 | ✅ 已移除 |

## 2. 瘦身实施（Electron 范围内）

### 已实施

| 项 | 方法 | 节省 |
|---|---|---|
| **source map 排除** | `files` 加 `"!**/*.map"`（原 `!**/.map` 是错误 glob，不匹配 `*.js.map`） | **-34M**（asar 56M→部分移除 + unpacked 部分） |
| **clipboard 移除** | `files` 加 `"!node_modules/@mariozechner/**"`（optionalDep，仅 TUI 剪贴板用） | **-12M** |
| **docs/examples 排除** | `files` 加排除 pi-coding-agent 的 docs/examples/CHANGELOG/README | **-4M** |
| **locale 剪裁** | `electronLanguages: ["en","zh-CN","zh-TW"]` | **-若干 M** |

### 优化后体积

| 项 | 优化前 | 优化后 | 变化 |
|---|---|---|---|
| Lattice.app | 395M | **285M** | **-110M（-28%）** |
| app.asar | 80M | 46M | -34M |
| app.asar.unpacked | 39M | 11M | -28M |
| Electron Framework | 275M | 275M | 不变（固定） |

## 3. 结论

**关键结论：Electron Framework 275M 占 Lattice.app 的 96%（285M 中 275M），是体积瓶颈。**

- Electron 的 Chromium + Node 运行时是**固定成本**，无法通过配置瘦身解决。
- 应用代码 + 依赖（asar 46M + unpacked 11M = 57M）已经相当精简（含完整 Pi Runtime + 多 provider SDK）。
- 若需进一步减小（<50M 级别），**唯一路径是迁移 Tauri**（用系统 WebView 替代 Chromium，节省 ~275M）。

### 可选的进一步瘦身（风险较高，未实施）

| 项 | 节省 | 风险 |
|---|---|---|
| 移除 @mistralai/@google/openai/@anthropic-ai/@aws-sdk（仅保留 DeepSeek + OpenAI） | ~50M | 破坏 Pi 多 provider 能力 |
| 移除 @opentelemetry + web-streams-polyfill + highlight.js | ~21M | 需验证运行时依赖 |

> 这些是 Pi 的**核心多 provider 能力**，移除违背「不重写/不裁剪 Pi」原则，故保留。

## 4. 源码 node_modules（开发环境 863M）说明

开发环境的 node_modules 863M 远大于打包产物，原因：
- `electron`（299M，dev 依赖，打包时用 electron-builder 下载的 Electron，不打包 node_modules/electron）
- `electron-winstaller`/`app-builder-lib`/`typescript` 等 dev 依赖
- **pi-coding-agent 的嵌套 node_modules 161M**（npm 未 hoist 的重复依赖）

这些**不影响打包体积**（electron-builder 自动扁平化 + 只打包 production dependencies）。

---

## 附：Tauri 迁移的体积预期

若迁移 Tauri（Rust + 系统 WebView）：
- 移除 Electron Framework 275M
- 保留 Pi Runtime sidecar（Node ~30M + Pi dist ~15M + provider SDK ~50M = ~95M）
- Rust core + 系统 WebView = ~5-10M

预期总体积：**~100-120M**（vs 当前 285M）。

详见 `TAURI_MIGRATION_DECISION.md`（PoC 完成后）。
