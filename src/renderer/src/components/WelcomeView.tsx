import { useApp } from "../store/useApp";

export function WelcomeView() {
  const openProject = useApp((s) => s.openProject);
  const projects = useApp((s) => s.projects);

  return (
    <div className="empty-state">
      <div className="icon">Λ</div>
      <h2>Welcome to Lattice</h2>
      <p>A desktop coding agent powered by the Pi runtime. Open a folder to get started.</p>
      <button className="btn btn-primary" onClick={() => openProject()}>
        Open folder
      </button>
      {projects.length > 0 && (
        <div style={{ marginTop: 24, width: "100%", maxWidth: 360, textAlign: "left" }}>
          <div className="sidebar-section-title">Recent</div>
          {projects.map((p) => (
            <div key={p.path} className="item" onClick={() => openProject(p.path)}>
              <span className="status-dot success" />
              <span className="item-label">{p.name}</span>
              <span className="item-meta">{p.kind === "repo" ? "⑂" : "▤"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
