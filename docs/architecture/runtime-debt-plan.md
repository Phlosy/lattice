# Runtime 技术债清偿方案

基于当前真实代码（`runtime/manager.ts`、`provider.ts`、`profiles-store.ts`、
`RuntimeIndicator.tsx`、`main.tsx`）的系统性设计，目标是"统一状态源 + 能力驱动
UI + 可扩展的 Runtime UX"，而非零散补丁。

## 1. 技术债清单与根因

| # | 债 | 现状（代码证据） | 根因 |
|---|---|---|---|
| D1 | 运行时状态**分散在三个地方** | `RuntimeManager`（内存状态）、`profiles-store`（持久化列表）、`RuntimeIndicator`（直接读 profiles-store，不读 manager） | 没有单一响应式 runtime store |
| D2 | Indicator 的状态是**假的** | `RuntimeIndicator.tsx` 里 `<span className="status-dot success" />` 写死绿点，不反映 connected/connecting/offline | 状态未流到 UI |
| D3 | **能力是常量** | `provider.ts` 返回 `LOCAL_CAPABILITIES`/`REMOTE_CAPABILITIES`；`getRuntimeCapabilities()`（真实）已存在但**未接入 manager** | 协商只做到"上报"，没做到"消费" |
| D4 | **平台判断泄露到 UI** | `main.tsx` 的 `isMobileWebView()` UA 正则决定"能否 spawn 本地 Pi" | "能否本地 spawn"是能力，不是 UA 字符串 |
| D5 | **stub 是第三种 adapter** | `main.tsx` 用 `createLatticeStub()` 作无 Tauri 回退，但 `provider.ts` 已有 `createDisconnectedRuntime()` | "断连"语义未统一 |
| D6 | **manager 单例不可达** | `main.tsx` 里 `const runtimeManager = new RuntimeManager()`，其他模块无法引用 | 无导出/无注入 |

核心一句话：**现在有"管理态 + 持久态 + 展示态"三个平行源，能力是写死的，UI 读不到真实运行状态。**

## 2. 目标：单一 Runtime Store（解决 D1/D2/D6）

引入一个 Zustand store（与项目现有的 `useApp` 同风格），作为 Runtime 的**唯一响应式事实源**：

```ts
// runtime/store.ts
interface RuntimeStore {
  state: RuntimeConnectionState;
  profile: RuntimeProfile | null;
  info: RuntimeInfo | null;
  capabilities: RuntimeCapabilities;      // 协商后（不再是常量基线）
  api: LatticeApi | null;

  boot(): Promise<void>;                  // 发现 + 选 profile + 连接 + 协商
  connect(profile: RuntimeProfile): Promise<void>;
  disconnect(): Promise<void>;
  selectProfile(id: string): Promise<void>; // 切换（graceful）
  addRemote(p): void; removeProfile(id): void;
  refreshCapabilities(): Promise<void>;
}
```

- `RuntimeManager` 降级为**纯控制器**（状态机 + provider 选择 + 生命周期），它**写入** store，不再自己暴露 `subscribe()`。
- `profiles-store.ts` 降级为**纯持久化**（load/save），store 内部调用它。
- `main.tsx` 不再持有单例，只调用 `runtimeStore.boot()`；`window.lattice` 在 boot 后由 store 赋值。

数据流收敛为：

```text
RuntimeManager(controller) ──写──▶ runtimeStore(单一事实源) ◀──读── UI hooks
profiles-store(persistence) ◀──读写──┘
```

## 3. 能力模型完成（解决 D3）

1. 在 `RuntimeCapabilities` 增加 **`localSpawn`** 能力（桌面 true / 移动 false），替换 `isMobileWebView()`（D4）。
2. `connect()` 增加**协商步骤**：`createProvider` 得到静态基线 → 异步拉真实能力（本地 `getRuntimeCapabilities()`，远端 Host 的 `runtime.capabilities`）→ `mergeCapabilities(基线, 真实)` 写入 store。
3. UI 用 `useRuntime()` 的 `capabilities` 做门控，**永不** `if provider.type` 或 UA。

## 4. Runtime UX 分层（解决 D2，提供扩展骨架）

全部由 store 驱动，层级从"轻"到"重"：

```text
RuntimeIndicator（状态栏，常驻）
   └─ 点 → RuntimeQuickSwitcher（popover：profile 列表 + 状态 + 连接）
          └─ "+ Connect to Runtime" → RuntimeConnectionDialog（name/url/token + test）
          └─ "Manage" → RuntimeManagerView（Settings 内：CRUD + 能力清单）
                          └─ RuntimeDiagnostics（开发者：info/capabilities/PID/transport/logs/restart/copy）
```

- Indicator：`useRuntime()` 读 `{ state, profile.name }`；圆点映射 state（connected 绿 / connecting 黄 / reconnecting 蓝 / offline 灰 / incompatible 红 / crashed 橙）。**删掉写死的 `success`**。
- 每个组件都是独立可测的纯展示组件，输入全来自 store。

## 5. 债务退出路径（D4/D5 的收口）

- **`isMobileWebView()`**：删除，替换为 `info.localSpawn === false`（能力）。`main.tsx` 的 boot 逻辑变为：`localSpawn ? 本地 profile : remote profile 或断连`。
- **`lattice-stub.ts`**：删除。`main.tsx` 的无 Tauri 回退改用 `provider.ts` 已有的 `createDisconnectedRuntime()`；`window.lattice` 在断连态是一个"全拒"的 api（或 UI 显示"无运行时"）。
- 二者都有明确删除条件：`rg` 证明无引用 + 架构边界测试仍通过。

## 6. 实施顺序（每步可测、可提交）

```text
P1  runtime/store.ts（Zustand）+ useRuntime() hook + 单测（状态/能力门控）
P2  RuntimeManager 改控制器：写 store，删 subscribe()；单测（迁移）
P3  Capability 协商：localSpawn 能力 + connect 后异步 merge；单测
P4  main.tsx 改 boot()：删 isMobileWebView；lattice-stub → DisconnectedRuntime
P5  RuntimeIndicator 重构（真实 state 圆点）+ QuickSwitcher popover
P6  ConnectionDialog + ManagerView（增强 Settings runtime 区）+ Diagnostics
P7  删 lattice-stub.ts、isMobileWebView；架构边界测试 + dead code 更新
```

## 7. 验收标准

- [ ] UI 无 `isMobileWebView()` / `createLatticeStub()` / 直接 `__TAURI__` 引用
- [ ] `runtimeStore` 是唯一运行时事实源；Indicator 圆点反映真实 state
- [ ] `capabilities` 来自协商（非纯常量），含 `localSpawn`
- [ ] 切换 profile 不重建 Pi session / PTY（复用现有 Rust 生命周期）
- [ ] QuickSwitcher / ConnectionDialog / ManagerView / Diagnostics 可操作
- [ ] 架构边界测试通过；typecheck / vitest / cargo 全绿
- [ ] 旧 `lattice-stub.ts` 与 `isMobileWebView` 已删除（有 rg 证据）

---

**本方案的关键取舍**：不做"每个 UI 自己拉一遍状态"，而是收敛为**单一 runtime store + 能力协商 + 分层展示组件**——这样后续新增任何 Runtime 特性（远程、多 host、诊断、状态徽标）都只需"写 store + 注册一个展示组件"，不再散落平行状态。
