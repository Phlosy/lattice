# Remote Runtime Architecture

Mobile (Android / iPhone / iPad) does **not** run a local Pi sidecar. It is a
secure client to a **Lattice Runtime Host** running on a trusted machine
(desktop, dev server, or remote dev box).

```
                     Lattice UI (React, shared)
                            │
          ┌─────────────────┴─────────────────┐
          │ Desktop                            │ Mobile
          │                                   │
   LocalPiRuntimeAdapter              RemotePiRuntimeAdapter
          │ (Tauri IPC)                        │ (WSS)
          ▼                                   ▼
   Rust Desktop Core ──────────────►  Lattice Runtime Host
          │                                   │
   Pi RPC Sidecar ◄───────────────────────────┘
          │
        Pi Runtime
```

## Principles

- **RuntimeAdapter stays abstract.** The React UI depends only on the
  `LatticeApi` interface (`src/shared/api.ts`); it never knows whether the
  runtime is local or remote.
- **No second agent protocol.** The remote protocol is the existing local RPC
  event model (JSON lines over stdin/stdout) transported over WebSocket.
- **Mobile never fakes a desktop shell.** No local bash, no local git, no local
  worktree. Terminal = remote PTY stream; Files = remote read/diff.

## RuntimeAdapter implementations

| Adapter | Transport | Used by | Runtime |
|---|---|---|---|
| `LocalPiRuntimeAdapter` | Tauri IPC (`invoke`/`listen`) | Desktop | Local Pi RPC sidecar |
| `RemotePiRuntimeAdapter` | WebSocket (WSS) | Mobile (and optionally Desktop) | Remote Runtime Host |

Both implement `LatticeApi`. Desktop defaults to Local; Mobile defaults to
Remote.

## Runtime Host

A headless process (or a Desktop app mode) that exposes the existing Rust
capabilities — Pi RPC, workspace, git, worktree, PTY, filesystem, permission,
sessions, extensions — over an authenticated WebSocket.

- Runs on the user's computer / a dev server / a remote dev machine.
- Owns the Pi sidecar lifecycle (same state machine as Desktop).
- One host can serve multiple trusted devices.

## Remote protocol

WebSocket + JSON messages. Message shape mirrors the local RPC event model:

```jsonc
// client → host (request)
{ "id": "r1", "method": "prompt", "params": { "sessionId": "...", "text": "..." } }

// host → client (response)
{ "type": "response", "id": "r1", "data": { ... } }

// host → client (event, unsolicited)
{ "type": "event", "event": "pi-event", "payload": { ... } }
```

Supported methods (mapped 1:1 to `LatticeApi`):

```
connect authenticate
project.list  session.list  session.create  session.open
prompt  steer  follow_up  abort  continue
model.list  model.set  thinking.set
permission.respond
terminal.create  terminal.input  terminal.resize  terminal.kill
git.status  git.diff  git.commit  git.worktrees
runtime.status
```

Events (host → client):

```
session.event  session.state  session.created
permission.request
terminal.data  terminal.exit
runtime.state  git.changed
```

## Secure pairing

```
Host generates pairing code (short-lived token + QR)
      ↓
Mobile scans QR / enters code over WSS
      ↓
Host verifies, issues long-lived device credential
      ↓
Mobile stores credential (keychain), reconnects without re-pairing
```

- TLS (WSS) for all traffic.
- Token expiration (pairing codes are one-time + time-boxed).
- Device management: name, revoke, last-connected, permission scope.
- **Never** expose `0.0.0.0:PORT` with no auth.

## Capability boundary

| Capability | Desktop (local) | Mobile (remote) |
|---|---|---|
| Pi Runtime | local sidecar | remote host |
| Shell / bash | local | remote PTY stream |
| Git / worktree | local | remote |
| Filesystem | local | remote (read/diff only) |
| Extensions | local | remote |
| Terminal | local PTY | remote PTY UI |

## Status

- [x] Architecture defined (this document)
- [ ] RemotePiRuntimeAdapter (React, WSS client)
- [ ] Runtime Host (Rust, WebSocket server)
- [ ] Secure pairing (token/QR + device credentials)
- [ ] Tauri Android / iOS build
- [ ] Mobile UX (Phone / Tablet / Desktop layout classes)
