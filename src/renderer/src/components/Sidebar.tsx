import { useApp } from "../store/useApp";

export function Sidebar() {
  const projects = useApp((s) => s.projects);
  const currentProject = useApp((s) => s.currentProject);
  const sessions = useApp((s) => s.sessions);
  const activeSessionId = useApp((s) => s.activeSessionId);
  const openProject = useApp((s) => s.openProject);
  const createSession = useApp((s) => s.createSession);
  const setActiveSession = useApp((s) => s.setActiveSession);
  const setView = useApp((s) => s.setView);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="brand">Lattice</span>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Projects</div>
        {projects.length === 0 && (
          <div className="project-row" onClick={() => openProject()}>
            <span className="icon">＋</span> Open folder
          </div>
        )}
        {projects.map((p) => (
          <div
            key={p.path}
            className={`project-row ${currentProject?.path === p.path ? "active" : ""}`}
            onClick={() => openProject(p.path)}
          >
            <span className="icon">{p.kind === "repo" ? "⑂" : "▤"}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.name}
            </span>
          </div>
        ))}
        {projects.length > 0 && (
          <div className="project-row" onClick={() => openProject()}>
            <span className="icon">＋</span> Open folder
          </div>
        )}
      </div>

      {currentProject && (
        <div className="sidebar-section" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div className="sidebar-section-label">Sessions</div>
          <div className="session-list">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`session-item ${activeSessionId === s.id ? "active" : ""}`}
                onClick={() => setActiveSession(s.id)}
              >
                <span className="name">{s.name || s.id.slice(0, 8)}</span>
                <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{s.messageCount}</span>
              </div>
            ))}
            {sessions.length === 0 && <div className="empty" style={{ padding: 12 }}>No sessions</div>}
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        <button className="btn btn-ghost btn-icon" title="Extensions" onClick={() => setView("extensions")}>
          ⧉
        </button>
        <button className="btn btn-ghost btn-icon" title="Settings" onClick={() => setView("settings")}>
          ⚙
        </button>
        <div style={{ flex: 1 }} />
        <button
          className="btn btn-primary btn-sm"
          onClick={() => createSession()}
          disabled={!currentProject}
        >
          ＋ New
        </button>
      </div>
    </aside>
  );
}
