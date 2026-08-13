import { useEffect, useState } from "react";
import { useApp } from "../store/useApp";
import type { ModelInfo } from "@shared/types";

export function TopBar() {
  const sessionState = useApp((s) => s.sessionState);
  const providers = useApp((s) => s.providers);
  const models = useApp((s) => s.models);
  const gitStatus = useApp((s) => s.gitStatus);
  const loadModels = useApp((s) => s.loadModels);
  const setModel = useApp((s) => s.setModel);
  const setThinkingLevel = useApp((s) => s.setThinkingLevel);
  const createTerminal = useApp((s) => s.createTerminal);
  const transcript = useApp((s) => s.transcript);
  const setView = useApp((s) => s.setView);
  const toggleGit = useApp((s) => s.toggleGit);

  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const currentModel = sessionState?.model;
  const thinking = sessionState?.thinkingLevel ?? "medium";

  return (
    <div className="topbar">
      <span style={{ fontWeight: 500 }}>{sessionState?.name || "New session"}</span>
      <div className="spacer" />

      <div className="select-wrap" style={{ position: "relative" }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setPickerOpen((v) => !v)}>
          {currentModel ? `${currentModel.name}` : "Select model"}
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
            · {thinking}
          </span>
          ▾
        </button>
        {pickerOpen && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              width: 360,
              maxHeight: 400,
              overflow: "auto",
              background: "var(--surface-2)",
              border: "1px solid var(--border-strong)",
              borderRadius: 8,
              zIndex: 50,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-muted)" }}>
              {providers.filter((p) => p.hasAuth).length} authenticated providers
            </div>
            {models.length === 0 && (
              <div className="empty" style={{ padding: 16 }}>
                No authenticated models. Add an API key in Settings.
              </div>
            )}
            {models.map((m: ModelInfo) => (
              <button
                key={`${m.provider}/${m.id}`}
                className="btn btn-ghost"
                style={{ width: "100%", justifyContent: "space-between", borderRadius: 0 }}
                onClick={() => {
                  void setModel(m.provider, m.id);
                  setPickerOpen(false);
                }}
              >
                <span>{m.name}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{m.provider}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button className="btn btn-ghost btn-icon" title="Toggle terminal" onClick={() => void createTerminal()}>
        ⌘
      </button>
      <button className="btn btn-ghost btn-icon" title="Toggle git" onClick={() => toggleGit()}>
        {gitStatus ? (gitStatus.clean ? "✓" : `⑂ ${gitStatus.files.length}`) : "⑂"}
      </button>
      <button className="btn btn-ghost btn-icon" title="Settings" onClick={() => setView("settings")}>
        ⚙
      </button>

      <div style={{ fontSize: 11, color: transcript.running ? "var(--accent)" : "var(--text-muted)" }}>
        {transcript.running ? "running…" : "idle"}
      </div>
    </div>
  );
}
