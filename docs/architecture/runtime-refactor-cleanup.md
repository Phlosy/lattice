# Runtime Refactor — Cleanup Report

What was deleted or superseded during the unified Pi Runtime refactor, and why.

## Deleted

| Item | Why | Replaced by |
|---|---|---|
| `src/renderer/src/lib/runtime-config.ts` | Old single-config `{ mode, remoteUrl, remoteToken }` model — no profiles, no installed/bundled distinction | `runtime/profiles-store.ts` (list + active id + legacy migration) |
| `selectAdapter()` hand-rolled branch (`if mode === "remote"` / `isMobileWebView`) | Provider logic leaked into UI | `RuntimeManager.connect(explicit, discovery)` + `runtime/provider.ts` |
| SettingsView `RuntimeSection` (mode select + url/token fields) | Single-runtime UI | profile list + add/remove remote (reads `profiles-store`) |
| `sidebar` bottom model badge (earlier phase) | Duplicate model entry | single header `ModelPicker` |
| `PanelStack` fixed bottom panel (earlier phase) | Fixed layout | FlexLayout dockable workbench |

## Superseded (kept as transport, now behind the provider)

| Item | Role now |
|---|---|
| `lattice-tauri.ts` | Local transport (`BundledPiProvider` / `InstalledPiProvider` back `createLatticeTauri()`) |
| `lattice-remote.ts` | Remote transport (`RemotePiProvider` backs `createLatticeRemote()`) |
| `lattice-stub.ts` | No-Tauri browser fallback (still used by `main.tsx`) |
| Rust `pi.rs` spawn | `BundledPiProvider` internals; now also honors `pi_set_executable` |
| Rust `bin/lattice-runtime.rs` | `RemotePiProvider` backend; now also serves PTY + capabilities |

## Confirmed no remaining references

- `rg runtime-config` → only the deleted file itself (post-deletion: zero references).
- `rg loadRuntimeConfig|saveRuntimeConfigField|subscribeRuntimeConfig` → zero (outside the deleted file).
- Architecture boundary test (`tests/architecture-boundary.test.ts`) proves no UI file imports `lattice-tauri`/`lattice-remote`/`lattice-stub`/`__TAURI__` directly.

## Deliberately retained (with exit path)

- `lattice-stub.ts`: should become a `DisconnectedPiRuntime` semantic in a later pass; currently the browser/mobile no-Tauri placeholder. Exit: fold into `runtime/provider.ts` as `createDisconnectedRuntime`.
- `isMobileWebView()` in `main.tsx`: still needed to decide mobile → remote-or-stub at boot. Exit: move into a `platform` capability on the manager.

## Dependency audit

- Removed nothing from `package.json`/`Cargo.toml` this phase (all runtime deps still used by the adapters/host). `portable-pty`/`tokio`/`tokio-tungstenite`/`futures-util` remain required by the desktop core + Runtime Host.
