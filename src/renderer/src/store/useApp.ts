// Zustand store — the single source of renderer state, fed by the preload IPC
// surface and reduced via the pure transcript reducer.

import { create } from "zustand";
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
} from "@shared/types";
import type { AppSettings } from "@shared/types";
import {
  initialTranscript,
  reduceTranscript,
  type TranscriptState,
} from "../lib/session-reducer";

export type View = "chat" | "settings" | "extensions";
export type PanelKind = "terminal" | "git";

interface PermissionItem extends PermissionRequest {
  requestId: string;
}

interface AppStore {
  ready: boolean;
  view: View;
  projects: ProjectInfo[];
  currentProject: ProjectInfo | null;
  sessions: SessionMeta[];
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
  activePanel: PanelKind | null;
  panelHeight: number;

  init: () => Promise<void>;
  setView: (v: View) => void;
  openProject: (path?: string) => Promise<void>;
  removeProject: (path: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
  createSession: (name?: string) => Promise<void>;
  openSession: (file: string) => Promise<void>;
  setActiveSession: (sessionId: string) => Promise<void>;
  closeSessionTab: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, name: string) => Promise<void>;
  deleteSession: (file: string) => Promise<void>;

  prompt: (text: string) => Promise<void>;
  steer: (text: string) => Promise<void>;
  followUp: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  continueSession: () => Promise<void>;

  loadModels: () => Promise<void>;
  setModel: (providerId: string, modelId: string) => Promise<void>;
  setThinkingLevel: (level: string) => Promise<void>;
  setApiKey: (providerId: string, apiKey: string) => Promise<void>;

  respondPermission: (requestId: string, action: string) => void;
  dismissPermission: (requestId: string) => void;

  createTerminal: () => Promise<void>;
  killTerminal: (id: string) => Promise<void>;
  refreshGit: () => Promise<void>;
  commit: (message: string) => Promise<void>;
  togglePanel: (kind: PanelKind) => void;
  closePanel: () => void;
  setPanelHeight: (height: number) => void;

  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

const api = () => window.lattice;

export const useApp = create<AppStore>((set, get) => ({
  ready: false,
  view: "chat",
  projects: [],
  currentProject: null,
  sessions: [],
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
  activePanel: null,
  panelHeight: 280,

  init: async () => {
    // Wire event subscriptions once.
    api().onSessionEvent(({ sessionId, event }) => {
      const s = get();
      if (sessionId !== s.activeSessionId) return;
      const next = reduceTranscript(s.transcript, event);
      set({ transcript: next });
      // Refresh git status when the agent settles, so file changes surface
      // in the conversation (Codex-style diff integration).
      if (event.type === "agent_settled" && s.currentProject) {
        void s.refreshGit();
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
      if (s.currentProject) s.refreshSessions();
    });

    api().onPermissionRequest((payload) => {
      const p = payload as unknown as PermissionItem;
      set({ permissions: [...get().permissions, p] });
    });

    api().onTerminalData(({ id, data }) => {
      window.dispatchEvent(new CustomEvent("lattice-term-data", { detail: { id, data } }));
    });

    api().onTerminalExit(({ id }) => {
      set({ terminals: get().terminals.filter((t) => t.id !== id) });
    });

    const [projects, settings] = await Promise.all([api().getProjects(), api().getSettings()]);
    set({ projects, settings, ready: true });

    const theme = settings.theme;
    document.documentElement.dataset.theme = theme;
    applyAppearance(settings);
  },

  setView: (v) => set({ view: v }),

  openProject: async (path) => {
    const project = await api().openProject(path);
    if (!project) return;
    set({ currentProject: project, view: "chat", activeSessionId: null, openSessionIds: [], transcript: { ...initialTranscript } });
    await get().refreshSessions();
    await get().refreshGit();
  },

  removeProject: async (path) => {
    await api().removeProject(path);
    set({ projects: get().projects.filter((p) => p.path !== path) });
  },

  refreshSessions: async () => {
    const { currentProject } = get();
    if (!currentProject) return;
    const sessions = await api().getSessions(currentProject.path);
    set({ sessions });
  },

  createSession: async (name) => {
    const { currentProject } = get();
    if (!currentProject) return;
    const result = (await api().createSession({
      projectId: currentProject.id,
      cwd: currentProject.path,
      name,
    })) as { sessionId: string; state: SessionState };
    await get().refreshSessions();
    await get().setActiveSession(result.sessionId);
    set({ openSessionIds: [...new Set([...get().openSessionIds, result.sessionId])] });
  },

  openSession: async (file) => {
    const { currentProject } = get();
    if (!currentProject) return;
    const result = (await api().openSession({
      projectId: currentProject.id,
      cwd: currentProject.path,
      file,
    })) as { sessionId: string; state: SessionState };
    await get().setActiveSession(result.sessionId);
    set({ openSessionIds: [...new Set([...get().openSessionIds, result.sessionId])] });
  },

  setActiveSession: async (sessionId) => {
    const [state, messages] = await Promise.all([
      api().getSessionState(sessionId),
      api().getSessionMessages(sessionId),
    ]);
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
    const remaining = s.openSessionIds.filter((id) => id !== sessionId);
    // If closing the active tab, switch to the last remaining one.
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
    await get().refreshSessions();
  },

  deleteSession: async (file) => {
    await api().deleteSession(file);
    await get().refreshSessions();
  },

  prompt: async (text) => {
    const id = get().activeSessionId;
    if (!id) return;
    // Auto-name: derive a tab title from the first prompt if unnamed.
    const st = get().sessionState;
    if (st?.sessionId === id && !st.name) {
      void get().renameSession(id, autoName(text));
    }
    await api().prompt(id, text);
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
    set({ providers, models });
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
  },

  setApiKey: async (providerId, apiKey) => {
    await api().login(providerId, apiKey);
    await get().loadModels();
  },

  respondPermission: (requestId, action) => {
    api().respondPermission(requestId, action);
    set({ permissions: get().permissions.filter((p) => p.requestId !== requestId) });
  },

  dismissPermission: (requestId) => {
    api().respondPermission(requestId, "deny-once");
    set({ permissions: get().permissions.filter((p) => p.requestId !== requestId) });
  },

  createTerminal: async () => {
    const { currentProject } = get();
    const cwd = currentProject?.path ?? "";
    const meta = (await api().createTerminal(cwd)) as TerminalMeta;
    set({ terminals: [...get().terminals, meta], activePanel: "terminal" });
  },

  killTerminal: async (id) => {
    await api().killTerminal(id);
    set({ terminals: get().terminals.filter((t) => t.id !== id) });
  },

  refreshGit: async () => {
    const { currentProject } = get();
    if (!currentProject) return;
    try {
      const status = (await api().gitStatus(currentProject.path)) as GitStatus;
      set({ gitStatus: status });
    } catch {
      set({ gitStatus: null });
    }
  },

  commit: async (message) => {
    const { currentProject } = get();
    if (!currentProject) return;
    await api().gitCommit(currentProject.path, message);
    await get().refreshGit();
  },

  togglePanel: (kind) =>
    set({ activePanel: get().activePanel === kind ? null : kind }),

  closePanel: () => set({ activePanel: null }),

  setPanelHeight: (height) => set({ panelHeight: Math.max(120, Math.min(height, 600)) }),

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

/** Derive a short session title from the first user prompt (Codex-style). */
function autoName(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, " ");
  const words = cleaned.split(" ").slice(0, 6).join(" ");
  return words.length > 40 ? words.slice(0, 40).trimEnd() + "…" : words;
}
