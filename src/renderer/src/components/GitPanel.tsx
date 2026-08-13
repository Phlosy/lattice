import { useEffect, useState } from "react";
import { useApp } from "../store/useApp";
import { useT } from "../i18n";
import { DiffViewer } from "./DiffViewer";

export function GitPanel() {
  const t = useT();
  const currentProject = useApp((s) => s.currentProject);
  const gitStatus = useApp((s) => s.gitStatus);
  const refreshGit = useApp((s) => s.refreshGit);
  const commit = useApp((s) => s.commit);
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void refreshGit();
  }, [refreshGit]);

  useEffect(() => {
    if (!selected || !currentProject) return;
    window.lattice.gitDiff(currentProject.path, [selected]).then((d) => setDiff(d as string));
  }, [selected, currentProject]);

  if (!currentProject || !gitStatus) {
    return (
      <div className="empty-state" style={{ flex: 1 }}>
        <div className="icon">⑂</div>
        <p>{t("git.notRepo")}</p>
      </div>
    );
  }

  return (
    <div className="git-panel">
      <div className="git-files">
        <div className="git-files-head">
          <span className="branch">{gitStatus.branch}</span>
          <span className={gitStatus.clean ? "clean" : "dirty"}>
            {gitStatus.clean ? t("git.clean") : `${gitStatus.files.length} ${t("git.changed")}`}
          </span>
        </div>
        <div className="git-files-list">
          {gitStatus.files.map((f) => (
            <div
              key={f.path}
              className={`item ${selected === f.path ? "active" : ""}`}
              onClick={() => setSelected(f.path)}
            >
              <span className={`file-status ${f.index === "?" ? "untracked" : f.index !== " " ? "staged" : "modified"}`}>
                {f.index === "?" ? "U" : f.index === " " ? "M" : f.index.toUpperCase()}
              </span>
              <span className="item-label">{f.path}</span>
            </div>
          ))}
          {gitStatus.files.length === 0 && <div className="empty-state">{t("git.noChanges")}</div>}
        </div>
      </div>
      <div className="git-diff">
        {selected ? <DiffViewer diff={diff} /> : <div className="empty-state">{t("git.selectFile")}</div>}
      </div>
      {!gitStatus.clean && (
        <div className="git-commit-bar">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("git.commitMessage")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && message.trim()) {
                void commit(message).then(() => {
                  setMessage("");
                  setSelected(null);
                });
              }
            }}
          />
          <button
            className="btn btn-sm btn-primary"
            disabled={!message.trim()}
            onClick={() =>
              void commit(message).then(() => {
                setMessage("");
                setSelected(null);
              })
            }
          >
            {t("git.commit")}
          </button>
        </div>
      )}
    </div>
  );
}
