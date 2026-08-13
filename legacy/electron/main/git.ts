// Git manager — wraps simple-git for status, diff, branch, commit, and
// worktree operations. All mutations are scoped to a project cwd.

import { simpleGit, type SimpleGit, type StatusResult } from "simple-git";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GitCommitResult, GitFileStatus, GitStatus } from "@shared/types";

export class GitManager {
  private gitCache = new Map<string, SimpleGit>();

  private git(cwd: string): SimpleGit {
    let g = this.gitCache.get(cwd);
    if (!g) {
      g = simpleGit(cwd);
      this.gitCache.set(cwd, g);
    }
    return g;
  }

  isRepo(cwd: string): Promise<boolean> {
    return this.git(cwd).checkIsRepo();
  }

  async status(cwd: string): Promise<GitStatus> {
    const g = this.git(cwd);
    const branch = await g.revparse(["--abbrev-ref", "HEAD"]);
    const status: StatusResult = await g.status();

    // Per-file added/removed line counts via git diff --numstat (tracked + staged).
    let numstat = new Map<string, { added: number; removed: number }>();
    try {
      const out = await g.raw(["diff", "--numstat"]);
      for (const line of out.split("\n")) {
        const parts = line.split("\t");
        if (parts.length < 3) continue;
        const [a, r, path] = parts;
        numstat.set(path, {
          added: a === "-" ? 0 : Number(a) || 0,
          removed: r === "-" ? 0 : Number(r) || 0,
        });
      }
    } catch {
      // ignore
    }

    const files: GitFileStatus[] = status.files.map((f) => {
      const ns = numstat.get(f.path) ?? { added: 0, removed: 0 };
      // Untracked files: count all lines as added.
      if (f.index === "?") {
        try {
          const content = readFileSync(join(cwd, f.path), "utf8");
          const added = content.split("\n").length - 1;
          return { path: f.path, index: f.index, workingDir: f.working_dir, staged: false, added, removed: 0 };
        } catch {
          // binary / unreadable
        }
      }
      return {
        path: f.path,
        index: f.index,
        workingDir: f.working_dir,
        staged: f.index !== " " && f.index !== "?",
        added: ns.added,
        removed: ns.removed,
      };
    });

    let ahead = 0;
    let behind = 0;
    try {
      const counts = await g.raw(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]);
      const [a, b] = counts.trim().split(/\s+/).map(Number);
      if (!Number.isNaN(a)) ahead = a;
      if (!Number.isNaN(b)) behind = b;
    } catch {
      // Detached HEAD or no upstream.
    }
    const totalAdded = files.reduce((s, f) => s + f.added, 0);
    const totalRemoved = files.reduce((s, f) => s + f.removed, 0);
    return {
      branch: typeof branch === "string" ? branch : "detached",
      files,
      clean: status.isClean(),
      ahead,
      behind,
      added: totalAdded,
      removed: totalRemoved,
    };
  }

  async diff(cwd: string, paths?: string[]): Promise<string> {
    const g = this.git(cwd);
    const status = await g.status();
    const requested = paths ? new Set(paths) : undefined;
    const untracked = status.files.filter(
      (f) => f.index === "?" && (!requested || requested.has(f.path)),
    );
    const trackedPaths = paths?.filter((p) => !untracked.some((u) => u.path === p));

    let out = "";
    if (trackedPaths === undefined || trackedPaths.length > 0) {
      out += await g.diff(trackedPaths ? ["--", ...trackedPaths] : []);
    }
    for (const f of untracked) {
      out += this.untrackedFileDiff(cwd, f.path);
    }
    return out;
  }

  private untrackedFileDiff(cwd: string, path: string): string {
    let content = "";
    try {
      content = readFileSync(join(cwd, path), "utf8");
    } catch {
      return "";
    }
    const lines = content.split("\n");
    return (
      `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n` +
      lines.map((l) => `+${l}`).join("\n") +
      "\n"
    );
  }

  async diffStaged(cwd: string): Promise<string> {
    return this.git(cwd).diff(["--cached"]);
  }

  async diffPath(cwd: string, path: string): Promise<string> {
    return this.git(cwd).diff(["--", path]);
  }

  async commit(cwd: string, message: string): Promise<GitCommitResult> {
    const g = this.git(cwd);
    const result = await g.commit(message);
    return { hash: result.commit || "", message };
  }

  async branches(cwd: string): Promise<{ current: string; all: string[] }> {
    const g = this.git(cwd);
    const summary = await g.branchLocal();
    return { current: summary.current, all: summary.all };
  }

  async checkout(cwd: string, branch: string): Promise<void> {
    await this.git(cwd).checkout(branch);
  }

  async listWorktrees(cwd: string): Promise<Array<{ path: string; branch: string; locked: boolean }>> {
    const out = await this.git(cwd).raw(["worktree", "list", "--porcelain"]);
    const worktrees: Array<{ path: string; branch: string; locked: boolean }> = [];
    let current: { path?: string; branch?: string } = {};
    for (const line of out.split("\n")) {
      if (line.startsWith("worktree ")) {
        if (current.path) worktrees.push({ path: current.path, branch: current.branch ?? "", locked: false });
        current = { path: line.slice("worktree ".length).trim() };
      } else if (line.startsWith("branch ")) {
        current.branch = line.slice("branch ".length).trim().replace("refs/heads/", "");
      } else if (line.startsWith("locked")) {
        current.path && worktrees.push({ path: current.path, branch: current.branch ?? "", locked: true });
        current = {};
      }
    }
    if (current.path) worktrees.push({ path: current.path, branch: current.branch ?? "", locked: false });
    return worktrees;
  }

  async createWorktree(cwd: string, path: string, branch: string): Promise<void> {
    await this.git(cwd).raw(["worktree", "add", "-b", branch, path]);
  }
}
