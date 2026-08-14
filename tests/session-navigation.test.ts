import { afterEach, describe, expect, it, vi } from "vitest";
import { initialTranscript } from "../src/renderer/src/lib/session-reducer";
import { useApp } from "../src/renderer/src/store/useApp";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const project = { id: "project", name: "Project", path: "/repo", isGit: true };
const sessions = [
  {
    id: "a",
    name: "A",
    projectId: project.id,
    cwd: project.path,
    file: "/sessions/a.jsonl",
    createdAt: 1,
    updatedAt: 1,
    messageCount: 0,
  },
  {
    id: "b",
    name: "B",
    projectId: project.id,
    cwd: project.path,
    file: "/sessions/b.jsonl",
    createdAt: 2,
    updatedAt: 2,
    messageCount: 0,
  },
];

function state(sessionId: string) {
  return {
    sessionId,
    thinkingLevel: "medium" as const,
    isStreaming: false,
    isCompacting: false,
    messageCount: 0,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("session navigation", () => {
  it("coalesces rapid switches so the renderer and runtime end on the latest session", async () => {
    const first = deferred<{ sessionId: string; state: ReturnType<typeof state> }>();
    const openSession = vi.fn(({ file }: { file: string }) =>
      file.endsWith("a.jsonl")
        ? first.promise
        : Promise.resolve({ sessionId: "b", state: state("b") }),
    );
    const getSessionMessages = vi.fn(async (id: string) => [
      { id: `message-${id}`, role: "user", content: id, timestamp: 1 },
    ]);
    vi.stubGlobal("window", { lattice: { openSession, getSessionMessages } });
    useApp.setState({
      currentProject: project,
      sessions,
      activeSessionId: null,
      openSessionIds: [],
      sessionState: null,
      transcript: { ...initialTranscript },
    });

    const switchA = useApp.getState().openSession(sessions[0].file!);
    await Promise.resolve();
    const switchB = useApp.getState().openSession(sessions[1].file!);
    first.resolve({ sessionId: "a", state: state("a") });
    await Promise.all([switchA, switchB]);

    expect(openSession).toHaveBeenCalled();
    expect(openSession.mock.calls.at(-1)?.[0]).toEqual({
      projectId: project.id,
      cwd: project.path,
      file: sessions[1].file,
    });
    expect(getSessionMessages).toHaveBeenCalledTimes(1);
    expect(getSessionMessages).toHaveBeenCalledWith("b");
    expect(useApp.getState().activeSessionId).toBe("b");
    expect(useApp.getState().transcript.messages[0]?.content).toBe("b");
  });

  it("does not close the active session while its agent is running", async () => {
    vi.stubGlobal("window", { lattice: {} });
    useApp.setState({
      currentProject: project,
      sessions,
      activeSessionId: "a",
      openSessionIds: ["a", "b"],
      transcript: { ...initialTranscript, running: true },
    });

    await useApp.getState().closeSessionTab("a");

    expect(useApp.getState().activeSessionId).toBe("a");
    expect(useApp.getState().openSessionIds).toEqual(["a", "b"]);
  });
});
