import { useEffect, useState } from "react";
import { useApp } from "../store/useApp";
import { useT } from "../i18n";
import { DiffViewer } from "./DiffViewer";

interface Worktree {
  path: string;
  branch: string;
  locked: boolean;
}

export function GitPanel() {
  const t = useT();
  const currentProject = useApp((s) => s.currentProject);
  const gitStatus = useApp((s) => s.gitStatus);
  const refreshGit = useApp((s) => s.refreshGit);
  const commit = useApp((s) => s.commit);
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState("");
  const [message, setMessage] = useState("");

  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [showWt, setShowWt] = useState(false);
  const [wtBranch, setWtBranch] = useState("");

  useEffect(() => {
    void refreshGit();
  }, [refreshGit]);

  useEffect(() => {
    if (!selected || !currentProject) {
      setDiff("");
      return;
    }
    let current = true;
    setDiff("");
    window.lattice
      .gitDiff(currentProject.path, [selected])
      .then((value) => {
        if (current) setDiff(value as string);
      })
      .catch(() => {
        if (current) setDiff("");
      });
    return () => {
      current = false;
    };
  }, [selected, currentProject]);

  useEffect(() => {
    if (!currentProject) return;
    window.lattice
      .gitListWorktrees(currentProject.path)
      .then((list) => setWorktrees(list as Worktree[]))
      .catch(() => setWorktrees([]));
  }, [currentProject, showWt]);

  const createWorktree = async () => {
    if (!currentProject || !wtBranch.trim()) return;
    const branch = wtBranch.trim();
    const path = `${currentProject.path}/../.lattice-wt/${branch}`;
    await window.lattice.gitCreateWorktree(currentProject.path, path, branch);
    setWtBranch("");
    setShowWt(false);
    await refreshGit();
  };

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
      <div className="git-main">
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
                className={`git-file-row ${selected === f.path ? "active" : ""}`}
                onClick={() => setSelected(f.path)}
              >
                <span className={`file-status ${f.index === "?" ? "untracked" : f.index !== " " ? "staged" : "modified"}`}>
                  {f.index === "?" ? "U" : f.index === " " ? "M" : f.index.toUpperCase()}
                </span>
                <span className="git-file-path">{f.path}</span>
                <span className="git-file-stat">
                  {f.added > 0 || f.removed > 0 ? `+${f.added} −${f.removed}` : ""}
                </span>
              </div>
            ))}
            {gitStatus.files.length === 0 && <div className="empty-state">{t("git.noChanges")}</div>}
          </div>

          {/* Worktrees */}
          <div className="wt-section">
            <div className="wt-head" onClick={() => setShowWt((v) => !v)}>
              <span>{t("git.worktrees")}</span>
              <span className="chev">{showWt ? "▾" : "▸"}</span>
            </div>
            {showWt && (
              <div className="wt-body">
                {worktrees.map((wt) => (
                  <div key={wt.path} className="wt-row" title={wt.path}>
                    <span className="status-dot success" />
                    <span className="wt-branch">{wt.branch}</span>
                    {wt.locked && <span className="wt-locked">🔒</span>}
                  </div>
                ))}
                <div className="wt-create">
                  <input
                    value={wtBranch}
                    onChange={(e) => setWtBranch(e.target.value)}
                    placeholder={t("git.worktreeBranch")}
                  />
                  <button className="btn btn-sm" onClick={() => void createWorktree()} disabled={!wtBranch.trim()}>
                    {t("git.createWorktree")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="git-diff">
          {selected ? <DiffViewer diff={diff} /> : <div className="empty-state">{t("git.selectFile")}</div>}
        </div>
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
