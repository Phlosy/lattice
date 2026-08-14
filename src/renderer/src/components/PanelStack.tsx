import { useCallback, useRef } from "react";
import { X } from "lucide-react";
import { useApp, type PanelKind } from "../store/useApp";
import { useT } from "../i18n";
import { TerminalPanel } from "./TerminalPanel";
import { GitPanel } from "./GitPanel";

function PanelTab({ kind, label, count }: { kind: PanelKind; label: string; count?: number }) {
  const active = useApp((s) => s.activePanel);
  const toggle = useApp((s) => s.togglePanel);
  return (
    <div
      className={`panel-tab ${active === kind ? "active" : ""}`}
      onClick={() => toggle(kind)}
      role="tab"
    >
      {label}
      {count !== undefined && count > 0 && <span className="count">{count}</span>}
    </div>
  );
}

export function PanelStack() {
  const t = useT();
  const activePanel = useApp((s) => s.activePanel);
  const panelHeight = useApp((s) => s.panelHeight);
  const setPanelHeight = useApp((s) => s.setPanelHeight);
  const closePanel = useApp((s) => s.closePanel);
  const terminals = useApp((s) => s.terminals);
  const gitStatus = useApp((s) => s.gitStatus);

  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startY.current = e.clientY;
      startH.current = panelHeight;
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        setPanelHeight(startH.current + (startY.current - ev.clientY));
      };
      const onUp = () => {
        dragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [panelHeight, setPanelHeight],
  );

  if (!activePanel) return null;

  const changedFiles = gitStatus?.files.length ?? 0;

  return (
    <div className="panel-stack" style={{ height: panelHeight }}>
      <div className="resize-handle" onMouseDown={onMouseDown} />
      <div className="panel-tabs">
        <PanelTab kind="terminal" label={t("term.panel")} />
        <PanelTab kind="git" label={t("topbar.git")} count={changedFiles} />
        <div className="spacer" />
        <button className="icon-btn" onClick={closePanel} data-tooltip="Close panel">
          <X size={15} />
        </button>
      </div>
      <div className="panel-body">
        {activePanel === "terminal" ? <TerminalPanel /> : <GitPanel />}
      </div>
    </div>
  );
}
