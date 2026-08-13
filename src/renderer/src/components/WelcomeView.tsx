import { useApp } from "../store/useApp";

export function WelcomeView() {
  const openProject = useApp((s) => s.openProject);
  const projects = useApp((s) => s.projects);

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <h1>Lattice</h1>
        <p>A desktop coding agent powered by the Pi runtime.</p>
        <button className="btn btn-primary" onClick={() => openProject()}>
          Open folder
        </button>
        {projects.length > 0 && (
          <div style={{ marginTop: 24, textAlign: "left" }}>
            <div className="sidebar-section-label">Recent</div>
            {projects.map((p) => (
              <div key={p.path} className="project-row" onClick={() => openProject(p.path)}>
                <span className="icon">{p.kind === "repo" ? "⑂" : "▤"}</span>
                {p.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
