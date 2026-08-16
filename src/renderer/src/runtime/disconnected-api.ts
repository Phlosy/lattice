// Disconnected LatticeApi — used when no runtime is available (browser without
// Tauri, or mobile without a configured remote). Every method is a benign no-op
// or empty default; events return no-op unsubscribers.

import type { LatticeApi } from "../../../shared/api";

const noop = () => () => {};

export function createDisconnectedApi(): LatticeApi {
  const defaultSettings = {
    theme: "dark" as const,
    locale: "en" as const,
    fontSize: 13,
    accent: "#4f8cff",
    sandboxMode: "none" as const,
    autoApproveReadOnly: true,
  };
  return {
    appInfo: () => Promise.resolve({ name: "Lattice", version: "1.0.0", platform: "browser" }),
    openProject: () => Promise.resolve(null),
    getProjects: () => Promise.resolve([]),
    removeProject: () => Promise.resolve(true),
    getSessions: () => Promise.resolve([]),
    createSession: () => Promise.resolve({ sessionId: "", cwd: "", state: null as never }),
    openSession: () => Promise.resolve({ sessionId: "", cwd: "", state: null as never }),
    renameSession: () => Promise.resolve(true),
    deleteSession: () => Promise.resolve(true),
    getSessionState: () => Promise.resolve(null as never),
    getSessionMessages: () => Promise.resolve([]),
    prompt: () => Promise.resolve(true),
    steer: () => Promise.resolve(true),
    followUp: () => Promise.resolve(true),
    abort: () => Promise.resolve(true),
    continueSession: () => Promise.resolve(true),
    getProviders: () => Promise.resolve([]),
    getModels: () => Promise.resolve([]),
    setModel: () => Promise.resolve(undefined),
    setThinkingLevel: () => Promise.resolve(true),
    login: () => Promise.resolve(true),
    respondPermission: () => Promise.resolve(true),
    createTerminal: () => Promise.resolve({ id: "", cwd: "", title: "" }),
    terminalInput: () => {},
    terminalResize: () => {},
    killTerminal: () => Promise.resolve(true),
    gitStatus: () => Promise.resolve(null as never),
    gitDiff: () => Promise.resolve(""),
    gitCommit: () => Promise.resolve({ hash: "", message: "" }),
    gitBranches: () => Promise.resolve({ current: "", all: [] }),
    gitCheckout: () => Promise.resolve(true),
    gitListWorktrees: () => Promise.resolve([]),
    gitCreateWorktree: () => Promise.resolve(true),
    extList: () => Promise.resolve([]),
    extInstall: () => Promise.resolve(true),
    extUninstall: () => Promise.resolve(true),
    extToggle: () => Promise.resolve(true),
    extSearch: () => Promise.resolve([]),
    listFiles: () => Promise.resolve([]),
    getSettings: () => Promise.resolve(defaultSettings),
    setSettings: () => Promise.resolve(defaultSettings),
    onSessionEvent: noop,
    onSessionState: noop,
    onSessionCreated: noop,
    onSessionDeleted: noop,
    onPermissionRequest: noop,
    onTerminalData: noop,
    onTerminalExit: noop,
    onGitChanged: noop,
    onModelsChanged: noop,
  };
}
