import { useEffect, useState } from "react";
import { useApp } from "../store/useApp";
import type { GitStatus } from "@shared/types";
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
      <div className="panel">
        <div className="panel-head"><span>Git</span></div>
        <div className="empty">Not a git repository</div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Git</span>
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{gitStatus.branch}</span>
        <span style={{ fontSize: 12, color: gitStatus.clean ? "var(--success)" : "var(--warning)" }}>
          {gitStatus.clean ? "clean" : `${gitStatus.files.length} changed`}
        </span>
        <div className="spacer" />
        <button className="btn btn-ghost btn-icon" onClick={() => void refreshGit()}>↻</button>
      </div>
      <div className="panel-body" style={{ display: "flex", minHeight: 0 }}>
        <div style={{ width: 240, overflow: "auto", borderRight: "1px solid var(--border-subtle)" }}>
          {gitStatus.files.map((f) => (
            <div
              key={f.path}
              className={`session-item ${selected === f.path ? "active" : ""}`}
              onClick={() => setSelected(f.path)}
            >
              <span style={{ color: f.staged ? "var(--success)" : "var(--warning)", width: 12 }}>
                {f.index === "?" ? "?" : f.index === " " ? "M" : f.index}
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {f.path}
              </span>
            </div>
          ))}
          {gitStatus.files.length === 0 && <div className="empty">No changes</div>}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
          {selected ? (
            <DiffViewer diff={diff} />
          ) : (
            <div className="empty">Select a file to review its diff</div>
          )}
        </div>
      </div>
      {!gitStatus.clean && (
        <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderTop: "1px solid var(--border-subtle)" }}>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Commit message"
            style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-1)", color: "var(--text-primary)" }}
          />
          <button
            className="btn btn-sm btn-primary"
            disabled={!message.trim()}
            onClick={async () => {
              await commit(message);
              setMessage("");
              setSelected(null);
            }}
          >
            Commit
          </button>
        </div>
      )}
    </div>
  );
}
