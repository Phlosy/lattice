import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useApp } from "../store/useApp";
import { useT } from "../i18n";
import { getTerminalBuffer } from "../lib/terminal-buffer";
import { useTheme, terminalThemeFor } from "../theme/theme";

function basename(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

/**
 * Renders a single PTY. In dedicated mode (a workbench tab bound to one
 * terminal id) it shows just that terminal; in legacy mode (no id) it shows
 * the multi-PTY tab strip and binds to the most recent terminal.
 */
export function TerminalPanel({ terminalId }: { terminalId?: string }) {
  const t = useT();
  const terminals = useApp((s) => s.terminals);
  const killTerminal = useApp((s) => s.killTerminal);
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  // Legacy mode (no id): keep a stable active terminal id across re-renders.
  const [fallbackId, setFallbackId] = useState<string | null>(null);
  useEffect(() => {
    if (terminalId) return;
    if (terminals.length > 0 && (!fallbackId || !terminals.some((t) => t.id === fallbackId))) {
      setFallbackId(terminals[terminals.length - 1].id);
    }
  }, [terminals, terminalId, fallbackId]);

  const activeId = terminalId ?? fallbackId;
  const active = terminals.find((t) => t.id === activeId);

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

  if (!active) {
    return (
      <div className="empty-state" style={{ flex: 1 }}>
        <div className="icon">⌘</div>
        <p>{t("term.noTerminal")}</p>
      </div>
    );
  }

  return (
    <div className="terminal-wrap">
      {!terminalId && terminals.length > 1 && (
        <div className="terminal-tabs">
          {terminals.map((terminal) => (
            <button
              key={terminal.id}
              className={`terminal-tab ${terminal.id === activeId ? "active" : ""}`}
              onClick={() => setFallbackId(terminal.id)}
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
      )}
      {terminalId && (
        <div className="terminal-single-head">
          <span className="terminal-single-title">{basename(active.cwd) || "terminal"}</span>
          <button
            className="icon-btn"
            data-tooltip={t("term.close")}
            onClick={() => void killTerminal(active.id)}
          >
            ✕
          </button>
        </div>
      )}
      <div className="terminal-host" ref={containerRef} />
    </div>
  );
}
