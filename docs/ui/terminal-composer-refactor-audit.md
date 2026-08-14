# Terminal & Composer Refactor — Audit

Code-grounded audit before the Terminal subsystem and Composer rebuild.

## Current problems (root causes)

1. **Terminal bottom black edge** — `node_modules/@xterm/xterm/css/xterm.css`
   sets `.xterm .xterm-viewport { background-color: #000 }` (line ~95) and
   `.xterm-helper-textarea { background: #000 }` (line ~81). `FitAddon` rounds
   to whole cell rows, so the partial row at the bottom exposes the viewport's
   hardcoded black. Nothing in our CSS overrides it.
2. **Terminal gray-white surface** — the light xterm theme background is
   `#f0f0f3` (a gray inset), so the light terminal looks like a gray page area
   instead of a clean terminal surface. VS Code/Tabby light terminals are pure
   white.
3. **Theme not a real adapter** — `XTERM_THEMES` lives inline in
   `TerminalPanel.tsx`; it is not testable and not bound to the token system.
4. **Fill chain is correct but fragile** — the flex chain
   `panel-stack → panel-body → terminal-wrap → terminal-host → .xterm` does
   carry `min-height:0`/`flex:1`, but `xterm-viewport` background (issue 1)
   makes it look unfilled at the bottom.
5. **Resize is present** — `TerminalPanel` uses `ResizeObserver → fit.fit() →
   terminalResize(cols, rows)` (Rust `pty_resize`). This is correct; keep it,
   add font-load/theme-change re-fit.
6. **Composer is a plain block** — `.composer-inner` is a transparent flex
   column sitting directly on the page; it has no distinct surface, border, or
   elevation, so it reads as "a form glued to the page".
7. **Attachment entry is image-only** — the left button is `ImagePlus` wired
   straight to an `<input type="file" accept="image/*">`; there is no
   attachment-menu abstraction to grow into file/snippet/context sources.

## Target architecture

```
Workbench
└── BottomPanel (PanelStack)
    ├── PanelTabs (Terminal | Git)
    └── TerminalPanel
        ├── TerminalTabs (instance tabs)
        └── TerminalHost (.terminal-host, theme token)
            └── XtermRenderer (xterm.js + FitAddon)
                 ↕ window.lattice.terminalInput/Resize
              PTYAdapter (Rust portable-pty: pty_spawn/write/resize/kill)
```

Layering (current reality, kept and documented):

- **PTYAdapter / session manager** = Rust `pty.rs` (`PtyState` → sessions map).
- **Renderer adapter** = `TerminalPanel.tsx` (xterm.js + FitAddon).
- **Theme adapter** = new `lib/terminal-theme.ts` (pure, testable).
- **Output buffer** = `lib/terminal-buffer.ts`.

Future (documented, not built now): multiple terminals, split, profiles,
task/agent terminal — enabled by the existing `terminals: TerminalMeta[]` +
`activeId` state shape.

## Composer target

```
ComposerShell (floating card: surface + border + radius + subtle shadow)
└── AttachmentTrigger (+)
    └── AttachmentMenu (image / file / snippet / context → extensible list)
├── AttachmentPreviewArea (chips)
├── InputArea (textarea)
└── ComposerActions (send / stop)
```

The `+` is a unified "add" entry, not an image button. Menu items map to real
behaviors today (image upload, `@file` context, code-fence snippet) and the
list is the extension point for future providers.

## Migration order

1. Extract `TerminalThemeAdapter` (`lib/terminal-theme.ts`) + tests.
2. Bind terminal surface to tokens: `--terminal-bg` dark `#0e0e12` / light
   `#ffffff`.
3. Override xterm viewport/screen backgrounds to `transparent` (kills the black
   edge); keep `.terminal-host` as the single surface.
4. Re-fit on font/theme change.
5. Rebuild Composer as a floating card with `AttachmentMenu`.

## Acceptance criteria

- No black edge at the terminal bottom.
- Light terminal is clean white; dark terminal is clean near-black; both match
  their theme and ANSI colors work.
- Terminal fills its panel; resize syncs PTY cols/rows.
- Theme change re-themes the live terminal without remount.
- Composer is a distinct floating surface; `+` opens an attachment menu with
  >1 source; send flow unchanged.
- Build + typecheck + vitest pass.
