import { useEffect, useRef, useState } from "react";
import { useApp } from "../store/useApp";
import { useT } from "../i18n";
import { ModelPicker } from "./ModelPicker";

// Common denominator supported by current reasoning providers. Provider-only
// levels (for example xhigh/max) stay hidden until the API exposes Pi's
// get_available_thinking_levels response.
const THINKING_LEVELS = ["off", "low", "medium", "high"] as const;

export function TopBar({ onMenu }: { onMenu?: () => void }) {
  const sessionState = useApp((s) => s.sessionState);
  const t = useT();
  const currentProject = useApp((s) => s.currentProject);
  const gitStatus = useApp((s) => s.gitStatus);
  const running = useApp((s) => s.transcript.running);
  const setThinkingLevel = useApp((s) => s.setThinkingLevel);
  const createTerminal = useApp((s) => s.createTerminal);
  const togglePanel = useApp((s) => s.togglePanel);
  const setView = useApp((s) => s.setView);

  const thinkPop = usePopover();
  const thinking = sessionState?.thinkingLevel ?? "medium";

  return (
    <div className="topbar">
      {onMenu && (
        <button className="icon-btn topbar-menu" onClick={onMenu} aria-label="Menu">
          ☰
        </button>
      )}
      <div className="topbar-context">
        {currentProject && (
          <>
            <span className="project">{currentProject.name}</span>
            <span className="sep">/</span>
          </>
        )}
        <span className="session">{sessionState?.name || t("topbar.newSession")}</span>
      </div>

      <div className="topbar-controls">
        <ModelPicker />

        <div ref={thinkPop.ref} style={{ position: "relative" }}>
          <button
            className="picker-btn"
            disabled={!sessionState?.model?.reasoning}
            onClick={() => thinkPop.setOpen((v) => !v)}
          >
            {thinking}
            <span className="chev">▾</span>
          </button>
          {thinkPop.open && (
            <div className="popover" style={{ top: "100%", right: 0, marginTop: 4, width: 180 }}>
              <div className="popover-header">{t("topbar.reasoning")}</div>
              <div className="popover-list">
                {THINKING_LEVELS.map((level) => (
                  <button
                    key={level}
                    className={`popover-item ${thinking === level ? "selected" : ""}`}
                    onClick={() => {
                      void setThinkingLevel(level);
                      thinkPop.setOpen(false);
                    }}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="topbar-status">
        <span className={`status-dot ${running ? "running" : ""}`} />
        {running ? t("topbar.working") : t("topbar.idle")}
      </div>

      <button
        className="icon-btn"
        data-tooltip={t("topbar.terminal")}
        disabled={!currentProject}
        onClick={() => void createTerminal()}
      >
        ⌘
      </button>
      {gitStatus && (
        <button
          className={`git-status ${!gitStatus.clean ? "dirty" : ""}`}
          data-tooltip={t("topbar.git")}
          onClick={() => togglePanel("git")}
        >
          <span className="git-branch">{gitStatus.branch}</span>
          {!gitStatus.clean && <span className="git-changes">{gitStatus.files.length}</span>}
        </button>
      )}
      <button className="icon-btn" data-tooltip={t("sidebar.settings")} onClick={() => setView("settings")}>
        ⚙
      </button>
    </div>
  );
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}
