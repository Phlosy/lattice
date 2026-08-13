import { useApp } from "../store/useApp";
import { useT } from "../i18n";

export function WelcomeView() {
  const t = useT();
  const openProject = useApp((s) => s.openProject);
  const projects = useApp((s) => s.projects);

  return (
    <div className="empty-state">
      <div className="icon">Λ</div>
      <h2>{t("welcome.title")}</h2>
      <p>{t("welcome.desc")}</p>
      <button className="btn btn-primary" onClick={() => openProject()}>
        {t("sidebar.openFolder")}
      </button>
      {projects.length > 0 && (
        <div style={{ marginTop: 24, width: "100%", maxWidth: 360, textAlign: "left" }}>
          <div className="sidebar-section-title">{t("welcome.recent")}</div>
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
