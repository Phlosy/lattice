import { describe, expect, it } from "vitest";
import {
  hasCapability,
  mergeCapabilities,
  missingCapabilities,
  LOCAL_CAPABILITIES,
  REMOTE_CAPABILITIES,
} from "../src/renderer/src/runtime/capabilities";
import {
  commonInstallCandidates,
  selectInstalledExecutable,
} from "../src/renderer/src/runtime/discovery";
import { resolveProfile, BUNDLED_PROFILE, INSTALLED_PROFILE } from "../src/renderer/src/runtime/profiles";
import { nextState, canConnect, connectionStatus } from "../src/renderer/src/runtime/manager";

describe("capabilities", () => {
  it("hasCapability reflects the flag", () => {
    expect(hasCapability(LOCAL_CAPABILITIES, "pty")).toBe(true);
    expect(hasCapability(LOCAL_CAPABILITIES, "remoteFilesystem")).toBe(false);
    expect(hasCapability(REMOTE_CAPABILITIES, "remoteFilesystem")).toBe(true);
  });

  it("mergeCapabilities is true-wins", () => {
    const merged = mergeCapabilities({ chat: true, pty: false }, { git: true, pty: true });
    expect(merged.chat).toBe(true);
    expect(merged.git).toBe(true);
    expect(merged.pty).toBe(true);
    expect(merged.skills).toBe(false);
  });

  it("missingCapabilities lists only wanted-but-absent", () => {
    const missing = missingCapabilities(LOCAL_CAPABILITIES, REMOTE_CAPABILITIES);
    expect(missing).toEqual(["remoteFilesystem"]);
  });
});

describe("installed executable discovery", () => {
  const common = commonInstallCandidates("/home/u");

  it("prefers explicit executable", () => {
    const found = selectInstalledExecutable("/custom/pi", [], common, (p) => p === "/custom/pi");
    expect(found).toEqual({ path: "/custom/pi", source: "explicit" });
  });

  it("falls back to PATH candidates", () => {
    const found = selectInstalledExecutable("auto", ["/usr/bin/pi"], common, (p) => p === "/usr/bin/pi");
    expect(found).toEqual({ path: "/usr/bin/pi", source: "path" });
  });

  it("falls back to common install locations", () => {
    const found = selectInstalledExecutable("auto", [], common, (p) => p === "/opt/homebrew/bin/pi");
    expect(found).toEqual({ path: "/opt/homebrew/bin/pi", source: "common" });
  });

  it("returns null when nothing exists", () => {
    expect(selectInstalledExecutable("auto", [], common, () => false)).toBeNull();
  });
});

describe("provider resolution", () => {
  it("uses explicit profile first", () => {
    const explicit = { id: "mac-studio", name: "Mac Studio", provider: { type: "remote", url: "wss://x" } } as const;
    expect(resolveProfile(explicit as never, null).id).toBe("mac-studio");
  });

  it("uses compatible installed Pi when no explicit profile", () => {
    const discovery = { executablePath: "/opt/homebrew/bin/pi", compatibility: "compatible" } as const;
    const profile = resolveProfile(undefined, discovery as never);
    expect(profile.provider).toMatchObject({ type: "installed", executable: "/opt/homebrew/bin/pi" });
  });

  it("falls back to bundled when installed is incompatible or missing", () => {
    expect(resolveProfile(undefined, null).id).toBe(BUNDLED_PROFILE.id);
    const incompatible = { executablePath: "/x/pi", compatibility: "incompatible" } as const;
    expect(resolveProfile(undefined, incompatible as never).id).toBe(BUNDLED_PROFILE.id);
  });

  it("installed and bundled share the same default pi home", () => {
    expect(INSTALLED_PROFILE.state?.piHome).toBeUndefined();
    expect(BUNDLED_PROFILE.state?.piHome).toBeUndefined();
  });
});

describe("runtime manager state machine", () => {
  it("idle → discover → connect → connected", () => {
    let s = "idle" as const;
    s = nextState(s, { type: "discover" });
    expect(s).toBe("discovering");
    s = nextState(s, { type: "connect" });
    expect(s).toBe("connecting");
    s = nextState(s, { type: "connected" });
    expect(s).toBe("connected");
  });

  it("connection loss → reconnecting → connected", () => {
    let s = nextState("connected" as const, { type: "connection-lost" });
    expect(s).toBe("reconnecting");
    s = nextState(s, { type: "reconnect" });
    expect(s).toBe("connecting");
    s = nextState(s, { type: "connected" });
    expect(s).toBe("connected");
  });

  it("maps error reasons to terminal states", () => {
    expect(nextState("connecting" as const, { type: "error", reason: "incompatible" })).toBe("incompatible");
    expect(nextState("connecting" as const, { type: "error", reason: "unavailable" })).toBe("unavailable");
    expect(nextState("connected" as const, { type: "error", reason: "crash" })).toBe("crashed");
    expect(nextState("connecting" as const, { type: "error", reason: "auth" })).toBe("disconnected");
  });

  it("canConnect is false while connected", () => {
    expect(canConnect("connected" as const)).toBe(false);
    expect(canConnect("disconnected" as const)).toBe(true);
    expect(canConnect("crashed" as const)).toBe(true);
  });

  it("connectionStatus is exhaustive over states", () => {
    for (const s of ["idle", "discovering", "connecting", "connected", "reconnecting", "incompatible", "unavailable", "crashed", "disconnected"] as const) {
      expect(connectionStatus(s)).toBe(s);
    }
  });
});
