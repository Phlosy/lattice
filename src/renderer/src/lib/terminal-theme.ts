import type { ITheme } from "@xterm/xterm";
import type { AppSettings } from "@shared/types";

/**
 * TerminalThemeAdapter — maps the app theme to a complete xterm.js ITheme.
 * The background must match the `--terminal-bg` token in tokens.css so the
 * `.terminal-host` surface and the xterm canvas are always identical.
 */

const DARK: ITheme = {
  background: "#0e0e12",
  foreground: "#d5d5dc",
  cursor: "#7aa2ff",
  cursorAccent: "#0e0e12",
  selectionBackground: "rgba(122, 162, 255, 0.28)",
  black: "#16171c",
  brightBlack: "#4a4b55",
  red: "#e5484d",
  brightRed: "#ff7b72",
  green: "#46a758",
  brightGreen: "#56d364",
  yellow: "#d9a62e",
  brightYellow: "#e3b341",
  blue: "#6ea8fe",
  brightBlue: "#79c0ff",
  magenta: "#b48ead",
  brightMagenta: "#d2a8ff",
  cyan: "#5aa9c4",
  brightCyan: "#56d4dd",
  white: "#ececef",
  brightWhite: "#ffffff",
};

const LIGHT: ITheme = {
  background: "#ffffff",
  foreground: "#19191d",
  cursor: "#2f6fdc",
  cursorAccent: "#ffffff",
  selectionBackground: "rgba(47, 111, 220, 0.2)",
  black: "#e4e4e8",
  brightBlack: "#b2b2ba",
  red: "#d4373c",
  brightRed: "#c42b31",
  green: "#2f8a46",
  brightGreen: "#268a3d",
  yellow: "#a67c00",
  brightYellow: "#9a6a00",
  blue: "#2f6fdc",
  brightBlue: "#1f5cc0",
  magenta: "#9b4f9e",
  brightMagenta: "#8a3f8d",
  cyan: "#1f7a8c",
  brightCyan: "#146878",
  white: "#19191d",
  brightWhite: "#000000",
};

export function terminalThemeFor(theme: AppSettings["theme"]): ITheme {
  return theme === "light" ? LIGHT : DARK;
}
