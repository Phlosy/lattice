import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useApp } from "../store/useApp";
import { useT } from "../i18n";
import { getTerminalBuffer } from "../lib/terminal-buffer";

// xterm.js color themes matching the app's design tokens (dark + light).
const XTERM_THEMES = {
  dark: {
    background: "#0e0e12",
    foreground: "#d5d5dc",
    cursor: "#7aa2ff",
    cursorAccent: "#0e0e12",
    selectionBackground: "rgba(122, 162, 255, 0.28)",
    black: "#16171c",
    brightBlack: "#4a4b55",
    red: "#e5484d",
    green: "#46a758",
    yellow: "#d9a62e",
    blue: "#6ea8fe",
    magenta: "#b48ead",
    cyan: "#5aa9c4",
    white: "#ececef",
    brightWhite: "#ffffff",
  },
  light: {
    background: "#ffffff",
    foreground: "#19191d",
    cursor: "#2f6fdc",
    cursorAccent: "#ffffff",
    selectionBackground: "rgba(47, 111, 220, 0.2)",
    black: "#e4e4e8",
    brightBlack: "#b2b2ba",
    red: "#d4373c",
    green: "#2f8a46",
    yellow: "#a67c00",
    blue: "#2f6fdc",
    magenta: "#9b4f9e",
    cyan: "#1f7a8c",
    white: "#19191d",
    brightWhite: "#000000",
  },
} as const;

export function TerminalPanel() {
  const t = useT();
  const terminals = useApp((s) => s.terminals);
  const killTerminal = useApp((s) => s.killTerminal);
  const theme = useApp((s) => s.settings.theme);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Keep a stable active terminal id.
  useEffect(() => {
    if (terminals.length > 0 && (!activeId || !terminals.some((t) => t.id === activeId))) {
      setActiveId(terminals[terminals.length - 1].id);
    }
  }, [terminals, activeId]);

  useEffect(() => {
    if (!containerRef.current || !activeId) return;
    const term = new Terminal({
      fontFamily: "'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
      fontSize: 12,
      fontWeight: "300",
      lineHeight: 1.5,
      letterSpacing: 0,
      cursorStyle: "bar",
      cursorBlink: true,
      cursorWidth: 1,
      theme: XTERM_THEMES[theme],
      scrollback: 4000,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;
    const history = getTerminalBuffer(activeId);
    if (history) term.write(history);

    const onData = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string; data: string };
      if (detail.id === activeId) term.write(detail.data);
    };
    window.addEventListener("lattice-term-data", onData);

    const inputListener = term.onData((data) => {
      window.lattice.terminalInput(activeId, data);
    });
    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
        window.lattice.terminalResize(activeId, term.cols, term.rows);
      } catch {
        /* ignore */
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      window.removeEventListener("lattice-term-data", onData);
      inputListener.dispose();
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, [activeId]);

  // Re-theme the live terminal without recreating it (xterm needs a new
  // theme object identity to repaint).
  useEffect(() => {
    const term = termRef.current;
    if (term) term.options.theme = { ...XTERM_THEMES[theme] };
  }, [theme]);

  if (terminals.length === 0) {
    return (
      <div className="empty-state" style={{ flex: 1 }}>
        <div className="icon">⌘</div>
        <p>{t("term.noTerminal")}</p>
      </div>
    );
  }

  return (
    <div className="terminal-wrap">
      <div className="terminal-tabs">
        {terminals.map((terminal) => (
          <button
            key={terminal.id}
            className={`terminal-tab ${terminal.id === activeId ? "active" : ""}`}
            onClick={() => setActiveId(terminal.id)}
          >
            {terminal.title || terminal.id}
            <span
              className="term-close"
              onClick={(event) => {
                event.stopPropagation();
                void killTerminal(terminal.id);
              }}
            >
              ✕
            </span>
          </button>
        ))}
      </div>
      <div className="terminal-host" ref={containerRef} />
    </div>
  );
}
