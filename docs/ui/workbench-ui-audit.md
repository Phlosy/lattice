# Workbench UI Audit & Redesign

Code-grounded audit of the Lattice desktop Workbench, produced before
implementation. Answers the "why" behind duplicate selectors, terminal black
bars, inconsistent theme, loose Git density, and mixed icon semantics.

## 1. Current problems (observed, mapped to code)

1. **Duplicate model selector** — `ModelPicker` is rendered in three places:
   - `TopBar` (header, `variant="picker"`)
   - `Sidebar` footer badge (`variant="badge"`)
   - `Composer` textarea placeholder `composer.placeholderNoModel` ("请先选择模型")
     which disables the whole input box when no model is selected
     (`disabled = !sessionState?.model` in `Composer.tsx`).
2. **Thinking level is hardcoded** — `TopBar.tsx` declares
   `THINKING_LEVELS = ["off","low","medium","high"]` and never derives it from
   model capability. Default "medium" is a fallback in
   `normalizeSessionState` (`thinkingLevel ?? "medium"`), not a real capability.
3. **Terminal black bars / non-fill** — `.terminal-host` has
   `padding: var(--sp-2)` + `background: var(--surface-inset)`, while the
   xterm theme background was historically a different hardcoded hex. The
   padding ring reads as a border; the `.xterm { height: 100% }` only fills
   inside the padding, leaving a visible inset.
4. **Terminal double border** — `panel-stack` (border-top) → `panel-tabs`
   (border-bottom) → `terminal-wrap` → `terminal-tabs` (border-bottom) →
   `terminal-host` (padded bg). Four stacked separators around one terminal.
5. **Git commit bar is a third column** — `GitPanel.tsx` renders
   `git-commit-bar` as a direct sibling of `git-files` and `git-diff` inside
   `.git-panel { display: flex }` (row). The commit bar becomes a narrow third
   column instead of a full-width footer.
6. **Git density loose** — Git file rows reuse `.item` (sidebar density:
   `padding: 6px 8px`, `font-size: 13px`, sans font) instead of a compact
   monospace source-control row (~24px).
7. **Mixed icon system** — Unicode glyphs (`▤ ⧉ ⚙ ⌘ ✎ 🗑 ▶ ◀ ✕ ＋ ⑂ 🔒 ▾ ▸`),
   emoji, inline SVG, and `lucide-react` (added for the Composer only) coexist.
8. **Light/dark partial** — most surfaces use `tokens.css` variables, but the
   terminal was hardcoded dark until recently; a few inline styles remain.

## 2. Root causes

- **No Workbench primitives** — `PanelStack`/`TerminalPanel`/`GitPanel`/`TopBar`
  each own their layout and separator CSS. There is no `Panel`/`Tab`/`Toolbar`
  primitive enforcing one hierarchy.
- **Terminal theme not a real adapter** — theme was a literal in
  `TerminalPanel`, disconnected from the token system.
- **Model capability not surfaced** — Pi returns `thinkingLevelMap` per model,
  but `ModelInfo` (TS) and the Rust `get_models` bridge drop it; the UI only
  sees `reasoning: boolean`.
- **Thinking selector state vs plumbing** — the RPC chain
  `set_thinking_level` → Pi already exists; what's missing is capability-driven
  options and confidence that the value persists (session-level).
- **Git rows reuse the sidebar `.item`** — convenient but wrong density.

## 3. Target architecture

```
Design Token (tokens.css)
      ↓
Workbench Primitives (Panel / Tab / Toolbar / IconButton)
      ↓
Header · Sidebar · Bottom Panel · Terminal · Git · Chat
```

```
Model Capability (thinkingLevelMap → ModelInfo)
      ↓
Session Configuration (thinkingLevel)
      ↓
Model + Thinking Controls (header)
      ↓
Runtime Adapter (lattice-tauri → invoke)
      ↓
Provider (Pi RPC set_thinking_level)
```

## 4. Theme architecture

- `tokens.css` **is** the single source of truth (`:root` dark,
  `:root[data-theme="light"]`). Extend, don't fork.
- Add terminal semantic aliases: `--terminal-bg`, `--terminal-fg` mapping to
  `--surface-inset` / `--text-primary`, so `TerminalPanel` consumes tokens
  rather than hex.
- `AppTheme → TerminalThemeAdapter → xterm.options.theme`: the adapter already
  exists (`XTERM_THEMES` in `TerminalPanel.tsx`); keep it, keep ANSI palette.

## 5. Layout architecture

- Workbench = `Sidebar | Main`. Main = `SessionTabs · TopBar · conversation ·
  PanelStack`. `PanelStack` is the only bottom panel, hosting `Terminal`/`Git`
  as panel instances with **one** tab row.
- Terminal: `PanelStack → panel-body → TerminalPanel → .terminal-host → .xterm`
  with `min-height:0` at every flex level and **no padding** on the host.
- Git: `git-panel` column; `git-main` (files + diff) row; commit bar full-width
  footer.

## 6. Terminal architecture

- Fill: `.terminal-host { flex:1; min-height:0; padding:0; overflow:hidden }`,
  `.xterm { height:100%; width:100% }`.
- Resize: keep `ResizeObserver` on `.terminal-host` → `fit.fit()` →
  `terminalResize(cols, rows)` (already present in `TerminalPanel.tsx`); ensure
  it also runs on font load and theme change.
- Font: `fontFamily` fallback chain including Nerd Font families before system
  monospace: `"MesloLGS NF", "FiraCode Nerd Font", "JetBrains Mono",
  "Cascadia Code", "SF Mono", ui-monospace, Menlo, Consolas, monospace`. No
  bundled webfont (license + size); rely on user-installed Nerd Fonts with sane
  fallback.
- Theme: `XTERM_THEMES` (dark + light), full ANSI palette, live update via
  `term.options.theme = { ...next }` (new object identity).

## 7. Icon strategy

- **Single primary family: `lucide-react`** (MIT, tree-shakeable, consistent
  1.75–2 stroke, good dev-tool coverage). Replace Unicode/emoji glyphs.
- Mapping (documented, enforced):
  | Action | Icon |
  |---|---|
  | New project | `FolderPlus` |
  | Open folder | `FolderOpen` |
  | New session | `SquarePlus` / `Plus` |
  | Terminal | `SquareTerminal` / `Terminal` |
  | Git | `GitBranch` |
  | Commit | `GitCommitHorizontal` |
  | Settings | `Settings` |
  | Extensions | `Blocks` / `Puzzle` |
  | Close | `X` |
  | Chevron | `ChevronDown` / `ChevronRight` |
  | Attach image | `ImagePlus` |
  | Send | `ArrowUp` |
  | Stop | `Square` |
  | Thinking | `Sparkles` / `Brain` |
- Every icon-only button keeps `data-tooltip`.

## 8. Model / Thinking controls

- **One** model selector: header (`TopBar`). Remove the sidebar badge and the
  composer placeholder-as-gate.
- Composer stays an input surface: textarea always enabled; send disabled when
  no model (tooltip), not a full "请先选择模型" block.
- Thinking selector derives options from `sessionState.model.thinkingLevels`
  (new `ModelInfo.thinkingLevels?: string[]`, populated from Pi's
  `thinkingLevelMap`); falls back to `low/medium/high`. Hidden/disabled + tooltip
  when `model.reasoning === false`.
- Persistence: session-level via Pi `set_thinking_level` (already plumbed);
  `normalizeSessionState` keeps the persisted value and only falls back to
  "medium" when absent.

## 9. Git density

- `git-main` row (files 240px + diff flex), commit bar full-width footer.
- File rows: `~26px`, monospace filename, `8px` horizontal padding, status badge
  + filename left, diff-stat/actions right, no full-width stretch.

## 10. Migration plan (phases)

1. Tokens: add terminal aliases.
2. Primitives: `Icon` helper + `IconButton` (thin wrapper over `.icon-btn`).
3. Layout: `PanelStack` single tab row; Git column fix.
4. Terminal: fill + font + theme adapter + scrollbar.
5. Chat controls: model consolidation + thinking capability.
6. Icons: swap Unicode → lucide in Sidebar/TopBar/PanelStack/GitPanel/ThreadView.
7. Polish: hover/active/focus, density.
8. Tests.

## 11. Acceptance criteria

- No "请先选择模型" block in composer; single model selector in header.
- Thinking selector options are capability-driven and actually persist.
- Git is a compact two-pane + footer (no third column).
- Terminal fills its panel with no padding ring or double borders.
- Terminal light/dark follows the app with full ANSI palette.
- Nerd Font glyph fallback chain present; no bundled webfont.
- Single icon family (lucide); all icon buttons have tooltips.
- No hardcoded theme hex outside `tokens.css` + `XTERM_THEMES`.
- Build + typecheck + vitest + Rust tests pass.
