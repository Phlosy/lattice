# Dockable Workbench — Audit & Migration

Audit before converting the fixed layout into a VS Code-style dockable
Workbench.

## Current problems (root causes)

1. **Fixed two-zone layout** — `App.tsx` hardcodes the structure:
   `Sidebar | (SessionTabs + TopBar + conversation-wrap + PanelStack + Composer)`.
   `PanelStack` was a single bottom panel hosting `Terminal | Git` tabs with a
   manual `resize-handle` and an inline `panelHeight` pixel value.
2. **No layout model** — position/orientation existed only in the DOM/component
   hierarchy; `activePanel` and `panelHeight` lived in the Zustand store as
   UI-only state, not a serializable layout tree.
3. **No drag/drop, no nested split** — Terminal/Git could not be moved;
   `togglePanel` just swapped the active tab in the fixed panel.
4. **Runtime state was already decoupled** — PTY lives in Rust `pty.rs`, the
   transcript in `useApp.transcript`, Git in `useApp.gitStatus`, and the
   terminal scrollback in `lib/terminal-buffer.ts`. This means view remounts do
   **not** destroy sessions — a key enabler for safe view moving.
5. **Two tab levels were conflated** — the Workbench "Terminal|Git" tabs and the
   Terminal's internal session tabs were visually similar.

## Docking library investigation

Compared FlexLayout, Golden Layout v2, Allotment, react-mosaic-component.

| | FlexLayout | Golden Layout v2 | Allotment |
|---|---|---|---|
| Nested split | ✅ | ✅ | ✅ |
| Tab group | ✅ | ✅ | ❌ |
| Drag/drop docking | ✅ (drop indicator) | ✅ | ❌ |
| JSON model (persist) | ✅ `fromJson/toJson` | ✅ | partial |
| React first-class | ✅ (React-only) | ⚠️ dropped React priority | ✅ |
| License / status | MIT, active | MIT | MIT |

**Selected: `flexlayout-react` (0.10.5).** React-first, serializable JSON tree,
`DockLocation` (center/left/right/top/bottom), `Actions` command layer,
maximize, and a drop indicator — everything the Workbench needs without
rewriting docking algorithms. Orientation is implicit: the root row is
vertical when `rootOrientationVertical`, and each nested row flips its parent's
orientation.

## Target architecture

```
AppShell
├── PrimarySidebar (fixed, not docked yet)
└── Workbench (main area)
    ├── DockWorkbench (FlexLayout)
    │   └── PaneGroup (tabsets) + SplitNode (rows)
    ├── WorkbenchViewRegistry (registry.tsx)
    └── workbenchCommands (openView / resetLayout)
```

```
View: ConversationView | TerminalView | GitView  (views.tsx)
TerminalView → TerminalPanel → xterm → Rust pty (state survives moves)
```

## Reusable / discarded

- Reused: `ThreadView`/`WelcomeView`/`Composer`, `TerminalPanel`, `GitPanel`
  (became view bodies unchanged).
- Discarded: `PanelStack.tsx`, `.panel-*`/`.resize-handle` CSS, store
  `activePanel`/`panelHeight`/`closePanel`/`setPanelHeight`.

## Migration plan

1. `workbench/types.ts` + `registry.tsx` — view model + registry.
2. `workbench/layout.ts` — default layout + persistence (localStorage, debounced).
3. `workbench/commands.ts` — `openView`/`resetLayout` (only mutation path).
4. `workbench/views.tsx` — Conversation/Terminal/Git views.
5. `workbench/DockWorkbench.tsx` — FlexLayout wrapper + themed via tokens.
6. `App.tsx` — replace fixed conversation+PanelStack with `DockWorkbench`.
7. Settings → "Reset workbench layout".

## Acceptance

- [x] Nested split via drag-drop docking (FlexLayout drop indicator)
- [x] Tab group (Terminal | Git), reorder + cross-pane move
- [x] Resizable sash (`splitterSize: 4`, themed)
- [x] Layout persistence (`toJson` → localStorage, debounced)
- [x] Reset layout (Settings)
- [x] Maximize tabset (built-in)
- [x] View registry (add a view = register + open)
- [x] Runtime state survives view moves (PTY in Rust, transcript/Git in store)
- [x] Build + typecheck + vitest pass
- [ ] Full E2E drag-drop automation (manual/visual only for now)
