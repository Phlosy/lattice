import { useState } from "react";
import { useApp } from "../store/useApp";
import { useContextMenu } from "./ContextMenu";

export function Sidebar() {
  const projects = useApp((s) => s.projects);
  const currentProject = useApp((s) => s.currentProject);
  const sessions = useApp((s) => s.sessions);
  const activeSessionId = useApp((s) => s.activeSessionId);
  const running = useApp((s) => s.transcript.running);
  const openProject = useApp((s) => s.openProject);
  const createSession = useApp((s) => s.createSession);
  const setActiveSession = useApp((s) => s.setActiveSession);
  const renameSession = useApp((s) => s.renameSession);
  const deleteSession = useApp((s) => s.deleteSession);
  const setView = useApp((s) => s.setView);

  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const sessionMenu = (sessionId: string, file: string | undefined) =>
    useContextMenu([
      {
        label: "Rename",
        onClick: () => {
          setRenaming(sessionId);
          setRenameValue(sessions.find((s) => s.id === sessionId)?.name ?? "");
        },
      },
      { separator: true },
      {
        label: "Delete",
        danger: true,
        onClick: () => {
          if (file) void deleteSession(file);
        },
      },
    ]);

  const projectMenu = (path: string) =>
    useContextMenu([{ label: "Remove from recents", onClick: () => void 0 }]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="brand">
          <span className="brand-mark">Λ</span>
          Lattice
        </span>
        <button className="icon-btn" data-tooltip="New session" onClick={() => void createSession()}>
          ＋
        </button>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">
          Projects
          <button className="icon-btn" data-tooltip="Open folder" onClick={() => void openProject()}>
            ▤
          </button>
        </div>
        {projects.length === 0 && (
          <div className="empty-state" style={{ padding: 16, gap: 8 }}>
            <p>No projects yet.</p>
            <button className="btn btn-sm" onClick={() => void openProject()}>
              Open folder
            </button>
          </div>
        )}
        {projects.map((p) => {
          const menu = projectMenu(p.path);
          return (
            <div key={p.path} onContextMenu={menu.open}>
              <div
                className={`item ${currentProject?.path === p.path ? "active" : ""}`}
                onClick={() => void openProject(p.path)}
              >
                <span className="status-dot success" />
                <span className="item-label">{p.name}</span>
                <span className="item-meta">{p.kind === "repo" ? "⑂" : "▤"}</span>
              </div>
              {menu.menu}
            </div>
          );
        })}
      </div>

      {currentProject && (
        <div className="sidebar-section grow">
          <div className="sidebar-section-title">
            Sessions
            <button className="icon-btn" data-tooltip="New session" onClick={() => void createSession()}>
              ＋
            </button>
          </div>
          <div className="sidebar-list">
            {sessions.map((s) => {
              const menu = sessionMenu(s.id, s.file);
              const isActive = activeSessionId === s.id;
              return (
                <div key={s.id} onContextMenu={menu.open}>
                  {renaming === s.id ? (
                    <input
                      className="rename-input"
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => {
                        if (renameValue.trim()) void renameSession(s.id, renameValue.trim());
                        setRenaming(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (renameValue.trim()) void renameSession(s.id, renameValue.trim());
                          setRenaming(null);
                        } else if (e.key === "Escape") {
                          setRenaming(null);
                        }
                      }}
                    />
                  ) : (
                    <div
                      className={`item ${isActive ? "active" : ""}`}
                      onClick={() => void setActiveSession(s.id)}
                    >
                      <span
                        className={`status-dot ${isActive && running ? "running" : isActive ? "success" : ""}`}
                      />
                      <span className="item-label">{s.name || s.id.slice(0, 8)}</span>
                      <span className="item-meta">{s.messageCount}</span>
                      <span className="item-actions">
                        <button
                          className="icon-btn"
                          data-tooltip="Rename"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenaming(s.id);
                            setRenameValue(s.name ?? "");
                          }}
                        >
                          ✎
                        </button>
                        <button
                          className="icon-btn"
                          data-tooltip="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (s.file) void deleteSession(s.file);
                          }}
                        >
                          🗑
                        </button>
                      </span>
                    </div>
                  )}
                  {menu.menu}
                </div>
              );
            })}
            {sessions.length === 0 && (
              <div className="empty-state" style={{ padding: 16, gap: 8 }}>
                <p>No sessions.</p>
                <button className="btn btn-sm" onClick={() => void createSession()}>
                  New session
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        <button className="icon-btn" data-tooltip="Extensions" onClick={() => setView("extensions")}>
          ⧉
        </button>
        <button className="icon-btn" data-tooltip="Settings" onClick={() => setView("settings")}>
          ⚙
        </button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" onClick={() => void createSession()} disabled={!currentProject}>
          ＋ New
        </button>
      </div>
    </aside>
  );
}
