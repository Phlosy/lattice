// Production Tauri implementation of window.lattice. Every LatticeApi method
// is explicit: missing desktop commands must fail visibly rather than inherit a
// benign browser stub.

import { open } from "@tauri-apps/plugin-dialog";
import type { LatticeApi } from "../../shared/api";
import type {
  GitStatus,
  ProjectInfo,
  SessionMeta,
  SessionState,
} from "../../shared/types";

type UnlistenFn = () => void;
type TauriWindow = Window & {
  __TAURI__?: {
    core: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
    event: {
      listen: (event: string, cb: (e: { payload: unknown }) => void) => Promise<UnlistenFn>;
    };
  };
};

type LocalEvent = "git-changed";
const SESSION_STATE_EVENTS = new Set([
  "agent_start",
  "agent_settled",
  "message_end",
  "session_compacted",
  "auto_compaction_end",
]);

export function createLatticeTauri(): LatticeApi {
  const tw = window as TauriWindow;
  if (!tw.__TAURI__) throw new Error("Tauri runtime is unavailable");
  const invoke = (cmd: string, args?: Record<string, unknown>) =>
    tw.__TAURI__!.core.invoke(cmd, args);
  const sessionFiles = new Map<string, string>();
  const localListeners = new Map<LocalEvent, Set<(payload: unknown) => void>>();
  let activeSessionId: string | null = null;
  let activeCwd = "";

  const listen = (event: string, cb: (payload: any) => void): (() => void) => {
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void tw.__TAURI__!.event.listen(event, (e) => cb(e.payload)).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  };
  const onLocal = (event: LocalEvent, cb: (payload: unknown) => void) => {
    const listeners = localListeners.get(event) ?? new Set();
    listeners.add(cb);
    localListeners.set(event, listeners);
    return () => listeners.delete(cb);
  };
  const emitLocal = (event: LocalEvent, payload: unknown) => {
    for (const listener of localListeners.get(event) ?? []) listener(payload);
  };

  const normalizeSessionState = (raw: any): SessionState => ({
    ...raw,
    sessionId: String(raw?.sessionId ?? ""),
    cwd: String(raw?.cwd ?? activeCwd),
    file: raw?.file ?? raw?.sessionFile,
    name: raw?.name ?? raw?.sessionName,
    thinkingLevel: String(raw?.thinkingLevel ?? "medium"),
    isStreaming: Boolean(raw?.isStreaming),
    isCompacting: Boolean(raw?.isCompacting),
    messageCount: Number(raw?.messageCount ?? 0),
    pendingSteering: Number(raw?.pendingSteering ?? 0),
    pendingFollowUp: Number(raw?.pendingFollowUp ?? raw?.pendingMessageCount ?? 0),
  });

  const rememberSession = (value: any) => {
    const state = normalizeSessionState(value?.state ?? value);
    const id = String(value?.sessionId ?? state.sessionId);
    const file = value?.file ?? state.file;
    if (id && typeof file === "string") sessionFiles.set(id, file);
    if (id) activeSessionId = id;
    return {
      ...value,
      sessionId: id,
      cwd: String(value?.cwd || state.cwd),
      file,
      state,
    };
  };

  const api: LatticeApi = {
    appInfo: () => invoke("app_info") as never,

    openProject: async (path) => {
      let selected = path;
      if (!selected) {
        const result = await open({ directory: true, multiple: false, title: "Open project" });
        selected = typeof result === "string" ? result : undefined;
      }
      if (!selected) return null;
      const project = (await invoke("open_project", { path: selected })) as ProjectInfo;
      activeCwd = project.path;
      await invoke("pi_set_cwd", { cwd: project.path });
      return project;
    },
    getProjects: () => invoke("get_projects") as Promise<ProjectInfo[]>,
    removeProject: async (path) => {
      await invoke("remove_project", { path });
      return true;
    },
    listFiles: (cwd) => invoke("list_files", { path: cwd, maxFiles: 400 }) as Promise<string[]>,

    getSessions: async (cwd) => {
      const rows = (await invoke("session_list")) as Array<any>;
      return rows
        .filter((row) => !cwd || !row.cwd || row.cwd === cwd)
        .map((row) => {
          sessionFiles.set(String(row.id), String(row.file));
          return {
            ...row,
            projectId: row.projectId ?? `proj-${cwd}`,
            createdAt: Date.parse(row.createdAt) || 0,
            updatedAt: Date.parse(row.updatedAt) || Date.parse(row.createdAt) || 0,
            messageCount: Number(row.messageCount ?? 0),
          } satisfies SessionMeta;
        });
    },
    createSession: async (opts) =>
      rememberSession(await invoke("create_session", { name: opts.name ?? null })) as never,
    openSession: async (opts) =>
      rememberSession(await invoke("open_session", { file: opts.file })) as never,
    renameSession: async (sessionId, name) => {
      await invoke("rename_session", { sessionId, name });
      return true;
    },
    deleteSession: async (file) => {
      await invoke("delete_session", { file });
      return true;
    },
    getSessionState: async (_sessionId) => {
      const raw = await invoke("get_session_state");
      return rememberSession({ state: raw }).state;
    },
    getSessionMessages: (sessionId) => {
      const file = sessionFiles.get(sessionId);
      if (!file) return Promise.reject(new Error(`Session file not found for ${sessionId}`));
      return invoke("session_messages", { file }) as never;
    },
    prompt: (_sessionId, text, images) =>
      invoke("pi_prompt", { text, images: images ?? [] }).then(() => true),
    steer: (_sessionId, text) => invoke("pi_steer", { message: text }).then(() => true),
    followUp: (_sessionId, text) => invoke("pi_follow_up", { message: text }).then(() => true),
    abort: () => invoke("pi_abort").then(() => true),
    continueSession: () => invoke("pi_continue").then(() => true),

    getProviders: () => invoke("get_providers") as never,
    getModels: () => invoke("get_models") as never,
    setModel: async (_sessionId, providerId, modelId) =>
      (await invoke("set_model", { provider: providerId, modelId })) as never,
    setThinkingLevel: async (_sessionId, level) => {
      await invoke("set_thinking_level", { level });
      return true;
    },
    login: async (providerId, apiKey) => {
      await invoke("login", { provider: providerId, apiKey });
      return true;
    },

    respondPermission: async (requestId, action) => {
      await invoke("pi_respond_ui", { id: requestId, confirmed: action.startsWith("allow") });
      return true;
    },

    createTerminal: async (cwd) => {
      const id = (await invoke("pty_spawn", { cwd })) as string;
      return { id, cwd, title: "Terminal" };
    },
    terminalInput: (id, data) => void invoke("pty_write", { id, data }),
    terminalResize: (id, cols, rows) => void invoke("pty_resize", { id, cols, rows }),
    killTerminal: async (id) => {
      await invoke("pty_kill", { id });
      return true;
    },

    gitStatus: async (cwd) => {
      const raw = (await invoke("git_status", { path: cwd })) as any;
      return {
        branch: raw.branch,
        clean: raw.clean,
        ahead: 0,
        behind: 0,
        added: raw.added ?? 0,
        removed: raw.removed ?? 0,
        files: (raw.files ?? []).map((file: any) => ({
          path: file.path,
          index: file.index ?? file.status ?? " ",
          workingDir: file.workingDir ?? file.status ?? " ",
          staged: Boolean(file.staged),
          added: file.added ?? 0,
          removed: file.removed ?? 0,
        })),
      } satisfies GitStatus;
    },
    gitDiff: (cwd, paths) => invoke("git_diff", { path: cwd, file: paths?.[0] ?? "" }) as Promise<string>,
    gitCommit: async (cwd, message) => {
      const hash = String(await invoke("git_commit", { path: cwd, message }));
      emitLocal("git-changed", { cwd });
      return { hash, message };
    },
    gitBranches: async (cwd) => {
      const all = (await invoke("git_branches", { path: cwd })) as string[];
      const status = (await api.gitStatus(cwd)) as GitStatus;
      return { current: status.branch, all };
    },
    gitCheckout: async (cwd, branch) => {
      await invoke("git_checkout", { path: cwd, branch });
      emitLocal("git-changed", { cwd, branch });
      return true;
    },
    gitListWorktrees: async (cwd) => {
      return invoke("git_worktrees", { path: cwd }) as Promise<
        Array<{ path: string; branch: string; locked: boolean }>
      >;
    },
    gitCreateWorktree: async (cwd, path, branch) => {
      await invoke("git_create_worktree", { path: cwd, branch, target: path });
      emitLocal("git-changed", { cwd, path, branch });
      return true;
    },

    extList: () => invoke("ext_list") as never,
    extInstall: async (cwd, source) => {
      await invoke("pi_install", { cwd, source });
      return true;
    },
    extUninstall: async (cwd, source) => {
      await invoke("pi_remove", { cwd, source });
      return true;
    },
    extToggle: async (_cwd, source, enabled) => {
      await invoke("ext_toggle", { source, enabled });
      return true;
    },
    extSearch: async (registry) => {
      const text = /^https?:\/\//i.test(registry)
        ? await fetch(registry).then(async (response) => {
            if (!response.ok) throw new Error(`Registry request failed: ${response.status}`);
            return response.text();
          })
        : await invoke("read_file", { path: registry }) as string;
      const value = JSON.parse(text);
      const packages = Array.isArray(value)
        ? value
        : Array.isArray(value?.packages)
          ? value.packages
          : null;
      if (!packages) throw new Error("Registry must be a JSON array or an object with a packages array");
      return packages;
    },

    getSettings: () => invoke("get_settings") as never,
    setSettings: (patch) => invoke("set_settings", { patch }) as never,

    onSessionEvent: (handler) =>
      listen("pi-event", (payload) => {
        const raw = payload as Record<string, unknown>;
        const sessionId = String(raw.sessionId ?? activeSessionId ?? "");
        handler({ sessionId, event: raw });
      }),
    onSessionState: (handler) =>
      listen("pi-event", (payload) => {
        const type = String((payload as Record<string, unknown>)?.type ?? "");
        if (!activeSessionId || !SESSION_STATE_EVENTS.has(type)) return;
        void api.getSessionState(activeSessionId).then(handler).catch(() => {});
      }),
    onSessionCreated: (handler) =>
      listen("session-created", (payload) => {
        const value = rememberSession(payload);
        handler({ sessionId: String(value.sessionId), projectId: "" });
      }),
    onSessionDeleted: (handler) => listen("session-deleted", handler),
    onPermissionRequest: (handler) =>
      listen("ui-request", (payload) => {
        const value = payload as any;
        const title = String(value.title ?? value.label ?? "Tool call");
        const summary = String(value.message ?? value.summary ?? "");
        const toolName = title.match(/allow\s+([^?]+)/i)?.[1]?.trim() ?? "tool";
        const kind: "bash" | "write" | "edit" | "other" =
          toolName === "bash" || toolName === "write" || toolName === "edit" ? toolName : "other";
        handler({
          id: String(value.id ?? ""),
          requestId: String(value.requestId ?? value.id ?? ""),
          sessionId: activeSessionId ?? "",
          toolName,
          label: title,
          args: {},
          summary,
          command: kind === "bash" ? summary : undefined,
          filePath: kind === "write" || kind === "edit" ? summary.replace(/^\w+:\s*/, "") : undefined,
          kind,
        });
      }),
    onTerminalData: (handler) => listen("pty-data", handler),
    onTerminalExit: (handler) => listen("pty-exit", handler),
    onGitChanged: (handler) => onLocal("git-changed", handler),
    onModelsChanged: (handler) => listen("models-changed", handler),
  };

  return api;
}
