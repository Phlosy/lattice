# Lattice

> A cross-platform desktop coding agent. Codex-like UX, powered by the **Pi** runtime.

Lattice is a macOS / Windows / Linux desktop app that puts a full coding-agent
workflow in a GUI: open a folder or Git repository, create independent coding
sessions, prompt a local agent, watch it reason and call tools, review diffs,
and commit — all with a clean, keyboard-friendly interface benchmarked against
OpenAI's Codex Desktop (but with its own brand and design system).

Under the hood, Lattice **does not reimplement the agent runtime**. It embeds
[Pi](https://github.com/earendil-works/pi) (`@earendil-works/pi-coding-agent`)
through a thin `RuntimeAdapter`, so every capability Pi already has — the agent
loop, tool calling, streaming, sessions, skills, prompt templates, extensions,
models/providers — is reused directly.

## Highlights

- **Projects** — open a folder or Git repo; recent projects are remembered.
- **Sessions / threads** — many independent sessions per project, run in parallel.
- **Coding agent** — streaming text, collapsible reasoning blocks, tool cards,
  live bash output, cancel / retry / continue.
- **Permissions** — Codex-style approval for mutating tools (`bash`, `write`,
  `edit`), with per-project "always allow" / "deny" decisions.
- **Git & diff** — status, per-file diff review, commit; git worktrees supported.
- **Terminal** — a real PTY (node-pty + xterm.js) per project.
- **Model & reasoning** — provider/model picker and thinking-level control,
  backed by Pi's `ModelRuntime` (API keys and OAuth subscriptions).
- **Extension marketplace** — install Pi packages (extensions, skills, themes,
  prompts) from npm / git / local paths, with a VS Code-style registry protocol.
- **Settings** — appearance, model/API, permissions, sandbox; Pi's own settings
  are delegated to `~/.pi/agent/settings.json` (no duplicate config).

## Quick start

```bash
npm install                 # installs deps + rebuilds node-pty for Electron
npm run dev                 # launch with HMR
```

Then open a folder, authenticate a provider (Settings → add an API key, or use
an existing `~/.pi/agent/auth.json` / env var such as `ANTHROPIC_API_KEY`),
create a session, and start prompting.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | electron-vite dev (renderer HMR) |
| `npm run build` | typecheck + build main/preload/renderer |
| `npm run typecheck` | `tsc --noEmit` for node + web |
| `npm run test` | vitest (unit + integration + E2E) |
| `npm run package:mac` | build + `.dmg` / `.app` |
| `npm run package:win` | build + NSIS `.exe` |
| `npm run package:linux` | build + `.AppImage` / `.deb` |
| `npm run rebuild` | rebuild native modules for Electron |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — capability mapping and design decisions.
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — project layout and development workflow.
- [docs/BUILD.md](docs/BUILD.md) — building, packaging, and CI.
- [docs/EXTENSION.md](docs/EXTENSION.md) — the extension marketplace and registry protocol.

## Brand & design

Lattice has its own brand. The UI reproduces Codex's *information architecture*
and interaction patterns, but no OpenAI logo, trademark, product name, or asset
is copied. Visual values are Lattice's own design tokens (see
`src/renderer/src/styles/tokens.css`), approximated from Codex's published UI,
not claimed to be OpenAI's exact values.

## License

MIT. Lattice embeds Pi, which is also MIT.
