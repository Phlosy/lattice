// Tauri implementation of window.lattice. Wraps the Rust commands (invoke) and
// events (listen) behind the same LatticeApi interface the React UI already
// uses, so the React code stays unchanged. Unimplemented commands fall back to
// the benign stub until their Rust equivalents land.

import type { LatticeApi } from "../../shared/api";
import { createLatticeStub } from "./lattice-stub";

type TauriWindow = Window & {
  __TAURI__?: {
    core: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
    event: { listen: (event: string, cb: (e: { payload: unknown }) => void) => Promise<unknown> };
  };
};

export function createLatticeTauri(): LatticeApi {
  const tw = window as TauriWindow;
  const invoke = (cmd: string, args?: Record<string, unknown>) =>
    tw.__TAURI__!.core.invoke(cmd, args);
  const listen = (event: string, cb: (payload: any) => void) => {
    tw.__TAURI__!.event.listen(event, (e) => cb((e as { payload: unknown }).payload));
    return () => {};
  };

  const stub = createLatticeStub();
  return {
    ...stub,

    // Workspace / filesystem
    openProject: (path) => invoke("open_project", { path }) as Promise<never>,
    listFiles: (cwd) => invoke("list_files", { path: cwd, maxFiles: 400 }) as Promise<string[]>,

    // Git
    gitStatus: (cwd) =>
      invoke("git_status", { path: cwd }).then((s) => ({ ...(s as object), ahead: 0, behind: 0 }) as never),
    gitDiff: (cwd, paths) => invoke("git_diff", { path: cwd, file: paths?.[0] ?? "" }) as Promise<string>,
    gitCommit: async (cwd, message) => {
      await invoke("git_commit", { path: cwd, message });
      return { hash: "", message };
    },
    gitBranches: async (cwd) => {
      const b = (await invoke("git_branches", { path: cwd })) as string[];
      return { current: b[0] ?? "", all: b };
    },
    gitListWorktrees: (cwd) => invoke("git_worktrees", { path: cwd }) as never,
    gitCreateWorktree: (cwd, path, branch) =>
      invoke("git_create_worktree", { path: cwd, branch, target: path }) as Promise<boolean>,

    // Settings
    getSettings: () => invoke("get_settings") as never,
    setSettings: (patch) => invoke("set_settings", { settings: patch }) as never,

    // Pi agent (single-session RPC sidecar)
    prompt: (_sessionId, text) => invoke("pi_prompt", { text }) as Promise<boolean>,
    abort: () => invoke("pi_abort") as Promise<boolean>,
    respondPermission: (requestId, action) =>
      invoke("pi_respond_ui", { id: requestId, confirmed: action.startsWith("allow") }) as Promise<boolean>,

    // Session (JSONL file-backed, no live Pi process needed for listing)
    getSessions: (_cwd) =>
      invoke("session_list", { sessionDir: "/tmp/pi-tauri-sessions" }) as never,
    getSessionMessages: (sessionId) =>
      invoke("session_messages", { file: sessionId }) as Promise<never>,

    // Marketplace
    extList: () => invoke("pi_list") as never,
    extInstall: (_cwd, source) => invoke("pi_install", { source }) as Promise<boolean>,
    extUninstall: (_cwd, source) => invoke("pi_remove", { source }) as Promise<boolean>,

    // Terminal
    createTerminal: async (cwd) => {
      const id = (await invoke("pty_spawn", { cwd })) as string;
      return { id, cwd, title: "Terminal" };
    },
    terminalInput: (id, data) => void invoke("pty_write", { id, data }),
    terminalResize: (id, cols, rows) => void invoke("pty_resize", { id, cols, rows }),
    killTerminal: (id) => invoke("pty_kill", { id }) as Promise<boolean>,

    // Events
    onSessionEvent: (handler) =>
      listen("pi-event", (p) => handler({ sessionId: "main", event: p as Record<string, unknown> })),
    onPermissionRequest: (handler) => listen("ui-request", (p) => handler(p as never)),
    onTerminalData: (handler) => listen("pty-data", (p) => handler(p as { id: string; data: string })),
    onTerminalExit: (handler) => listen("pty-exit", (p) => handler(p as { id: string; exitCode: number })),
  };
}
