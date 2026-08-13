// Workspace manager — open folders/repos, maintain recent projects, and list
// Pi sessions for a project (delegating to Pi's SessionManager).

import { existsSync } from "node:fs";
import { basename } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { ProjectInfo, SessionMeta } from "@shared/types";
import { AppState, isGitRepo, projectIdForPath } from "./state";

export class WorkspaceManager {
  constructor(private readonly appState: AppState) {}

  async openProject(path: string): Promise<ProjectInfo> {
    if (!existsSync(path)) {
      throw new Error(`Path does not exist: ${path}`);
    }
    const kind = isGitRepo(path) ? "repo" : "folder";
    const project: ProjectInfo = {
      id: projectIdForPath(path),
      name: basename(path) || path,
      path,
      kind,
      lastOpenedAt: Date.now(),
    };
    this.appState.addProject(project);
    return project;
  }

  getRecentProjects(): ProjectInfo[] {
    return this.appState.getRecentProjects();
  }

  async listSessions(cwd: string): Promise<SessionMeta[]> {
    const infos = await SessionManager.list(cwd);
    return infos.map((info) => ({
      id: info.id,
      name: info.name,
      projectId: projectIdForPath(cwd),
      cwd: info.cwd || cwd,
      file: info.path,
      createdAt: info.created.getTime(),
      updatedAt: info.modified.getTime(),
      messageCount: info.messageCount,
    }));
  }

  async deleteSession(file: string): Promise<void> {
    const fs = await import("node:fs/promises");
    await fs.rm(file, { force: true });
  }
}
