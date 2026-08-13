import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useApp } from "../store/useApp";

export function TerminalPanel() {
  const terminals = useApp((s) => s.terminals);
  const killTerminal = useApp((s) => s.killTerminal);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [activeId] = terminals.length > 0 ? [terminals[terminals.length - 1].id] : [null];

  useEffect(() => {
    if (!containerRef.current || !activeId) return;
    const term = new Terminal({
      fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
      fontSize: 12,
      theme: {
        background: "#0f1014",
        foreground: "#e6e6ea",
        cursor: "#5b9dff",
      },
      cursorBlink: true,
      scrollback: 4000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

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

  if (terminals.length === 0) return null;

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Terminal</span>
        <div className="spacer" />
        <button className="btn btn-ghost btn-icon" onClick={() => activeId && void killTerminal(activeId)}>
          ✕
        </button>
      </div>
      <div className="panel-body" ref={containerRef} style={{ padding: 8 }} />
    </div>
  );
}
