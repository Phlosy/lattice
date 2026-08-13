// Lattice app state — recent projects and app-only settings. Kept under
// ~/.lattice/ so it never conflicts with Pi's own config (~/.pi/agent).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AppSettings, ProjectInfo } from "@shared/types";

const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  locale: "en",
  fontSize: 13,
  accent: "#4f8cff",
  sandboxMode: "none",
  autoApproveReadOnly: true,
};

export function latticeDir(): string {
  return join(homedir(), ".lattice");
}

export function decisionsPath(): string {
  return join(latticeDir(), "permissions.json");
}

interface StateShape {
  version: number;
  recentProjects: ProjectInfo[];
  settings: AppSettings;
}

export class AppState {
  private state: StateShape;
  private readonly file: string;

  constructor() {
    this.file = join(latticeDir(), "state.json");
    this.state = this.load();
  }

  private load(): StateShape {
    try {
      const raw = readFileSync(this.file, "utf8");
      const parsed = JSON.parse(raw) as Partial<StateShape>;
      return {
        version: 1,
        recentProjects: parsed.recentProjects ?? [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      };
    } catch {
      return { version: 1, recentProjects: [], settings: { ...DEFAULT_SETTINGS } };
    }
  }

  private save(): void {
    try {
      mkdirSync(latticeDir(), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.state, null, 2));
    } catch {
      // Non-fatal.
    }
  }

  getRecentProjects(): ProjectInfo[] {
    // Only return projects that still exist on disk and are not scratch dirs.
    return this.state.recentProjects.filter(
      (p) => existsSync(p.path) && !isScratchPath(p.path),
    );
  }

  addProject(project: ProjectInfo): void {
    // Never remember scratch/temp directories (tests, capture driver, etc.).
    if (isScratchPath(project.path)) return;
    this.state.recentProjects = [
      project,
      ...this.state.recentProjects.filter((p) => p.path !== project.path),
    ].slice(0, 20);
    this.save();
  }

  removeProject(path: string): void {
    this.state.recentProjects = this.state.recentProjects.filter((p) => p.path !== path);
    this.save();
  }

  getSettings(): AppSettings {
    return this.state.settings;
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    this.state.settings = { ...this.state.settings, ...patch };
    this.save();
    return this.state.settings;
  }
}

/** Returns a stable project id derived from the absolute path. */
export function projectIdForPath(path: string): string {
  // Simple deterministic hash (FNV-1a) of the path.
  let h = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) {
    h ^= path.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return "proj-" + (h >>> 0).toString(16).padStart(8, "0");
}

export function isGitRepo(path: string): boolean {
  return existsSync(join(path, ".git"));
}

/** Scratch/temp dirs that should never be remembered as recent projects. */
function isScratchPath(path: string): boolean {
  const p = path.toLowerCase();
  return (
    p.includes("/tmp/") ||
    p.includes("/var/folders/") ||
    p.includes("lattice-shot-") ||
    p.includes("lattice-e2e-") ||
    p.includes("lattice-it-") ||
    p.includes("lattice-smoke-") ||
    p.includes("lattice-par-")
  );
}
