import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useApp } from "../store/useApp";
import { useT } from "../i18n";
import { getTerminalBuffer } from "../lib/terminal-buffer";
import { useTheme, terminalThemeFor } from "../theme/theme";

export function TerminalPanel() {
  const t = useT();
  const terminals = useApp((s) => s.terminals);
  const killTerminal = useApp((s) => s.killTerminal);
  const theme = useTheme();
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
      fontFamily:
        "'MesloLGS NF', 'FiraCode Nerd Font', 'JetBrains Mono', 'Cascadia Code', 'SF Mono', ui-monospace, Menlo, Consolas, monospace",
      fontSize: 12,
      fontWeight: "300",
      lineHeight: 1.5,
      letterSpacing: 0,
      cursorStyle: "bar",
      cursorBlink: true,
      cursorWidth: 1,
      theme: terminalThemeFor(theme),
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

  useEffect(() => {
    const term = termRef.current;
    if (term) {
      // New object identity is required for xterm to repaint.
      term.options.theme = { ...terminalThemeFor(theme) };
      try {
        fitRef.current?.fit();
      } catch {
        /* ignore */
      }
    }
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
