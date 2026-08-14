# Lattice

> A cross-platform desktop coding agent. Codex-like UX, powered by the **Pi** runtime.

Lattice is a macOS / Windows / Linux desktop app that puts a full coding-agent
workflow in a GUI: open a folder or Git repository, create independent coding
sessions, prompt a local agent, watch it reason and call tools, review diffs,
and commit — all with a clean, keyboard-friendly interface benchmarked against
OpenAI's Codex Desktop (but with its own brand and design system).

Under the hood, Lattice **does not reimplement the agent runtime**. It runs
[Pi](https://github.com/earendil-works/pi) (`@earendil-works/pi-coding-agent`)
as a standalone **RPC sidecar** (a Bun-compiled binary, bundled with the app —
no Node / npm / dev environment required). The desktop core is **Rust / Tauri**;
the product UI is **React**. Every capability Pi already has — the agent loop,
tool calling, streaming, sessions, skills, extensions, models/providers — is
reused directly over JSONL RPC.

## Highlights

- **Projects** — open a folder or Git repo; recent projects are remembered.
- **Sessions / threads** — persisted independent sessions per project; one Pi
  session runs at a time, and switching is disabled while the active run is busy.
- **Coding agent** — streaming text, collapsible reasoning blocks, tool cards,
  live bash output, cancel / retry / continue.
- **Permissions** — Codex-style allow-once / deny approval for mutating tools
  (`bash`, `write`, `edit`), with optional automatic approval for read-only tools.
- **Git & diff** — status, per-file diff review, commit; git worktrees supported.
- **Terminal** — a real PTY (Rust `portable-pty` + xterm.js) per project.
- **Model & reasoning** — provider/model picker and thinking-level control,
  backed by Pi's `ModelRuntime` (API keys and OAuth subscriptions).
- **Extension marketplace** — install Pi packages (extensions, skills, themes,
  prompts) from npm / git / local paths, with a VS Code-style registry protocol.
- **Settings** — appearance, model/API, and permission preferences. Docker
  sandbox selection is shown as unavailable until the runtime integration lands.

## Quick start

```bash
npm ci --ignore-scripts     # install deps
npm run dev                 # launch with Tauri (Rust + React)
```

Then open a folder, authenticate a provider (Settings → add an API key, or use
an existing `~/.pi/agent/auth.json` / env var such as `ANTHROPIC_API_KEY`),
create a session, and start prompting.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Tauri dev (Rust core + React HMR) |
| `npm run build` | React build + Pi sidecar + Tauri bundle |
| `npm run build:ui` | React → `poc/tauri-app/dist` |
| `npm run build:sidecar` | Bun-compile Pi sidecar |
| `npm run typecheck` | `tsc --noEmit` (frontend) |
| `npm run test` | vitest (frontend unit tests) |
| `npm run check:version` | version consistency check |
| `npm run release:check` | release gate (pre-tag) |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — capability mapping and design decisions.
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — project layout and development workflow.
- [docs/BUILD.md](docs/BUILD.md) — building, packaging, and CI.
- [docs/EXTENSION.md](docs/EXTENSION.md) — the extension marketplace and registry protocol.
- [docs/RELEASE.md](docs/RELEASE.md) — release process, signing status, smoke test.
- [docs/PLATFORM_SUPPORT.md](docs/PLATFORM_SUPPORT.md) — per-platform build/runtime status.
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — common issues and fixes.

## Brand & design

Lattice has its own brand. The UI reproduces Codex's *information architecture*
and interaction patterns, but no OpenAI logo, trademark, product name, or asset
is copied. Visual values are Lattice's own design tokens (see
`src/renderer/src/styles/tokens.css`), approximated from Codex's published UI,
not claimed to be OpenAI's exact values.

## License

MIT. Lattice embeds Pi, which is also MIT.
