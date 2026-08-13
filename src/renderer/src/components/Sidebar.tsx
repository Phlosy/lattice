import { useState } from "react";
import { useApp } from "../store/useApp";
import { ContextMenu, type MenuItem } from "./ContextMenu";

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

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
  const [menu, setMenu] = useState<MenuState | null>(null);

  const openSessionMenu = (e: React.MouseEvent, sessionId: string, file: string | undefined) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
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
      ],
    });
  };

  const startRename = (sessionId: string) => {
    setRenaming(sessionId);
    setRenameValue(sessions.find((s) => s.id === sessionId)?.name ?? "");
  };

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
        {projects.map((p) => (
          <div
            key={p.path}
            className={`item ${currentProject?.path === p.path ? "active" : ""}`}
            onClick={() => void openProject(p.path)}
          >
            <span className="status-dot success" />
            <span className="item-label">{p.name}</span>
            <span className="item-meta">{p.kind === "repo" ? "⑂" : "▤"}</span>
          </div>
        ))}
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
              const isActive = activeSessionId === s.id;
              return (
                <div key={s.id} onContextMenu={(e) => openSessionMenu(e, s.id, s.file)}>
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
                    <div className={`item ${isActive ? "active" : ""}`} onClick={() => void setActiveSession(s.id)}>
                      <span className={`status-dot ${isActive && running ? "running" : isActive ? "success" : ""}`} />
                      <span className="item-label">{s.name || s.id.slice(0, 8)}</span>
                      <span className="item-meta">{s.messageCount}</span>
                      <span className="item-actions">
                        <button
                          className="icon-btn"
                          data-tooltip="Rename"
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(s.id);
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

      {menu && <ContextMenu items={menu.items} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </aside>
  );
}
