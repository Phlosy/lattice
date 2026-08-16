// RemotePiRuntimeAdapter — implements LatticeApi over an authenticated
// WebSocket connection to a Lattice Runtime Host. Mobile (Android/iOS) uses
// this by default; Desktop can opt in. The React UI is unchanged: it only
// depends on the LatticeApi interface.

import type { LatticeApi, SessionEventPayload } from "../../shared/api";

type Request = { id: string; method: string; params?: Record<string, unknown> };
type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };
type Handler = (payload: any) => void;

export interface RemoteRuntimeOptions {
  /** wss:// or ws:// URL of the Runtime Host. */
  url: string;
  /** Long-lived device credential issued during pairing. */
  token?: string;
  /** Called on connection state change (for UI status). */
  onStatus?: (status: "connecting" | "connected" | "disconnected" | "error") => void;
}

export function createLatticeRemote(opts: RemoteRuntimeOptions): LatticeApi {
  let ws: WebSocket | null = null;
  let seq = 0;
  let ready: Promise<void> = Promise.reject(new Error("runtime not connected"));
  const pending = new Map<string, Pending>();
  const eventHandlers = new Map<string, Set<Handler>>();

  function on(event: string, handler: Handler): () => void {
    if (!eventHandlers.has(event)) eventHandlers.set(event, new Set());
    eventHandlers.get(event)!.add(handler);
    return () => {
      eventHandlers.get(event)?.delete(handler);
    };
  }

  function emit(event: string, payload: any) {
    eventHandlers.get(event)?.forEach((h) => h(payload));
  }

  function sendRaw(msg: unknown) {
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error("runtime not connected");
    ws.send(JSON.stringify(msg));
  }

  function connect() {
    opts.onStatus?.("connecting");
    ready = new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(opts.url);
      ws = socket;
      socket.onopen = () => {
        opts.onStatus?.("connected");
        if (opts.token) {
          try {
            sendRaw({ type: "auth", token: opts.token });
          } catch {
            // ignore; requests still fail cleanly below if the socket is gone
          }
        }
        resolve();
      };
      socket.onmessage = (e) => {
        let msg: any;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg.type === "response" && msg.id && pending.has(msg.id)) {
          const p = pending.get(msg.id)!;
          pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error));
          else p.resolve(msg.data);
        } else if (msg.type === "event") {
          emit(msg.event, msg.payload);
        }
      };
      socket.onclose = () => {
        opts.onStatus?.("disconnected");
        pending.forEach((p) => p.reject(new Error("runtime disconnected")));
        pending.clear();
      };
      socket.onerror = () => {
        opts.onStatus?.("error");
        reject(new Error("runtime connection failed"));
      };
    });
  }

  function request(method: string, params?: Record<string, unknown>): Promise<any> {
    const id = `m${++seq}`;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ready.then(
        () => {
          try {
            sendRaw({ id, method, params } satisfies Request);
          } catch (e) {
            pending.delete(id);
            reject(e as Error);
          }
        },
        (e) => {
          pending.delete(id);
          reject(e as Error);
        },
      );
    });
  }

  connect();

  // Events → LatticeApi subscription shape.
  const onSessionEvent = (h: (p: SessionEventPayload) => void) => on("session.event", h);
  const onSessionState = (h: any) => on("session.state", h);
  const onSessionCreated = (h: any) => on("session.created", h);
  const onSessionDeleted = (h: any) => on("session.deleted", h);
  const onPermissionRequest = (h: any) => on("permission.request", h);
  const onTerminalData = (h: any) => on("terminal.data", h);
  const onTerminalExit = (h: any) => on("terminal.exit", h);
  const onGitChanged = (h: any) => on("git.changed", h);
  const onModelsChanged = (h: any) => on("models.changed", h);

  return {
    appInfo: () => Promise.resolve({ name: "Lattice", version: "1.1.1", platform: "remote" }),
    openProject: (path) => request("project.open", { path }),
    getProjects: () => request("project.list"),
    removeProject: (path) => request("project.remove", { path }),
    getSessions: (cwd) => request("session.list", { cwd }),
    createSession: (opts) => request("session.create", { ...opts }),
    openSession: (opts) => request("session.open", { ...opts }),
    renameSession: (sessionId, name) => request("session.rename", { sessionId, name }),
    deleteSession: (file) => request("session.delete", { file }),
    getSessionState: (sessionId) => request("session.state", { sessionId }),
    getSessionMessages: (sessionId) => request("session.messages", { sessionId }),
    prompt: (sessionId, text, images) => request("prompt", { sessionId, text, images: images ?? [] }),
    steer: (sessionId, text) => request("steer", { sessionId, text }),
    followUp: (sessionId, text) => request("follow_up", { sessionId, text }),
    abort: (sessionId) => request("abort", { sessionId }),
    continueSession: (sessionId) => request("continue", { sessionId }),
    listFiles: (cwd) => request("files.list", { cwd }),
    getProviders: () => request("model.providers"),
    getModels: (providerId) => request("model.list", { providerId }),
    setModel: (sessionId, providerId, modelId) => request("model.set", { sessionId, providerId, modelId }),
    setThinkingLevel: (sessionId, level) => request("thinking.set", { sessionId, level }),
    login: (providerId, apiKey) => request("model.login", { providerId, apiKey }),
    respondPermission: (requestId, action) => request("permission.respond", { requestId, action }),
    createTerminal: (cwd) => request("terminal.create", { cwd }),
    terminalInput: (id, data) => void request("terminal.input", { id, data }),
    terminalResize: (id, cols, rows) => void request("terminal.resize", { id, cols, rows }),
    killTerminal: (id) => request("terminal.kill", { id }),
    gitStatus: (cwd) => request("git.status", { cwd }),
    gitDiff: (cwd, paths) => request("git.diff", { cwd, paths }),
    gitCommit: (cwd, message) => request("git.commit", { cwd, message }),
    gitBranches: (cwd) => request("git.branches", { cwd }),
    gitCheckout: (cwd, branch) => request("git.checkout", { cwd, branch }),
    gitListWorktrees: (cwd) => request("git.worktrees", { cwd }),
    gitCreateWorktree: (cwd, path, branch) => request("git.create_worktree", { cwd, path, branch }),
    extList: (cwd) => request("ext.list", { cwd }),
    extInstall: (cwd, source) => request("ext.install", { cwd, source }),
    extUninstall: (cwd, source) => request("ext.uninstall", { cwd, source }),
    extToggle: (cwd, source, enabled) => request("ext.toggle", { cwd, source, enabled }),
    extSearch: (registry) => request("ext.search", { registry }),
    getSettings: () => request("settings.get"),
    setSettings: (patch) => request("settings.set", { patch }),
    getCapabilities: () => request("runtime.capabilities"),
    onSessionEvent,
    onSessionState,
    onSessionCreated,
    onSessionDeleted,
    onPermissionRequest,
    onTerminalData,
    onTerminalExit,
    onGitChanged,
    onModelsChanged,
  };
}
