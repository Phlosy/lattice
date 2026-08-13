// Preload — the minimal, typed bridge between the renderer and main process.
// Exposed as `window.lattice`.

import { contextBridge, ipcRenderer } from "electron";
import { EVT, IPC } from "../shared/types";
import type { SessionState, PermissionRequest } from "../shared/types";
import type { LatticeApi, SessionEventPayload } from "../shared/api";

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
const send = (channel: string, ...args: unknown[]) => ipcRenderer.send(channel, ...args);
const on = (channel: string, handler: (...args: any[]) => void): (() => void) => {
  const listener = (_e: unknown, ...args: any[]) => handler(...args);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

const api: LatticeApi = {
  // app
  appInfo: () => invoke(IPC.AppInfo),

  // project
  openProject: (path?: string) => invoke(IPC.OpenProject, path),
  getProjects: () => invoke(IPC.GetProjects),
  removeProject: (path: string) => invoke(IPC.RemoveProject, path),

  // session
  getSessions: (cwd: string) => invoke(IPC.GetSessions, cwd),
  createSession: (opts: { projectId: string; cwd: string; name?: string }) =>
    invoke(IPC.CreateSession, opts),
  openSession: (opts: { projectId: string; cwd: string; file: string }) =>
    invoke(IPC.OpenSession, opts),
  renameSession: (sessionId: string, name: string) => invoke(IPC.RenameSession, sessionId, name),
  deleteSession: (file: string) => invoke(IPC.DeleteSession, file),
  getSessionState: (sessionId: string) => invoke(IPC.GetSessionState, sessionId),
  getSessionMessages: (sessionId: string) => invoke(IPC.GetSessionMessages, sessionId),
  prompt: (sessionId: string, text: string, images?: unknown[]) => invoke(IPC.Prompt, sessionId, text, images),
  listFiles: (cwd: string) => invoke(IPC.ListFiles, cwd),
  steer: (sessionId: string, text: string) => invoke(IPC.Steer, sessionId, text),
  followUp: (sessionId: string, text: string) => invoke(IPC.FollowUp, sessionId, text),
  abort: (sessionId: string) => invoke(IPC.Abort, sessionId),
  continueSession: (sessionId: string) => invoke(IPC.Continue, sessionId),

  // models
  getProviders: () => invoke(IPC.GetProviders),
  getModels: (providerId?: string) => invoke(IPC.GetModels, providerId),
  setModel: (sessionId: string, providerId: string, modelId: string) =>
    invoke(IPC.SetModel, sessionId, providerId, modelId),
  setThinkingLevel: (sessionId: string, level: string) =>
    invoke(IPC.SetThinkingLevel, sessionId, level),
  login: (providerId: string, apiKey: string) => invoke(IPC.Login, providerId, apiKey),

  // permission
  respondPermission: (requestId: string, action: string) =>
    invoke(IPC.PermissionRespond, requestId, action),

  // terminal
  createTerminal: (cwd: string) => invoke(IPC.TerminalCreate, cwd),
  terminalInput: (id: string, data: string) => send(IPC.TerminalInput, id, data),
  terminalResize: (id: string, cols: number, rows: number) =>
    send(IPC.TerminalResize, id, cols, rows),
  killTerminal: (id: string) => invoke(IPC.TerminalKill, id),

  // git
  gitStatus: (cwd: string) => invoke(IPC.GitStatus, cwd),
  gitDiff: (cwd: string, paths?: string[]) => invoke(IPC.GitDiff, cwd, paths),
  gitCommit: (cwd: string, message: string) => invoke(IPC.GitCommit, cwd, message),
  gitBranches: (cwd: string) => invoke(IPC.GitBranch, cwd),
  gitCheckout: (cwd: string, branch: string) => invoke(IPC.GitCheckout, cwd, branch),
  gitListWorktrees: (cwd: string) => invoke(IPC.GitListWorktrees, cwd),
  gitCreateWorktree: (cwd: string, path: string, branch: string) =>
    invoke(IPC.GitCreateWorktree, cwd, path, branch),

  // extensions
  extList: (cwd: string) => invoke(IPC.ExtList, cwd),
  extInstall: (cwd: string, source: string) => invoke(IPC.ExtInstall, cwd, source),
  extUninstall: (cwd: string, source: string) => invoke(IPC.ExtUninstall, cwd, source),
  extToggle: (cwd: string, source: string, enabled: boolean) =>
    invoke(IPC.ExtToggle, cwd, source, enabled),
  extSearch: (registry: string) => invoke(IPC.ExtSearch, registry),

  // settings
  getSettings: () => invoke(IPC.SettingsGet),
  setSettings: (patch: Record<string, unknown>) => invoke(IPC.SettingsSet, patch),

  // events
  onSessionEvent: (handler: (payload: SessionEventPayload) => void) => on(EVT.SessionEvent, handler),
  onSessionState: (handler: (state: SessionState) => void) => on(EVT.SessionState, handler),
  onSessionCreated: (handler: (payload: { sessionId: string; projectId: string }) => void) =>
    on(EVT.SessionCreated, handler),
  onSessionDeleted: (handler: (payload: unknown) => void) => on(EVT.SessionDeleted, handler),
  onPermissionRequest: (handler: (payload: PermissionRequest & { requestId: string }) => void) =>
    on(EVT.PermissionRequest, handler),
  onTerminalData: (handler: (payload: { id: string; data: string }) => void) =>
    on(EVT.TerminalData, handler),
  onTerminalExit: (handler: (payload: { id: string; exitCode: number }) => void) =>
    on(EVT.TerminalExit, handler),
  onGitChanged: (handler: (payload: unknown) => void) => on(EVT.GitChanged, handler),
  onModelsChanged: (handler: (payload: unknown) => void) => on(EVT.ModelsChanged, handler),
};

contextBridge.exposeInMainWorld("lattice", api);
