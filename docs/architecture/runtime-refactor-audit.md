# Runtime Refactor — Audit

Code-grounded audit before unifying Local / Bundled / Remote Pi into one
`PiRuntime` abstraction. Identifies what exists, what duplicates, and what the
target shape is.

## 1. Current runtime paths

There are **three parallel runtime paths**, selected at startup in
`src/renderer/src/main.tsx` `selectAdapter()`:

| Path | Adapter | Transport | Backing |
|---|---|---|---|
| Desktop local | `lattice-tauri.ts` | Tauri `invoke`/`event` | Rust Desktop Core → spawned Pi sidecar (JSONL stdio) |
| Remote | `lattice-remote.ts` | WebSocket (WSS) | `bin/lattice-runtime.rs` Runtime Host → its own Pi sidecar |
| Stub | `lattice-stub.ts` | none | browser placeholder |

Selection is a hand-written branch:

```ts
if (config.mode === "remote" && config.remoteUrl) return createLatticeRemote(...);
if (isMobileWebView()) return createLatticeStub();
return createLatticeTauri();
```

`runtime-config.ts` currently only models `{ mode: "local"|"remote", remoteUrl,
remoteToken }` in localStorage — there is **no RuntimeProfile**, no Installed vs
Bundled distinction, no capability negotiation.

## 2. Desktop spawn

`pi.rs::spawn_pi` resolves the binary as: packaged resource → dev bundled →
`node` fallback, then `Command::new(bin).arg("--mode rpc").arg("--session-dir")
...` with piped stdin/stdout JSONL, a lifecycle state machine, and bounded
restart. This is the "Bundled Pi" today; **Installed Pi is not discovered or
used** (only the `node` dev fallback touches a local install).

## 3. Remote connection

`lattice-remote.ts` speaks `{id, method, params}` over WSS. The Host
(`lattice-runtime.rs`) spawns its own Pi and maps methods via `method_to_rpc`
(Pi RPC) + `method_to_local` (git/workspace/settings/session/marketplace/
projects plain functions). Local and Remote therefore duplicate the
method→capability mapping in two places.

## 4. State ownership (current, not target)

| State | Location | Owner today |
|---|---|---|
| Auth / API keys | `~/.pi/agent/auth.json` | shared with user Pi ✅ |
| Provider models | Pi RPC `get_available_models` | Pi ✅ |
| Agent settings | `~/.pi/agent/settings.json` (marketplace ext toggles) | Pi (partial) |
| **Sessions** | `~/.lattice/sessions/*.jsonl` (`--session-dir`) | **Lattice** (not Pi's own store) |
| Lattice app settings | `~/.lattice/tauri-settings.json` | Lattice ✅ |
| Recent projects | `~/.lattice/state.json` | Lattice ✅ |

Gap: **sessions are Pi-format JSONL but stored in a Lattice directory**, so the
`pi` CLI and Lattice do not share one session store. This is the main
"duplicate session source of truth" to resolve (see §11 of the plan).

## 5. PTY / Git / Filesystem

- Local: Rust `pty.rs` / `git.rs` / `workspace.rs` execute on the GUI machine.
- Remote: `lattice-runtime.rs` `method_to_local` calls the same plain Rust
  functions on the Host machine (git/workspace/settings/session), but **PTY is
  not implemented in the Host** — remote terminal is a known gap.
- The UI has no notion of "execution context"; it assumes GUI machine == runtime
  machine.

## 6. Duplicated / stale abstractions

- Two spawn implementations: `pi.rs` (desktop) vs `lattice-runtime.rs` (host).
- Two protocol mapping tables: `lattice-tauri.ts` (invoke names) vs
  `lattice-runtime.rs` `method_to_rpc`/`method_to_local` vs `lattice-remote.ts`
  (method names).
- Three event namespaces: `pi-event`/`pty-*`/`session-*` (Tauri) vs
  `session.event`/`terminal.data`/… (remote).
- `isMobileWebView()` + `mode === "remote"` branch leaks provider logic into UI.

## 7. Legacy

- `legacy/electron/` — reference only, already isolated.
- `lattice-stub.ts` — needed for browser fallback, but should be a
  `DisconnectedPiRuntime`, not a third "adapter".

## 8. Target architecture

```
React UI
   ↓ PiRuntime API (single)
RuntimeManager
   ├─ discovery · profiles · lifecycle · capabilities · session routing
   └─ Provider: Installed | Bundled | Remote
        └─ Transport: stdio (local) | websocket (remote)
             └─ Pi (local binary or remote host)
```

```
Binary Source (installed | bundled | remote)  ≠  State Source (pi home)
```

## 9. Migration plan (phases)

1. Define `PiRuntime` API + protocol/capability/profile types (pure TS).
2. `RuntimeManager` state machine + provider selection + discovery (pure).
3. Wrap existing Tauri path → `BundledPiProvider` (no behavior change).
4. `InstalledPiProvider` (Rust discovery command + same `~/.pi` home).
5. `RemotePiProvider` (formalize the WSS client as a provider).
6. Capability negotiation (surface capabilities from Pi/Host).
7. Runtime Profile persistence (replace `runtime-config.ts`).
8. UI: Runtime Indicator + Quick Switcher + Manage/Connect/Diagnostics.
9. Session store alignment (point Pi at canonical home, or document gap).
10. PTY/Git/Filesystem runtime-context adaptation.
11. Delete old parallel paths (only after providers prove equivalent).
12. Migration + architecture tests + dead-code audit.

## 10. What to keep / delete

- Keep: Rust `pi.rs` lifecycle (becomes `BundledPiProvider` internals);
  `lattice-runtime.rs` (becomes `RemotePiProvider` backend); `~/.pi/agent`
  auth; the JSONL RPC contract.
- Delete (once migrated): `runtime-config.ts` mode branch, `selectAdapter()`
  hand-rolled branch, the remote method→capability duplication, `isMobileWebView`
  provider leak.
