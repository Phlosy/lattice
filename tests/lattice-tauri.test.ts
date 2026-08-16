import { beforeEach, describe, expect, it, vi } from "vitest";

const { openDialog } = vi.hoisted(() => ({ openDialog: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openDialog }));

import { createLatticeTauri } from "../src/renderer/src/lattice-tauri";

describe("createLatticeTauri", () => {
  const invoke = vi.fn();
  const listeners = new Map<string, (event: { payload: unknown }) => void>();
  const unlisten = vi.fn();

  beforeEach(() => {
    invoke.mockReset();
    listeners.clear();
    unlisten.mockReset();
    openDialog.mockReset();
    Object.assign(globalThis, {
      window: {
        __TAURI__: {
          core: { invoke },
          event: {
            listen: vi.fn(async (event: string, cb: (event: { payload: unknown }) => void) => {
              listeners.set(event, cb);
              return unlisten;
            }),
          },
        },
      },
    });
  });

  it("implements every API member without a production stub fallback", () => {
    const api = createLatticeTauri();
    const methods = [
      "appInfo", "openProject", "getProjects", "removeProject", "getSessions",
      "createSession", "setWorkspaceCwd", "openSession", "renameSession", "deleteSession",
      "getSessionState", "getSessionMessages", "prompt", "listFiles", "steer",
      "followUp", "abort", "continueSession", "getProviders", "getModels",
      "setModel", "setThinkingLevel", "login", "respondPermission",
      "createTerminal", "terminalInput", "terminalResize", "killTerminal",
      "gitStatus", "gitDiff", "gitCommit", "gitBranches", "gitCheckout",
      "gitListWorktrees", "gitCreateWorktree", "extList", "extInstall",
      "extUninstall", "extToggle", "extSearch", "getSettings", "setSettings",
      "getCapabilities",
      "onSessionEvent", "onSessionState", "onSessionCreated", "onSessionDeleted",
      "onPermissionRequest", "onTerminalData", "onTerminalExit", "onGitChanged",
      "onModelsChanged",
    ];
    expect(Object.keys(api).sort()).toEqual(methods.sort());
    for (const method of methods) expect(typeof api[method as keyof typeof api]).toBe("function");
  });

  it("forwards settings patches and prompt images with Tauri argument names", async () => {
    invoke.mockResolvedValue(true);
    const api = createLatticeTauri();
    await api.setSettings({ locale: "zh" });
    await api.prompt("s1", "hello", [{ type: "image", data: "abc", mimeType: "image/png" }]);
    expect(invoke).toHaveBeenNthCalledWith(1, "set_settings", { patch: { locale: "zh" } });
    expect(invoke).toHaveBeenNthCalledWith(2, "pi_prompt", {
      text: "hello",
      images: [{ type: "image", data: "abc", mimeType: "image/png" }],
    });
  });

  it("uses the folder dialog and normalizes Git status", async () => {
    openDialog.mockResolvedValue("/tmp/demo");
    invoke.mockImplementation(async (command: string) => {
      if (command === "open_project") return { path: "/tmp/demo", name: "demo" };
      if (command === "git_status") return {
        branch: "main", clean: false, added: 2, removed: 1,
        files: [{ path: "a.ts", status: "M", added: 2, removed: 1 }],
      };
    });
    const api = createLatticeTauri();
    const project = await api.openProject();
    const status = await api.gitStatus("/tmp/demo");
    expect(project?.path).toBe("/tmp/demo");
    expect(status.files[0]).toMatchObject({ path: "a.ts", index: "M", workingDir: "M" });
    expect(invoke).toHaveBeenCalledWith("open_project", { path: "/tmp/demo" });
  });

  it("normalizes Pi RPC session state fields", async () => {
    invoke.mockResolvedValue({
      sessionId: "s1",
      sessionFile: "/tmp/pi-tauri-sessions/s1.jsonl",
      sessionName: "Demo",
      thinkingLevel: "high",
      isStreaming: false,
      isCompacting: false,
      messageCount: 2,
      pendingMessageCount: 1,
    });
    const api = createLatticeTauri();
    const state = await api.getSessionState("s1");
    expect(state).toMatchObject({
      sessionId: "s1",
      file: "/tmp/pi-tauri-sessions/s1.jsonl",
      name: "Demo",
      thinkingLevel: "high",
      pendingSteering: 0,
      pendingFollowUp: 1,
    });
  });

  it("accepts canonical object-form extension registries", async () => {
    invoke.mockResolvedValue(JSON.stringify({ packages: [{ id: "demo" }] }));
    const api = createLatticeTauri();
    await expect(api.extSearch("/tmp/registry.json")).resolves.toEqual([{ id: "demo" }]);
  });

  it("does not poll session state for streaming token events", async () => {
    invoke.mockResolvedValue({
      sessionId: "s1",
      thinkingLevel: "medium",
      isStreaming: false,
      isCompacting: false,
      messageCount: 0,
    });
    const api = createLatticeTauri();
    await api.getSessionState("s1");
    invoke.mockClear();
    const handler = vi.fn();
    api.onSessionState(handler);
    await Promise.resolve();
    listeners.get("pi-event")?.({ payload: { type: "message_update" } });
    await Promise.resolve();
    expect(invoke).not.toHaveBeenCalled();
    listeners.get("pi-event")?.({ payload: { type: "agent_settled" } });
    await Promise.resolve();
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("get_session_state", undefined);
  });

  it("maps session ids to files and releases native event listeners", async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === "session_list") return [{
        id: "s1", file: "/tmp/pi-tauri-sessions/s1.jsonl", cwd: "/tmp/p",
        createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z",
        messageCount: 1,
      }];
      if (command === "session_messages") return [];
    });
    const api = createLatticeTauri();
    await api.getSessions("/tmp/p");
    await api.getSessionMessages("s1");
    expect(invoke).toHaveBeenLastCalledWith("session_messages", {
      file: "/tmp/pi-tauri-sessions/s1.jsonl",
    });

    const dispose = api.onModelsChanged(() => {});
    await Promise.resolve();
    dispose();
    expect(unlisten).toHaveBeenCalledOnce();
  });
});
