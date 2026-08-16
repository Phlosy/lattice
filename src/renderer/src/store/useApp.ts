// Zustand store — the single source of renderer state, fed by the preload IPC
// surface and reduced via the pure transcript reducer. Conversations are the
// UI's view model over Pi's raw session metas + Lattice's conversation meta
// (project association, archived flag, last-opened time).

import { create } from "zustand";
import type {
  AgentMessage,
  Conversation,
  ConversationMeta,
  GitStatus,
  ModelInfo,
  PermissionRequest,
  ProjectInfo,
  ProviderInfo,
  SessionMeta,
  SessionState,
  TerminalMeta,
} from "@shared/types";
import type { AppSettings } from "@shared/types";
import {
  initialTranscript,
  reduceTranscript,
  type TranscriptState,
} from "../lib/session-reducer";
import {
  autoTitle,
  deriveConversations,
  loadConversationMeta,
  saveConversationMeta,
  sortConversations,
} from "../lib/conversations";
import { appendTerminalData, clearTerminalBuffer } from "../lib/terminal-buffer";
import { normalizeModel } from "../lib/model";
import { workbenchCommands } from "../workbench/commands";

export type View = "chat" | "settings" | "extensions";
export type PanelKind = "terminal" | "git";

let sessionNavigationGeneration = 0;
let sessionNavigationQueue: Promise<void> = Promise.resolve();

function enqueueSessionNavigation(
  task: (generation: number) => Promise<void>,
): Promise<void> {
  const generation = ++sessionNavigationGeneration;
  const run = sessionNavigationQueue.catch(() => {}).then(async () => {
    if (generation !== sessionNavigationGeneration) return;
    await task(generation);
  });
  sessionNavigationQueue = run;
  return run;
}

interface PermissionItem extends PermissionRequest {
  requestId: string;
}

interface AppStore {
  ready: boolean;
  view: View;
  projects: ProjectInfo[];
  currentProject: ProjectInfo | null;
  sessions: SessionMeta[];
  conversations: Conversation[];
  conversationMeta: Record<string, ConversationMeta>;
  showArchived: boolean;
  activeSessionId: string | null;
  openSessionIds: string[];
  sessionState: SessionState | null;
  transcript: TranscriptState;
  providers: ProviderInfo[];
  models: ModelInfo[];
  settings: AppSettings;
  permissions: PermissionItem[];
  terminals: TerminalMeta[];
  gitStatus: GitStatus | null;
  sidebarCollapsed: boolean;

  init: () => Promise<void>;
  setView: (v: View) => void;
  openProject: (path?: string) => Promise<void>;
  removeProject: (path: string) => Promise<void>;
  refreshConversations: () => Promise<void>;
  createSession: (name?: string, opts?: { projectId?: string | null }) => Promise<void>;
  createStandaloneSession: () => Promise<void>;
  openSession: (file: string) => Promise<void>;
  setActiveSession: (sessionId: string) => Promise<void>;
  closeSessionTab: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, name: string) => Promise<void>;
  deleteSession: (file: string) => Promise<void>;
  archiveConversation: (sessionId: string) => Promise<void>;
  unarchiveConversation: (sessionId: string) => Promise<void>;
  moveConversation: (sessionId: string, projectId: string | null) => Promise<void>;
  setShowArchived: (show: boolean) => void;

  prompt: (text: string, images?: Array<{ type: "image"; data: string; mimeType: string }>) => Promise<void>;
  steer: (text: string) => Promise<void>;
  followUp: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  continueSession: () => Promise<void>;

  loadModels: () => Promise<void>;
  setModel: (providerId: string, modelId: string) => Promise<void>;
  setThinkingLevel: (level: string) => Promise<void>;
  setApiKey: (providerId: string, apiKey: string) => Promise<void>;

  respondPermission: (requestId: string, action: string) => Promise<void>;
  dismissPermission: (requestId: string) => Promise<void>;

  createTerminal: () => Promise<void>;
  killTerminal: (id: string) => Promise<void>;
  refreshGit: () => Promise<void>;
  commit: (message: string) => Promise<void>;
  togglePanel: (kind: PanelKind) => void;
  toggleSidebar: () => void;

  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

const api = () => window.lattice;
let subscriptionsWired = false;

/** Re-derive the UI conversation list from raw sessions + meta + projects. */
function syncConversations(
  get: () => AppStore,
  set: (p: Partial<AppStore>) => void,
): void {
  set({
    conversations: sortConversations(
      deriveConversations(get().sessions, get().projects, get().conversationMeta),
    ),
  });
}

function patchConversationMeta(
  get: () => AppStore,
  set: (p: Partial<AppStore>) => void,
  sessionId: string,
  patch: ConversationMeta,
): void {
  const meta = {
    ...get().conversationMeta,
    [sessionId]: { ...get().conversationMeta[sessionId], ...patch },
  };
  saveConversationMeta(meta);
  set({ conversationMeta: meta });
  syncConversations(get, set);
}

export const useApp = create<AppStore>((set, get) => ({
  ready: false,
  view: "chat",
  projects: [],
  currentProject: null,
  sessions: [],
  conversations: [],
  conversationMeta: {},
  showArchived: false,
  activeSessionId: null,
  openSessionIds: [],
  sessionState: null,
  transcript: { ...initialTranscript },
  providers: [],
  models: [],
  settings: {
    theme: "dark",
    locale: "en",
    fontSize: 13,
    accent: "#4f8cff",
    sandboxMode: "none",
    autoApproveReadOnly: true,
  },
  permissions: [],
  terminals: [],
  gitStatus: null,
  sidebarCollapsed: false,

  init: async () => {
    // React StrictMode mounts effects twice in development. Keep native event
    // subscriptions process-wide so controls do not fire duplicate actions.
    if (!subscriptionsWired) {
      subscriptionsWired = true;
      api().onSessionEvent(({ sessionId, event }) => {
        const s = get();
        if (sessionId !== s.activeSessionId) return;
        const next = reduceTranscript(s.transcript, event);
        set({ transcript: next });
        // Refresh git status when the agent settles, so file changes surface
        // in the conversation (Codex-style diff integration).
        if (event.type === "agent_settled" && s.currentProject) {
          void Promise.all([s.refreshGit(), s.refreshConversations()]);
        }
      });

      api().onSessionState((state) => {
        const s = get();
        const st = state as unknown as SessionState;
        if (st.sessionId !== s.activeSessionId) return;
        set({ sessionState: st });
      });

      api().onSessionCreated(() => {
        const s = get();
        void s.refreshConversations();
      });

      api().onPermissionRequest((payload) => {
        const p = payload as unknown as PermissionItem;
        set({ permissions: [...get().permissions, p] });
      });

      api().onTerminalData(({ id, data }) => {
        appendTerminalData(id, data);
        window.dispatchEvent(new CustomEvent("lattice-term-data", { detail: { id, data } }));
      });

      api().onTerminalExit(({ id }) => {
        clearTerminalBuffer(id);
        set({ terminals: get().terminals.filter((t) => t.id !== id) });
      });

      api().onModelsChanged(() => void get().loadModels());
      api().onGitChanged(() => void get().refreshGit());
      api().onSessionDeleted(() => void get().refreshConversations());
    }

    const [projects, loadedSettings] = await Promise.all([api().getProjects(), api().getSettings()]);
    const settings = { ...get().settings, ...loadedSettings };
    set({ projects, settings, conversationMeta: loadConversationMeta(), ready: true });
    applyAppearance(settings);
    void get().refreshConversations();
  },

  setView: (v) => set({ view: v }),

  openProject: async (path) => {
    const project = await api().openProject(path);
    if (!project) return;
    if (get().currentProject?.path === project.path) {
      set({ view: "chat" });
      return;
    }
    await Promise.allSettled(get().terminals.map((terminal) => api().killTerminal(terminal.id)));
    set({
      projects: [project, ...get().projects.filter((item) => item.path !== project.path)],
      currentProject: project,
      view: "chat",
      activeSessionId: null,
      openSessionIds: [],
      sessionState: null,
      transcript: { ...initialTranscript },
      permissions: [],
      terminals: [],
      gitStatus: null,
    });
    await get().refreshConversations();
    await get().refreshGit();
  },

  removeProject: async (path) => {
    await api().removeProject(path);
    set({ projects: get().projects.filter((p) => p.path !== path) });
    syncConversations(get, set);
  },

  refreshConversations: async () => {
    const sessions = (await api().getSessions("")) as SessionMeta[];
    set({ sessions });
    syncConversations(get, set);
  },

  createSession: async (name, opts) => {
    if (get().transcript.running) return;
    const currentProject = get().currentProject;
    const targetPath =
      opts?.projectId !== undefined ? opts.projectId : (currentProject?.path ?? null);
    return enqueueSessionNavigation(async (generation) => {
      // Desktop scopes new sessions by the sidecar working directory; remote
      // providers scope by the cwd argument instead.
      const setCwd = api().setWorkspaceCwd;
      if (setCwd) {
        await setCwd(targetPath ?? "");
      }
      const result = (await api().createSession({
        projectId: targetPath ?? "",
        cwd: targetPath ?? "",
        name,
      })) as { sessionId: string; cwd: string; file?: string; state: SessionState };
      patchConversationMeta(get, set, result.sessionId, {
        projectId: targetPath,
        archived: false,
        lastOpenedAt: Date.now(),
      });
      await get().refreshConversations();
      if (generation !== sessionNavigationGeneration) return;
      set({
        activeSessionId: result.sessionId,
        sessionState: result.state,
        transcript: { ...initialTranscript },
        openSessionIds: [...new Set([...get().openSessionIds, result.sessionId])],
      });
    });
  },

  createStandaloneSession: async () => {
    await get().createSession(undefined, { projectId: null });
  },

  openSession: async (file) => {
    const currentProject = get().currentProject;
    const target = get().conversations.find((c) => c.file === file);
    if (
      !currentProject ||
      (get().transcript.running && target?.id !== get().activeSessionId)
    ) return;
    return enqueueSessionNavigation(async (generation) => {
      const result = (await api().openSession({
        projectId: currentProject.id,
        cwd: currentProject.path,
        file,
      })) as { sessionId: string; state: SessionState };
      if (generation !== sessionNavigationGeneration) return;
      const messages = await api().getSessionMessages(result.sessionId);
      if (generation !== sessionNavigationGeneration) return;
      patchConversationMeta(get, set, result.sessionId, { lastOpenedAt: Date.now() });
      set({
        activeSessionId: result.sessionId,
        sessionState: result.state,
        transcript: {
          ...initialTranscript,
          messages: messages as AgentMessage[],
          running: result.state.isStreaming,
        },
        openSessionIds: [...new Set([...get().openSessionIds, result.sessionId])],
      });
    });
  },

  setActiveSession: async (sessionId) => {
    if (get().transcript.running && sessionId !== get().activeSessionId) return;
    const meta = get().conversations.find((c) => c.id === sessionId);
    if (meta?.file && get().activeSessionId !== sessionId) {
      await get().openSession(meta.file);
      return;
    }
    const [state, messages] = await Promise.all([
      api().getSessionState(sessionId),
      api().getSessionMessages(sessionId),
    ]);
    patchConversationMeta(get, set, sessionId, { lastOpenedAt: Date.now() });
    set({
      activeSessionId: sessionId,
      sessionState: state as SessionState,
      openSessionIds: [...new Set([...get().openSessionIds, sessionId])],
      transcript: {
        ...initialTranscript,
        messages: messages as AgentMessage[],
        running: (state as SessionState).isStreaming,
      },
    });
  },

  closeSessionTab: async (sessionId) => {
    const s = get();
    if (s.transcript.running && s.activeSessionId === sessionId) return;
    const remaining = s.openSessionIds.filter((id) => id !== sessionId);
    if (s.activeSessionId === sessionId) {
      const next = remaining[remaining.length - 1];
      set({ openSessionIds: remaining });
      if (next) {
        await get().setActiveSession(next);
      } else {
        set({ activeSessionId: null, transcript: { ...initialTranscript }, sessionState: null });
      }
    } else {
      set({ openSessionIds: remaining });
    }
  },

  renameSession: async (sessionId, name) => {
    await api().renameSession(sessionId, name);
    set({
      sessions: get().sessions.map((session) =>
        session.id === sessionId ? { ...session, name, updatedAt: Date.now() } : session,
      ),
      sessionState:
        get().sessionState?.sessionId === sessionId
          ? { ...get().sessionState!, name }
          : get().sessionState,
    });
    syncConversations(get, set);
    await get().refreshConversations();
  },

  deleteSession: async (file) => {
    const deleted = get().conversations.find((c) => c.file === file);
    await api().deleteSession(file);
    const meta = { ...get().conversationMeta };
    if (deleted) delete meta[deleted.id];
    saveConversationMeta(meta);
    const openSessionIds = deleted
      ? get().openSessionIds.filter((id) => id !== deleted.id)
      : get().openSessionIds;
    set({
      conversationMeta: meta,
      sessions: get().sessions.filter((s) => s.file !== file),
      openSessionIds,
    });
    syncConversations(get, set);
    if (deleted?.id === get().activeSessionId) {
      const next = openSessionIds[openSessionIds.length - 1];
      set({ activeSessionId: null, sessionState: null, transcript: { ...initialTranscript } });
      if (next) await get().setActiveSession(next);
    }
    await get().refreshConversations();
  },

  archiveConversation: async (sessionId) => {
    patchConversationMeta(get, set, sessionId, { archived: true });
  },

  unarchiveConversation: async (sessionId) => {
    patchConversationMeta(get, set, sessionId, { archived: false });
  },

  moveConversation: async (sessionId, projectId) => {
    patchConversationMeta(get, set, sessionId, { projectId });
  },

  setShowArchived: (show) => set({ showArchived: show }),

  prompt: async (text, images) => {
    const id = get().activeSessionId;
    if (!id) return;
    // Auto-title: derive a short title from the first prompt if unnamed.
    const st = get().sessionState;
    if (st?.sessionId === id && !st.name) {
      void get().renameSession(id, autoTitle(text));
    }
    await api().prompt(id, text, images);
  },

  steer: async (text) => {
    const id = get().activeSessionId;
    if (!id) return;
    await api().steer(id, text);
  },

  followUp: async (text) => {
    const id = get().activeSessionId;
    if (!id) return;
    await api().followUp(id, text);
  },

  abort: async () => {
    const id = get().activeSessionId;
    if (!id) return;
    await api().abort(id);
  },

  continueSession: async () => {
    const id = get().activeSessionId;
    if (!id) return;
    await api().continueSession(id);
  },

  loadModels: async () => {
    const [providers, models] = await Promise.all([api().getProviders(), api().getModels()]);
    set({ providers, models: (models as ModelInfo[]).map(normalizeModel) });
  },

  setModel: async (providerId, modelId) => {
    const id = get().activeSessionId;
    if (!id) return;
    await api().setModel(id, providerId, modelId);
    const state = await api().getSessionState(id);
    set({ sessionState: state as SessionState });
  },

  setThinkingLevel: async (level) => {
    const id = get().activeSessionId;
    if (!id) return;
    await api().setThinkingLevel(id, level);
    const state = await api().getSessionState(id);
    set({ sessionState: state as SessionState });
  },

  setApiKey: async (providerId, apiKey) => {
    if (!apiKey.trim()) return;
    await api().login(providerId, apiKey.trim());
    await get().loadModels();
  },

  respondPermission: async (requestId, action) => {
    await api().respondPermission(requestId, action);
    set({ permissions: get().permissions.filter((permission) => permission.requestId !== requestId) });
  },

  dismissPermission: async (requestId) => {
    await api().respondPermission(requestId, "deny-once");
    set({ permissions: get().permissions.filter((permission) => permission.requestId !== requestId) });
  },

  createTerminal: async () => {
    const { currentProject } = get();
    const cwd = currentProject?.path ?? "";
    const meta = (await api().createTerminal(cwd)) as TerminalMeta;
    set({ terminals: [...get().terminals, meta] });
    workbenchCommands.openTerminal(meta.id);
  },

  killTerminal: async (id) => {
    await api().killTerminal(id);
    clearTerminalBuffer(id);
    set({ terminals: get().terminals.filter((terminal) => terminal.id !== id) });
  },

  refreshGit: async () => {
    const { currentProject } = get();
    if (!currentProject) return;
    try {
      const status = (await api().gitStatus(currentProject.path)) as GitStatus;
      if (get().currentProject?.path === currentProject.path) set({ gitStatus: status });
    } catch {
      if (get().currentProject?.path === currentProject.path) set({ gitStatus: null });
    }
  },

  commit: async (message) => {
    const { currentProject } = get();
    if (!currentProject) return;
    await api().gitCommit(currentProject.path, message);
    await get().refreshGit();
  },

  togglePanel: (kind) => {
    workbenchCommands.openView(kind);
  },

  toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),

  updateSettings: async (patch) => {
    const settings = (await api().setSettings(patch)) as AppSettings;
    set({ settings });
    applyAppearance(settings);
  },
}));

function applyAppearance(settings: AppSettings): void {
  document.documentElement.dataset.theme = settings.theme;
  // CSS zoom scales the whole UI; Chromium-only (Electron), non-standard but
  // a pragmatic way to honor the user's font-size preference globally.
  document.body.style.zoom = String(settings.fontSize / 13);
}
