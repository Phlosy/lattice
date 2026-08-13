import { useEffect, useState } from "react";
import { useApp } from "../store/useApp";
import { DiffViewer } from "./DiffViewer";

export function GitPanel() {
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
        <p>Not a git repository.</p>
      </div>
    );
  }

  return (
    <div className="git-panel">
      <div className="git-files">
        <div className="git-files-head">
          <span className="branch">{gitStatus.branch}</span>
          <span className={gitStatus.clean ? "clean" : "dirty"}>
            {gitStatus.clean ? "clean" : `${gitStatus.files.length} changed`}
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
          {gitStatus.files.length === 0 && <div className="empty-state">No changes</div>}
        </div>
      </div>
      <div className="git-diff">
        {selected ? <DiffViewer diff={diff} /> : <div className="empty-state">Select a file to review changes</div>}
      </div>
      {!gitStatus.clean && (
        <div className="git-commit-bar">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Commit message"
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
            Commit
          </button>
        </div>
      )}
    </div>
  );
}
