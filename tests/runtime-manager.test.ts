import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/renderer/src/runtime/provider", () => ({
  createProvider: vi.fn(() => ({
    api: { kind: "mock" },
    info: { name: "mock", provider: "mock", location: "local" },
    capabilities: { chat: true },
  })),
  createDisconnectedRuntime: () => ({}),
}));

import { RuntimeManager } from "../src/renderer/src/runtime/manager";
import { createProvider } from "../src/renderer/src/runtime/provider";

const mockedCreateProvider = vi.mocked(createProvider);

describe("RuntimeManager", () => {
  beforeEach(() => mockedCreateProvider.mockClear());

  it("connect falls back to bundled when no explicit profile", () => {
    const m = new RuntimeManager();
    const resolved = m.connect(undefined, null);
    expect(m.getState()).toBe("connected");
    expect(resolved.api).toEqual({ kind: "mock" });
    const arg = mockedCreateProvider.mock.calls[0]?.[0] as { name?: string } | undefined;
    expect(arg?.name).toBe("Built-in Pi");
  });

  it("connect uses an explicit remote profile", () => {
    const m = new RuntimeManager();
    const remote = { id: "r", name: "Mac Studio", provider: { type: "remote", url: "wss://x" } } as const;
    m.connect(remote as never, null);
    const arg = mockedCreateProvider.mock.calls[0]?.[0] as { provider?: { type?: string } } | undefined;
    expect(arg?.provider?.type).toBe("remote");
  });

  it("subscribes to state transitions", () => {
    const m = new RuntimeManager();
    const seen: string[] = [];
    m.subscribe((s) => seen.push(s));
    m.connect(undefined, null);
    m.disconnect();
    expect(seen).toEqual(["connecting", "connected", "disconnected"]);
  });

  it("disconnect clears the api", () => {
    const m = new RuntimeManager();
    m.connect(undefined, null);
    m.disconnect();
    expect(m.getApi()).toBeNull();
    expect(m.getCapabilities()).toBeNull();
  });
});
