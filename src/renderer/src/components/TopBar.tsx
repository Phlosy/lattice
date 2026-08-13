import { useEffect, useRef, useState } from "react";
import { useApp } from "../store/useApp";
import type { ModelInfo } from "@shared/types";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

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

export function TopBar() {
  const sessionState = useApp((s) => s.sessionState);
  const currentProject = useApp((s) => s.currentProject);
  const models = useApp((s) => s.models);
  const gitStatus = useApp((s) => s.gitStatus);
  const running = useApp((s) => s.transcript.running);
  const activePanel = useApp((s) => s.activePanel);
  const loadModels = useApp((s) => s.loadModels);
  const setModel = useApp((s) => s.setModel);
  const setThinkingLevel = useApp((s) => s.setThinkingLevel);
  const createTerminal = useApp((s) => s.createTerminal);
  const togglePanel = useApp((s) => s.togglePanel);
  const setView = useApp((s) => s.setView);

  const modelPop = usePopover();
  const thinkPop = usePopover();

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const model = sessionState?.model;
  const thinking = sessionState?.thinkingLevel ?? "medium";

  return (
    <div className="topbar">
      <div className="topbar-context">
        {currentProject && (
          <>
            <span className="project">{currentProject.name}</span>
            <span className="sep">/</span>
          </>
        )}
        <span className="session">{sessionState?.name || "New session"}</span>
      </div>

      <div className="topbar-controls">
        <div ref={modelPop.ref} style={{ position: "relative" }}>
          <button className="picker-btn" onClick={() => modelPop.setOpen((v) => !v)}>
            {model ? model.name : "Select model"}
            <span className="chev">▾</span>
          </button>
          {modelPop.open && (
            <div className="popover" style={{ top: "100%", right: 0, marginTop: 4, width: 340 }}>
              <div className="popover-header">Model</div>
              <div className="popover-list">
                {models.length === 0 && <div className="empty-state" style={{ padding: 16 }}>No models. Add a key in Settings.</div>}
                {models.map((m: ModelInfo) => (
                  <button
                    key={`${m.provider}/${m.id}`}
                    className={`popover-item ${model?.id === m.id && model?.provider === m.provider ? "selected" : ""}`}
                    onClick={() => {
                      void setModel(m.provider, m.id);
                      modelPop.setOpen(false);
                    }}
                  >
                    <span>{m.name}</span>
                    <span className="sub">{m.provider}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div ref={thinkPop.ref} style={{ position: "relative" }}>
          <button className="picker-btn" onClick={() => thinkPop.setOpen((v) => !v)}>
            {thinking}
            <span className="chev">▾</span>
          </button>
          {thinkPop.open && (
            <div className="popover" style={{ top: "100%", right: 0, marginTop: 4, width: 180 }}>
              <div className="popover-header">Reasoning</div>
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
        {running ? "Working" : "Idle"}
      </div>

      <button className="icon-btn" data-tooltip="Terminal" onClick={() => void createTerminal()}>
        ⌘
      </button>
      <button
        className={`icon-btn ${activePanel === "git" ? "active" : ""}`}
        data-tooltip="Git"
        onClick={() => togglePanel("git")}
      >
        {gitStatus && !gitStatus.clean ? `⑂${gitStatus.files.length}` : "⑂"}
      </button>
      <button className="icon-btn" data-tooltip="Settings" onClick={() => setView("settings")}>
        ⚙
      </button>
    </div>
  );
}
