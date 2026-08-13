// IPC handlers — the bridge from the renderer to all main-process services.

import { ipcMain, dialog, shell } from "electron";
import type { BrowserWindow } from "electron";
import { IPC } from "@shared/types";
import type { AppState } from "./state";
import type { WorkspaceManager } from "./workspace";
import type { GitManager } from "./git";
import type { TerminalManager } from "./terminal";
import type { ExtensionRegistry } from "./extensions";
import type { SessionRegistry } from "./session-registry";
import type { DialogBridge } from "./runtime/dialog-bridge";
import type { PiRuntimeAdapter } from "./runtime/pi-runtime";

export interface IpcContext {
  appState: AppState;
  workspace: WorkspaceManager;
  git: GitManager;
  terminal: TerminalManager;
  extensions: ExtensionRegistry;
  sessions: SessionRegistry;
  runtime: PiRuntimeAdapter;
  bridge: DialogBridge;
  agentDir: string;
  getWindow: () => BrowserWindow | null;
}

export function registerIpc(ctx: IpcContext): void {
  // --- app ---
  ipcMain.handle(IPC.AppInfo, () => ({
    name: "Lattice",
    version: "0.1.0",
    platform: process.platform,
  }));

  // --- project ---
  ipcMain.handle(IPC.OpenProject, async (_e, path?: string) => {
    let target = path;
    if (!target) {
      const win = ctx.getWindow();
      const result = await dialog.showOpenDialog(win!, {
        properties: ["openDirectory"],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      target = result.filePaths[0];
    }
    return ctx.workspace.openProject(target!);
  });

  ipcMain.handle(IPC.GetProjects, () => ctx.workspace.getRecentProjects());
  ipcMain.handle(IPC.RemoveProject, (_e, path: string) => {
    ctx.appState.removeProject(path);
    return true;
  });

  // --- session ---
  ipcMain.handle(IPC.GetSessions, (_e, cwd: string) => ctx.workspace.listSessions(cwd));
  ipcMain.handle(IPC.CreateSession, (_e, opts: { projectId: string; cwd: string; name?: string }) =>
    wrapSession(ctx, ctx.sessions.create(opts)),
  );
  ipcMain.handle(IPC.OpenSession, (_e, opts: { projectId: string; cwd: string; file: string }) =>
    wrapSession(ctx, ctx.sessions.open(opts)),
  );
  ipcMain.handle(IPC.RenameSession, async (_e, sessionId: string, name: string) => {
    const h = ctx.sessions.get(sessionId);
    if (h) await h.setName(name);
    return true;
  });
  ipcMain.handle(IPC.DeleteSession, async (_e, file: string) => {
    await ctx.workspace.deleteSession(file);
    return true;
  });
  ipcMain.handle(IPC.GetSessionState, (_e, sessionId: string) => ctx.sessions.getState(sessionId));
  ipcMain.handle(IPC.GetSessionMessages, (_e, sessionId: string) => ctx.sessions.getMessages(sessionId));

  ipcMain.handle(IPC.Prompt, async (_e, sessionId: string, text: string) => {
    const h = ctx.sessions.get(sessionId);
    if (!h) throw new Error("Session not found");
    await h.prompt(text);
    return true;
  });
  ipcMain.handle(IPC.Steer, async (_e, sessionId: string, text: string) => {
    const h = ctx.sessions.get(sessionId);
    if (!h) throw new Error("Session not found");
    await h.steer(text);
    return true;
  });
  ipcMain.handle(IPC.FollowUp, async (_e, sessionId: string, text: string) => {
    const h = ctx.sessions.get(sessionId);
    if (!h) throw new Error("Session not found");
    await h.followUp(text);
    return true;
  });
  ipcMain.handle(IPC.Abort, async (_e, sessionId: string) => {
    const h = ctx.sessions.get(sessionId);
    if (h) await h.abort();
    return true;
  });
  ipcMain.handle(IPC.Continue, async (_e, sessionId: string) => {
    const h = ctx.sessions.get(sessionId);
    if (h) await h.continueAfterError();
    return true;
  });

  // --- models ---
  ipcMain.handle(IPC.GetProviders, () => ctx.runtime.getProviders());
  ipcMain.handle(IPC.GetModels, (_e, providerId?: string) => ctx.runtime.getModels(providerId));
  ipcMain.handle(IPC.SetModel, async (_e, sessionId: string, providerId: string, modelId: string) => {
    const h = ctx.sessions.get(sessionId);
    if (!h) throw new Error("Session not found");
    return h.setModel(providerId, modelId);
  });
  ipcMain.handle(IPC.SetThinkingLevel, (_e, sessionId: string, level: string) => {
    const h = ctx.sessions.get(sessionId);
    if (h) h.setThinkingLevel(level);
    return true;
  });
  ipcMain.handle(IPC.Login, async (_e, providerId: string, apiKey: string) => {
    await ctx.runtime.setApiKey(providerId, apiKey);
    return true;
  });

  // --- permission ---
  ipcMain.handle(IPC.PermissionRespond, (_e, requestId: string, action: string) => {
    ctx.bridge.resolve(requestId, action);
    return true;
  });

  // --- terminal ---
  ipcMain.handle(IPC.TerminalCreate, (_e, cwd: string) => ctx.terminal.create(cwd));
  ipcMain.on(IPC.TerminalInput, (_e, id: string, data: string) => ctx.terminal.write(id, data));
  ipcMain.on(IPC.TerminalResize, (_e, id: string, cols: number, rows: number) =>
    ctx.terminal.resize(id, cols, rows),
  );
  ipcMain.handle(IPC.TerminalKill, (_e, id: string) => {
    ctx.terminal.kill(id);
    return true;
  });

  // --- git ---
  ipcMain.handle(IPC.GitStatus, (_e, cwd: string) => ctx.git.status(cwd));
  ipcMain.handle(IPC.GitDiff, (_e, cwd: string, paths?: string[]) => ctx.git.diff(cwd, paths));
  ipcMain.handle(IPC.GitCommit, async (_e, cwd: string, message: string) => ctx.git.commit(cwd, message));
  ipcMain.handle(IPC.GitBranch, (_e, cwd: string) => ctx.git.branches(cwd));
  ipcMain.handle(IPC.GitCheckout, async (_e, cwd: string, branch: string) => {
    await ctx.git.checkout(cwd, branch);
    return true;
  });
  ipcMain.handle(IPC.GitListWorktrees, (_e, cwd: string) => ctx.git.listWorktrees(cwd));
  ipcMain.handle(IPC.GitCreateWorktree, async (_e, cwd: string, path: string, branch: string) => {
    await ctx.git.createWorktree(cwd, path, branch);
    return true;
  });

  // --- extensions ---
  ipcMain.handle(IPC.ExtList, (_e, cwd: string) => ctx.extensions.listInstalled(cwd, ctx.runtime.getSettingsManager(cwd)));
  ipcMain.handle(IPC.ExtInstall, async (_e, cwd: string, source: string) => {
    await ctx.extensions.install(cwd, ctx.runtime.getSettingsManager(cwd), source);
    return true;
  });
  ipcMain.handle(IPC.ExtUninstall, async (_e, cwd: string, source: string) => {
    await ctx.extensions.uninstall(cwd, ctx.runtime.getSettingsManager(cwd), source);
    return true;
  });
  ipcMain.handle(IPC.ExtToggle, async (_e, cwd: string, source: string, enabled: boolean) => {
    await ctx.extensions.setEnabled(cwd, ctx.runtime.getSettingsManager(cwd), source, enabled);
    return true;
  });
  ipcMain.handle(IPC.ExtSearch, async (_e, registryUrlOrPath: string) => {
    return ctx.extensions.loadRegistry(registryUrlOrPath);
  });

  // --- settings ---
  ipcMain.handle(IPC.SettingsGet, () => ctx.appState.getSettings());
  ipcMain.handle(IPC.SettingsSet, (_e, patch: Record<string, unknown>) =>
    ctx.appState.updateSettings(patch as never),
  );
}

async function wrapSession(ctx: IpcContext, handlePromise: Promise<import("./runtime/types").SessionHandle>) {
  const h = await handlePromise;
  return { sessionId: h.sessionId, cwd: h.cwd, file: h.file, state: h.getState() };
}
