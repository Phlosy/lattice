import { useEffect, useRef, useState } from "react";
import { useApp } from "../store/useApp";
import { useT } from "../i18n";
import type { ModelInfo } from "@shared/types";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

function groupModels(models: ModelInfo[]): Array<{ provider: string; models: ModelInfo[] }> {
  const map = new Map<string, ModelInfo[]>();
  for (const m of models) {
    const list = map.get(m.provider) ?? [];
    list.push(m);
    map.set(m.provider, list);
  }
  return [...map.entries()].map(([provider, models]) => ({ provider, models }));
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

export function TopBar() {
  const sessionState = useApp((s) => s.sessionState);
  const t = useT();
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
  const [modelQuery, setModelQuery] = useState("");

  const filteredModels = modelQuery.trim()
    ? models.filter(
        (m) =>
          m.name.toLowerCase().includes(modelQuery.toLowerCase()) ||
          m.provider.toLowerCase().includes(modelQuery.toLowerCase()) ||
          m.id.toLowerCase().includes(modelQuery.toLowerCase()),
      )
    : models;

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
        <span className="session">{sessionState?.name || t("topbar.newSession")}</span>
      </div>

      <div className="topbar-controls">
        <div ref={modelPop.ref} style={{ position: "relative" }}>
          <button className="picker-btn" onClick={() => modelPop.setOpen((v) => !v)}>
            {model ? model.name : t("topbar.selectModel")}
            <span className="chev">▾</span>
          </button>
          {modelPop.open && (
            <div className="popover" style={{ top: "100%", right: 0, marginTop: 4, width: 360 }}>
              <div className="popover-header">{t("topbar.model")}</div>
              <div className="popover-search">
                <input
                  placeholder="Search models…"
                  value={modelQuery}
                  onChange={(e) => setModelQuery(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="popover-list">
                {filteredModels.length === 0 && <div className="empty-state" style={{ padding: 16 }}>No models found.</div>}
                {groupModels(filteredModels).map((group) => (
                  <div key={group.provider}>
                    <div className="popover-group">{group.provider}</div>
                    {group.models.map((m: ModelInfo) => {
                      const selected = model?.id === m.id && model?.provider === m.provider;
                      return (
                        <button
                          key={`${m.provider}/${m.id}`}
                          className={`popover-item ${selected ? "selected" : ""}`}
                          onClick={() => {
                            void setModel(m.provider, m.id);
                            modelPop.setOpen(false);
                          }}
                        >
                          <span className={m.available === false ? "dimmed" : ""}>{m.name}</span>
                          {m.available === false && <span className="sub">{t("settings.apiKey")}</span>}
                        </button>
                      );
                    })}
                  </div>
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

      <button className="icon-btn" data-tooltip={t("topbar.terminal")} onClick={() => void createTerminal()}>
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
