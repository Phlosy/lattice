# Lattice Architecture

Lattice is a cross-platform desktop coding agent with a React product UI, a
Rust/Tauri Desktop Core, and the upstream Pi agent runtime shipped as a bundled
RPC sidecar.

## Frozen production boundaries

```text
React product UI
      │
      │ window.lattice / LatticeApi
      ▼
RuntimeAdapter
      ├─ Desktop: Tauri adapter → Rust Desktop Core → local Pi RPC sidecar
      └─ Mobile:  Remote adapter → WSS Runtime Host → Pi RPC sidecar
```

- **React** owns product presentation and interaction state.
- **Rust/Tauri** owns desktop/OS infrastructure: windows, dialogs, filesystem,
  Git/worktrees, PTY, settings, packaging, and sidecar lifecycle.
- **Pi** remains the unmodified agent runtime with Node/TypeScript semantics.
  It is compiled by Bun into a standalone executable and communicates over
  JSONL RPC.
- **Electron** is legacy reference code only under `legacy/electron/`.

This boundary is architecture-frozen. Lattice does not rewrite Pi or move agent
semantics into Rust.

## Desktop process model

```text
┌────────────────────────────────────────────────────────────┐
│ Tauri application                                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ WKWebView/WebView2/WebKitGTK                         │  │
│  │ React → Zustand → explicit LatticeApi Tauri adapter │  │
│  └───────────────────────────┬──────────────────────────┘  │
│                              │ invoke / event                │
│  ┌───────────────────────────▼──────────────────────────┐  │
│  │ Rust Desktop Core                                   │  │
│  │ workspace · Git/worktree · PTY · settings · package│  │
│  │ session metadata · provider auth · lifecycle        │  │
│  └───────────────────────────┬──────────────────────────┘  │
│                              │ stdin/stdout JSONL RPC         │
│  ┌───────────────────────────▼──────────────────────────┐  │
│  │ Bundled Pi sidecar                                  │  │
│  │ models · prompts · streaming · tools · extensions  │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

The production Tauri adapter implements every `LatticeApi` member explicitly.
The benign stub is used only when rendering outside a Tauri/Remote host; it is
not mixed into the desktop production adapter.

## Capability ownership

| Capability | Owner | Implementation |
|---|---|---|
| Product UI, i18n, layout | React | Components + Zustand |
| Folder picker | Tauri | Official dialog plugin |
| Filesystem/project recents | Rust | Workspace/projects commands |
| Git, diff, commit, worktrees | Rust | System `git` process |
| Terminal | Rust + React | `portable-pty` + xterm.js |
| App settings | Rust | `~/.lattice/tauri-settings.json` |
| Persistent session files | Pi/Rust | `~/.lattice/sessions/*.jsonl` |
| Provider credentials | Pi-compatible store | `~/.pi/agent/auth.json` |
| Model catalog and selection | Pi RPC | `get_available_models`, `set_model` |
| Prompt/stream/tool events | Pi RPC | JSONL request/response/events |
| Permission confirmation | Pi extension + React | `permission-gate.ts` |
| Package install/remove | Bundled Pi CLI | Rust launches packaged sidecar binary |
| Crash recovery/shutdown | Rust | Bounded lifecycle state machine |
| Mobile runtime | Remote Host | Authenticated WSS adapter |

## Sessions

Pi session history is durable. Multiple independent session files may exist per
project, but the current desktop implementation owns one local Pi child process
and therefore runs **one active session at a time**. Switching or creating a
session is disabled while the current agent is busy so an active run is never
silently aborted.

True parallel local sessions require a future supervised sidecar pool; the UI
must not claim that behavior before it exists.

## Provider credentials and models

Pi remains the source of truth for available models. Desktop provider handling:

1. reads provider metadata from Pi's locked `auth.json` store;
2. passes a strict whitelist of shell-defined provider API-key variables only
   to the Pi child when a Finder-launched app did not inherit them;
3. stores API keys with Pi-compatible locking and restrictive permissions;
4. restarts the sidecar and restores the active session so Pi refreshes its
   available-model snapshot.

Credentials are never sent to the renderer.

## Lifecycle

Rust tracks:

```text
STOPPED → STARTING → READY ↔ BUSY
                       │
                       └→ CRASHED → RESTARTING → READY
                                      └→ FAILED
READY/BUSY → STOPPING → STOPPED
```

Sidecar spawn/restart is serialized. Pending RPC requests are failed and cleaned
up on transport errors, timeout, stop, crash, or replacement. Application exit
kills and waits for the child process.

## Packaging

Production installers bundle:

- the native Tauri application;
- the platform-specific Bun Pi executable;
- Pi runtime resources and permission extension;
- the React production bundle.

A user-installed Node/npm/Bun/Pi is not required. Public macOS releases are
Developer ID signed, notarized, Gatekeeper-assessed, and stapled before upload.

See:

- [`RELEASE.md`](RELEASE.md)
- [`BUILD.md`](BUILD.md)
- [`PLATFORM_SUPPORT.md`](PLATFORM_SUPPORT.md)
- [`architecture/REMOTE_RUNTIME.md`](architecture/REMOTE_RUNTIME.md)
