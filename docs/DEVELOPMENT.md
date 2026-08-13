# Development

## Project layout

```
app/
├── electron.vite.config.ts   # main/preload/renderer build config
├── package.json              # scripts + electron-builder config
├── vitest.config.ts          # test config
├── tsconfig.{node,web}.json  # split TS projects (node vs DOM)
├── src/
│   ├── main/                 # Electron main process (Node.js)
│   │   ├── index.ts          # app entry, window, service bootstrap
│   │   ├── ipc.ts            # ipcMain handlers
│   │   ├── runtime/          # RuntimeAdapter + PiRuntimeAdapter + permission gate
│   │   ├── session-registry.ts
│   │   ├── workspace.ts      # open project / list Pi sessions
│   │   ├── git.ts            # simple-git wrapper
│   │   ├── terminal.ts       # node-pty PTY manager
│   │   ├── extensions.ts     # marketplace (Pi package manager + registry protocol)
│   │   └── state.ts          # ~/.lattice app state (recent projects, settings)
│   ├── preload/              # contextBridge (window.lattice)
│   ├── renderer/             # React UI
│   │   └── src/
│   │       ├── store/useApp.ts        # zustand store
│   │       ├── lib/session-reducer.ts # pure event→transcript reducer
│   │       ├── lib/diff.ts            # unified-diff parser
│   │       ├── components/            # Sidebar, Thread, Composer, Terminal, ...
│   │       └── views/                 # Settings, Extensions
│   └── shared/               # types + IPC surface shared across processes
└── tests/                    # unit + integration + E2E
```

## Runtime architecture

The only place that knows about Pi is `src/main/runtime/pi-runtime.ts`. It uses
Pi's **SDK** (`createAgentSession`, `ModelRuntime`, `SessionManager`,
`SettingsManager`, `DefaultResourceLoader`) in-process:

```
Electron main ── SessionRegistry ── RuntimeAdapter ── PiRuntimeAdapter ── Pi SDK
                    ▲                                   │
                    │ permission gate (inline extension)│
                    └──── DialogBridge ──── renderer approval modal
```

- One shared `ModelRuntime` (auth, models, catalogs).
- Each session is an independent `AgentSession` + `SessionManager` (JSONL file
  under `~/.pi/agent/sessions/`), so sessions run **in parallel**.
- The permission gate is an inline Pi extension (`createPermissionGateFactory`)
  that subscribes to `tool_call` and blocks `bash`/`write`/`edit` pending desktop
  approval via `DialogBridge`.
- `DialogBridge` also backs the extension `ctx.ui` surface (select/confirm/input/
  notify), so third-party Pi extensions can drive the desktop UI.

A subprocess/RPC runtime (spawn `pi --mode rpc`, like the reference approach) is
a documented future alternative behind the same `RuntimeAdapter` interface; it
is not required because the in-process SDK is validated end-to-end.

## Event flow

The renderer does not poll. Pi `AgentSession` events are reduced into a
transcript by a **pure** reducer (`lib/session-reducer.ts`) and mirrored into the
zustand store. See `src/shared/types.ts` for the message/event shapes (they
mirror Pi's own types).

## Adding a capability

1. **Reuse Pi first** — sessions, prompting, streaming, tools, models, skills,
   extensions, settings are all Pi. Don't reimplement.
2. **Wrap Pi** — permission gates, custom UI bridges go through Pi's extension
   system.
3. **Desktop-only** — terminal (PTY), git, diff, project/session UI, marketplace
   UI, OS integration live in `src/main` + `src/renderer`.

## Testing

```bash
npm run test            # vitest: unit (pure) + integration + E2E
```

- **Unit** — `session-reducer`, `parseDiff`, permission policy, `projectIdForPath`.
- **Integration** — `PiRuntimeAdapter` → Pi SDK → live model → tool → workspace.
- **E2E** — open project → session → prompt → mutating tool → git diff → continue.

Live tests (`pi-runtime.integration`, `e2e-flow`) skip when no API key / OAuth
token is available (offline CI). Set `DEEPSEEK_API_KEY` / `ANTHROPIC_API_KEY` or
use `~/.pi/agent/auth.json` to run them.
