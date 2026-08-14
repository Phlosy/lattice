import { describe, expect, it } from "vitest";
import { terminalThemeFor } from "../src/renderer/src/lib/terminal-theme";

describe("terminalThemeFor (AppTheme → xterm ITheme)", () => {
  it("maps dark to a clean near-black terminal surface", () => {
    const theme = terminalThemeFor("dark");
    expect(theme.background).toBe("#0e0e12");
    expect(theme.foreground).toBeTruthy();
    expect(theme.cursor).toBeTruthy();
    expect(theme.selectionBackground).toBeTruthy();
  });

  it("maps light to a clean white terminal surface", () => {
    const theme = terminalThemeFor("light");
    expect(theme.background).toBe("#ffffff");
    expect(theme.foreground).toBe("#19191d");
  });

  it("always provides a full ANSI palette", () => {
    for (const mode of ["dark", "light"] as const) {
      const theme = terminalThemeFor(mode);
      for (const key of [
        "black",
        "red",
        "green",
        "yellow",
        "blue",
        "magenta",
        "cyan",
        "white",
        "brightBlack",
        "brightRed",
        "brightGreen",
        "brightYellow",
        "brightBlue",
        "brightMagenta",
        "brightCyan",
        "brightWhite",
      ]) {
        expect(theme[key as keyof typeof theme], `${mode}.${key}`).toBeTruthy();
      }
    }
  });
});
