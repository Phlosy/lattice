// The typed IPC surface exposed by the preload script as `window.lattice`.
// Shared between preload (implementation) and renderer (consumer) so both stay
// in sync without either importing electron types.

import type {
  AgentMessage,
  GitStatus,
  ModelInfo,
  PermissionRequest,
  ProjectInfo,
  ProviderInfo,
  SessionMeta,
  SessionState,
  TerminalMeta,
  AppSettings,
} from "./types";

export interface SessionEventPayload {
  sessionId: string;
  event: Record<string, unknown>;
}

export interface LatticeApi {
  appInfo(): Promise<{ name: string; version: string; platform: string }>;

  openProject(path?: string): Promise<ProjectInfo | null>;
  getProjects(): Promise<ProjectInfo[]>;
  removeProject(path: string): Promise<boolean>;

  getSessions(cwd: string): Promise<SessionMeta[]>;
  createSession(opts: { projectId: string; cwd: string; name?: string }): Promise<{
    sessionId: string;
    cwd: string;
    file?: string;
    state: SessionState;
  }>;
  openSession(opts: { projectId: string; cwd: string; file: string }): Promise<{
    sessionId: string;
    cwd: string;
    file?: string;
    state: SessionState;
  }>;
  renameSession(sessionId: string, name: string): Promise<boolean>;
  deleteSession(file: string): Promise<boolean>;
  getSessionState(sessionId: string): Promise<SessionState>;
  getSessionMessages(sessionId: string): Promise<AgentMessage[]>;
  prompt(sessionId: string, text: string, images?: Array<{ type: "image"; data: string; mimeType: string }>): Promise<boolean>;
  listFiles(cwd: string): Promise<string[]>;
  steer(sessionId: string, text: string): Promise<boolean>;
  followUp(sessionId: string, text: string): Promise<boolean>;
  abort(sessionId: string): Promise<boolean>;
  continueSession(sessionId: string): Promise<boolean>;

  getProviders(): Promise<ProviderInfo[]>;
  getModels(providerId?: string): Promise<ModelInfo[]>;
  setModel(sessionId: string, providerId: string, modelId: string): Promise<ModelInfo | undefined>;
  setThinkingLevel(sessionId: string, level: string): Promise<boolean>;
  login(providerId: string, apiKey: string): Promise<boolean>;

  respondPermission(requestId: string, action: string): Promise<boolean>;

  createTerminal(cwd: string): Promise<TerminalMeta>;
  terminalInput(id: string, data: string): void;
  terminalResize(id: string, cols: number, rows: number): void;
  killTerminal(id: string): Promise<boolean>;

  gitStatus(cwd: string): Promise<GitStatus>;
  gitDiff(cwd: string, paths?: string[]): Promise<string>;
  gitCommit(cwd: string, message: string): Promise<{ hash: string; message: string }>;
  gitBranches(cwd: string): Promise<{ current: string; all: string[] }>;
  gitCheckout(cwd: string, branch: string): Promise<boolean>;
  gitListWorktrees(cwd: string): Promise<Array<{ path: string; branch: string; locked: boolean }>>;
  gitCreateWorktree(cwd: string, path: string, branch: string): Promise<boolean>;

  extList(cwd: string): Promise<unknown[]>;
  extInstall(cwd: string, source: string): Promise<boolean>;
  extUninstall(cwd: string, source: string): Promise<boolean>;
  extToggle(cwd: string, source: string, enabled: boolean): Promise<boolean>;
  extSearch(registry: string): Promise<unknown[]>;

  getSettings(): Promise<AppSettings>;
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>;

  onSessionEvent(handler: (payload: SessionEventPayload) => void): () => void;
  onSessionState(handler: (state: SessionState) => void): () => void;
  onSessionCreated(handler: (payload: { sessionId: string; projectId: string }) => void): () => void;
  onSessionDeleted(handler: (payload: unknown) => void): () => void;
  onPermissionRequest(handler: (payload: PermissionRequest & { requestId: string }) => void): () => void;
  onTerminalData(handler: (payload: { id: string; data: string }) => void): () => void;
  onTerminalExit(handler: (payload: { id: string; exitCode: number }) => void): () => void;
  onGitChanged(handler: (payload: unknown) => void): () => void;
  onModelsChanged(handler: (payload: unknown) => void): () => void;
}
