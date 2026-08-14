import { useState } from "react";
import { useApp } from "../store/useApp";
import { useT } from "../i18n";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { ModelPicker } from "./ModelPicker";

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

export function Sidebar() {
  const t = useT();
  const projects = useApp((s) => s.projects);
  const currentProject = useApp((s) => s.currentProject);
  const sessions = useApp((s) => s.sessions);
  const activeSessionId = useApp((s) => s.activeSessionId);
  const running = useApp((s) => s.transcript.running);
  const collapsed = useApp((s) => s.sidebarCollapsed);
  const openProject = useApp((s) => s.openProject);
  const removeProject = useApp((s) => s.removeProject);
  const createSession = useApp((s) => s.createSession);
  const openSession = useApp((s) => s.openSession);
  const renameSession = useApp((s) => s.renameSession);
  const deleteSession = useApp((s) => s.deleteSession);
  const setView = useApp((s) => s.setView);
  const toggleSidebar = useApp((s) => s.toggleSidebar);

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
          label: t("sidebar.rename"),
          onClick: () => {
            setRenaming(sessionId);
            setRenameValue(sessions.find((s) => s.id === sessionId)?.name ?? "");
          },
        },
        { separator: true },
        {
          label: t("sidebar.delete"),
          danger: true,
          onClick: () => {
            if (file) void deleteSession(file);
          },
        },
      ],
    });
  };

  const openProjectMenu = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: t("sidebar.open"), onClick: () => void openProject(path) },
        { separator: true },
        { label: t("sidebar.removeRecents"), danger: true, onClick: () => void removeProject(path) },
      ],
    });
  };

  const startRename = (sessionId: string) => {
    setRenaming(sessionId);
    setRenameValue(sessions.find((s) => s.id === sessionId)?.name ?? "");
  };

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        {!collapsed && (
          <span className="brand">
            <span className="brand-mark">Λ</span>
            Lattice
          </span>
        )}
        <button className="icon-btn" data-tooltip={collapsed ? "Expand" : "Collapse"} onClick={() => toggleSidebar()}>
          {collapsed ? "▶" : "◀"}
        </button>
      </div>

      <div className="sidebar-section">
        {!collapsed && (
          <div className="sidebar-section-title">
            {t("sidebar.projects")}
            <button className="icon-btn" data-tooltip={t("sidebar.openFolder")} onClick={() => void openProject()}>
              ▤
            </button>
          </div>
        )}
        {!collapsed && projects.length === 0 && (
          <div className="empty-state" style={{ padding: 16, gap: 8 }}>
            <p>{t("sidebar.noProjects")}</p>
            <button className="btn btn-sm" onClick={() => void openProject()}>
              {t("sidebar.openFolder")}
            </button>
          </div>
        )}
        {projects.map((p) => (
          <div
            key={p.path}
            className={`item item-project ${currentProject?.path === p.path ? "active" : ""}`}
            onClick={() => void openProject(p.path)}
            onContextMenu={(e) => openProjectMenu(e, p.path)}
            data-tooltip={collapsed ? p.name : undefined}
          >
            <span className="status-dot success" />
            {!collapsed && (
              <>
                <div className="item-text">
                  <span className="item-label">{p.name}</span>
                  <span className="item-sub">{p.path}</span>
                </div>
                <span className="item-meta">{p.kind === "repo" ? "⑂" : "▤"}</span>
              </>
            )}
          </div>
        ))}
      </div>

      {currentProject && (
        <div className="sidebar-section grow">
          {!collapsed && (
            <div className="sidebar-section-title">
              {t("sidebar.sessions")}
              <button
                className="icon-btn"
                data-tooltip={t("sidebar.newSession")}
                disabled={running}
                onClick={() => void createSession()}
              >
                ＋
              </button>
            </div>
          )}
          <div className="sidebar-list">
            {sessions.map((s) => {
              const isActive = activeSessionId === s.id;
              return (
                <div key={s.id} onContextMenu={(e) => openSessionMenu(e, s.id, s.file)}>
                  {renaming === s.id && !collapsed ? (
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
                      className={`item ${isActive ? "active" : ""} ${running && !isActive ? "disabled" : ""}`}
                      aria-disabled={running && !isActive}
                      onClick={() => {
                        if (s.file) void openSession(s.file);
                      }}
                      data-tooltip={collapsed ? (s.name || s.id.slice(0, 8)) : undefined}
                    >
                      <span className={`status-dot ${isActive && running ? "running" : isActive ? "success" : ""}`} />
                      {!collapsed && (
                        <>
                          <span className="item-label">{s.name || s.id.slice(0, 8)}</span>
                          <span className="item-meta">{s.messageCount}</span>
                          <span className="item-actions">
                            <button
                              className="icon-btn"
                              data-tooltip={t("sidebar.rename")}
                              onClick={(e) => {
                                e.stopPropagation();
                                startRename(s.id);
                              }}
                            >
                              ✎
                            </button>
                            <button
                              className="icon-btn"
                              data-tooltip={t("sidebar.delete")}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (s.file) void deleteSession(s.file);
                              }}
                            >
                              🗑
                            </button>
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!collapsed && sessions.length === 0 && (
              <div className="empty-state" style={{ padding: 16, gap: 8 }}>
                <p>{t("sidebar.noSessions")}</p>
                <button className="btn btn-sm" onClick={() => void createSession()}>
                  {t("sidebar.newSession")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        <button className="icon-btn" data-tooltip={t("sidebar.extensions")} onClick={() => setView("extensions")}>
          ⧉
        </button>
        <button className="icon-btn" data-tooltip={t("sidebar.settings")} onClick={() => setView("settings")}>
          ⚙
        </button>
        {collapsed ? (
          <button className="icon-btn" data-tooltip="New session" onClick={() => void createSession()} disabled={!currentProject || running}>
            ＋
          </button>
        ) : (
          <>
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary btn-sm" onClick={() => void createSession()} disabled={!currentProject || running}>
              ＋ {t("sidebar.new")}
            </button>
          </>
        )}
      </div>

      {/* Model badge (Codex-style, bottom of sidebar) */}
      <div className="sidebar-model">
        <ModelPicker variant="badge" align="left" />
      </div>

      {menu && <ContextMenu items={menu.items} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </aside>
  );
}
