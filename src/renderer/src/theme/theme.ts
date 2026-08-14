// Theme abstraction — the single JS entry point for anything that needs the
// current app theme or a third-party theme mapping.
//
// CSS colors live in `styles/tokens.css` (`:root` dark, `[data-theme="light"]`
// light) and are the source of truth for the DOM. This module covers the JS
// side: reactive theme access + adapters for xterm.js and FlexLayout.

import { useApp } from "../store/useApp";

export type AppTheme = "dark" | "light";

/** Reactive access to the current app theme (dark / light). */
export function useTheme(): AppTheme {
  return useApp((s) => s.settings.theme);
}

export { terminalThemeFor } from "../lib/terminal-theme";
