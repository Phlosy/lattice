# Lattice — Architecture

> Lattice is a cross-platform (macOS / Windows / Linux) desktop coding agent.
> The product UX and information architecture are benchmarked against OpenAI's
> Codex Desktop, but the agent runtime is **Pi** (`@earendil-works/pi-coding-agent`).
> Lattice has its own brand, design system, and extension ecosystem.

---

## 1. Goals

1. A real, launchable desktop app: open a folder/repo → create sessions → prompt a
   local Pi agent → stream reasoning/tool calls → review diffs → commit.
2. Multi-agent: multiple independent coding sessions run in parallel.
3. Open extension marketplace (VS Code-like) built on Pi's package system.
4. A unified, token-driven design system that reproduces Codex's information
   architecture without copying its assets/trademarks.

---

## 2. Runtime relationship

```
Lattice Desktop Shell (Electron)
        │
        │  IPC (typed, structured-clone)
        ▼
  Runtime Adapter  ◄── abstract interface, agent-agnostic
        │
        ▼
  Pi Runtime  (@earendil-works/pi-coding-agent SDK, in-process)
```

We **do not fork or patch Pi**. Pi is consumed as a library (the `pi-coding-agent`
SDK), exactly as Pi's own docs recommend for Node.js embeddings. The
`RuntimeAdapter` interface is the only seam that knows about Pi, so a future
runtime (another coding agent) can be added behind the same interface.

The local Pi source at `../pi/pi` is the authoritative reference for behavior and
types. The runtime dependency is `@earendil-works/pi-coding-agent@0.84.1`, which is
the same code published to npm.

---

## 3. Capability mapping (Codex → Lattice → Pi)

| Codex feature            | Lattice capability            | Pi existing capability                                   | Implementation |
|--------------------------|-------------------------------|----------------------------------------------------------|----------------|
| Project / folder open    | Project (folder or git repo)  | `cwd`-bound session + resource discovery                 | Desktop WorkspaceManager + OS folder picker |
| Thread / session         | Session (one per thread)      | `AgentSession` + `SessionManager` (JSONL tree, branch)   | Direct SDK call |
| Prompt / streaming       | Composer + streamed messages  | `session.prompt()`, `message_update` events              | Direct SDK call |
| Reasoning state          | Thinking block (collapsible)  | `thinking_delta` events, `thinkingLevel`                 | Direct SDK call |
| Tool calling             | Tool cards (expandable)       | `tool_execution_*` events, built-in tools                | Direct SDK call |
| Terminal / bash          | Terminal panel + bash tool    | `bash` tool, `createLocalBashOperations`                 | node-pty (desktop) + Pi bash tool |
| Command execution        | Command palette               | extension commands / prompt templates / skills           | Desktop command palette |
| Diff / review            | Diff view, changed files      | `edit` tool returns `details.patch`/`details.diff`       | Desktop DiffViewer + GitManager |
| Git / branch / commit    | Git panel                     | (none in Pi — Pi delegates)                              | simple-git (desktop) |
| Worktree                 | Worktree isolation            | (none in Pi)                                             | git worktree (desktop) |
| Permission / approval    | Approval dialog (Codex-style) | Extension `tool_call` hook can `{block:true}`            | Built-in "permission gate" inline extension |
| Sandbox                  | Sandbox modes (v1: none)      | Pi containerization patterns (Docker/Gondolin)           | Settings + documented patterns |
| Model / reasoning config | Model picker, reasoning level | `ModelRuntime`, `session.setModel`, thinking levels      | Direct SDK call |
| Multi-agent / parallel   | Multiple concurrent sessions  | Multiple `AgentSession` instances                        | SessionRegistry (desktop) |
| Skills                   | Skills list + `/skill:`       | Pi Skills (SKILL.md, `skill:` commands)                  | Direct SDK call |
| Automations / plugins    | Extension marketplace         | Pi Extensions / Pi Packages (npm+git)                    | Desktop ExtensionRegistry + Registry protocol |
| Settings                 | Settings UI                   | `SettingsManager` (`~/.pi/agent/settings.json` + `.pi/settings.json`) | Desktop Settings UI maps to Pi settings |
| History                  | Recent projects + sessions    | `SessionManager.list` / `listAll`                        | Desktop SessionStore |
| Search / shortcuts       | Cmd/Ctrl+K palette            | `get_commands` (extensions/prompts/skills)               | Desktop command palette |

**Layering decision per capability:**

- **Direct Pi call** — session lifecycle, prompting, streaming, model, thinking, tools, skills, extensions.
- **Wrap Pi** — permission gate (an inline extension bridging Pi's `tool_call` hook to the desktop approval UI).
- **Extend Pi** — permission model; future sub-agent/custom-UI extensions.
- **Desktop-only** — terminal (PTY), git, worktrees, diff viewer, project/session UI, marketplace UI, app settings, OS integration.
- **OS layer** — folder picker, shell selection, process spawn, auto-update.

---

## 4. Tech stack decision

| Concern          | Choice                          | Rationale |
|------------------|---------------------------------|-----------|
| Shell            | **Electron**                    | Pi is TypeScript/Node; the SDK is the recommended in-process integration; rich Node APIs (child_process, fs); no Rust toolchain required; mature cross-platform packaging. |
| UI               | React + TypeScript + Vite       | Component model maps well to a token-driven design system. |
| Bundler          | electron-vite                  | One config for main/preload/renderer, HMR for renderer. |
| State            | Zustand                        | Minimal, event-driven store that mirrors the streamed agent state. |
| Terminal         | node-pty + xterm.js            | Real PTY (interactive shells), xterm for rendering. |
| Git              | simple-git                     | Wraps the system `git`; worktrees/branch/diff/commit. |
| Diff             | `diff` + custom viewer         | Unified patches already produced by Pi's `edit` tool. |
| Packaging        | electron-builder               | dmg (macOS), nsis/msi (Windows), AppImage/deb (Linux). |

Rejected alternatives: **Tauri** (needs Rust toolchain — not present; Node-based Pi
runtime would have to run as a spawned subprocess, losing the in-process SDK);
**Pi RPC subprocess** (more isolation, but serialization overhead and bundling a
separate binary — kept as a future runtime option behind the adapter interface).

---

## 5. Process architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Electron main process (Node.js)                              │
│   RuntimeAdapter (PiRuntimeAdapter)                          │
│     ├─ ModelRuntime (shared: auth, models, catalogs)         │
│     ├─ SessionRegistry (map sessionId → AgentSession)        │
│     ├─ PermissionManager (approval policy + UI bridge)       │
│     └─ permission-gate inline extension                      │
│   WorkspaceManager (open folder/repo, recent projects)       │
│   GitManager (simple-git: status/diff/branch/worktree)       │
│   TerminalManager (node-pty sessions)                        │
│   ExtensionRegistry (marketplace, install/uninstall)         │
│   AppSettings (Lattice-only settings; Pi settings delegate)  │
│   IPC (ipcMain.handle / webContents.send)                    │
├─────────────────────────────────────────────────────────────┤
│ Preload (contextBridge) — typed, minimal surface             │
├─────────────────────────────────────────────────────────────┤
│ Renderer (Chromium, React)                                   │
│   Zustand store ← IPC events (session events, terminal, git) │
│   Views: Sidebar, Thread, Composer, Terminal, Diff, Settings │
└─────────────────────────────────────────────────────────────┘
```

### Why agent runs in the main process (v1)

The Pi SDK is designed for in-process embedding. Agent failures surface as events
(`errorMessage`, `isError`), not process crashes, and `AgentSession.abort()` covers
cancellation. A `utilityProcess`-based isolation (moving `PiRuntimeAdapter` to a
separate Node process speaking the adapter protocol over IPC) is a documented
future hardening step — the adapter boundary already supports it.

### Multi-agent / parallel

Each Lattice **session is an independent `AgentSession`** (its own `SessionManager`
+ `Agent`), sharing one `ModelRuntime`. The `SessionRegistry` fans events out
per-session, so multiple sessions stream concurrently. Sub-agents (delegated
sub-tasks) are exposed through Pi's extension mechanism.

---

## 6. Data / storage

- **Pi sessions**: JSONL tree files under `~/.pi/agent/sessions/--<cwd>--/` (Pi's
  native format — reused, never re-implemented).
- **Pi settings**: `~/.pi/agent/settings.json` (global) + `.pi/settings.json`
  (project) — managed through Pi's `SettingsManager`.
- **Lattice app state**: `~/.lattice/state.json` (recent projects, window state,
  permission decisions, app-only settings like font size / theme overrides).
  Kept separate so there is **no config conflict** with Pi.

---

## 7. Permission & security model

Pi deliberately ships no permission system ("run in a container, or build your own
confirmation flow"). Lattice implements Codex-style approval via a built-in
**permission-gate extension** that subscribes to Pi's `tool_call` event and blocks
risky tools (`bash`, `write`, `edit`, and any tool that declares `requiresApproval`):

1. `tool_call` fires → gate checks the tool + args against the approval policy.
2. If approval is required, the gate calls the desktop `PermissionManager`, which
   opens a modal in the renderer (Allow once / Always / Deny).
3. The gate returns `{ block: true, reason }` on deny, or `undefined` on allow.

Policies (per project, persisted):
- `bash`, `write`, `edit` → prompt on first use ("Ask" default, like Codex).
- `read`, `grep`, `find`, `ls` → allowed by default.
- "Allow always" / "Deny" decisions persisted to `~/.lattice/permissions.json`.

Sandboxing (Docker / Gondolin / OpenShell) is surfaced in Settings and documented,
matching Pi's containerization patterns; v1 runs unsandboxed by default.

---

## 8. Extension marketplace

Lattice adds a VS Code-like marketplace on top of Pi's package system:

- **Registry protocol** (v1, no central server required): a JSON manifest served
  from any URL or local path listing packages + metadata (name, version, author,
  description, README, permissions, dependencies, kind).
- **Package kinds**: Pi Extension, Skill, Theme, Prompt, Tool, Provider (future).
- **Sources**: npm (`npm:pkg`), git (`git:host/repo@ref`), local path — Pi's native
  install format, delegated to Pi's package manager.
- **Security**: every extension that can execute code declares a permission
  manifest (`permissions: { files, network, shell, workspace }`), shown before
  install, with a trust requirement (review source before enabling).

---

## 9. Design system

A single token layer (CSS custom properties) drives all surfaces. No hardcoded
colors/spacing in components.

- **Typography**: system UI stack (SF Pro / Segoe UI / Roboto) for UI; a monospace
  stack (SF Mono / Cascadia / JetBrains Mono) for code, terminals, and diffs.
- **Density**: compact (Codex-like) — 4px base unit, small radii (6px), 1px hairline
  borders, layered elevation via surface tokens.
- **Theme**: dark (default) + light; tokens: `bg`, `surface`, `surface-hover`,
  `border`, `text`, `text-muted`, `accent`, `danger`, `warning`, `success`, plus
  semantic diff tokens (`diff-add`, `diff-del`).

Values are **Lattice's own approximations** informed by Codex's published UI, not
claimed to be Codex's exact official values.

---

## 10. Build & packaging

```
npm run dev       # electron-vite dev (HMR renderer)
npm run build     # typecheck + build all processes
npm run test      # vitest (unit + integration)
npm run package   # electron-builder (per-platform installer)
npm run package:mac|:win|:linux
```

- macOS: `.dmg` + `.app` (Apple Silicon; universal where feasible)
- Windows: `.exe` (NSIS) / `.msi`
- Linux: `.AppImage` + `.deb`

CI (GitHub Actions) builds all three platforms via a matrix.

---

## 11. Testing strategy

- **Unit** (vitest): RuntimeAdapter protocol mapping, permission policy, session
  store, registry protocol parsing, git manager (mocked `git`).
- **Integration**: `PiRuntimeAdapter` → Pi SDK → tool → workspace (with a stub
  provider / `SessionManager.inMemory()`), permission gate blocking.
- **UI** (vitest + testing-library): sidebar, thread list, composer, diff viewer.
- **E2E** (Playwright + electron): open project → create session → prompt → Pi
  executes → tool call → diff → continue conversation; plus session restore,
  terminal, permission confirm, settings.

---

## 12. Open questions / future work

- `utilityProcess` isolation for the runtime adapter (crash + sandbox isolation).
- Container sandbox (Docker/Gondolin) as a first-class setting.
- Sub-agent orchestration UX (spawn/delegate/merge) on top of Pi extensions.
- Central marketplace registry + signed packages.
