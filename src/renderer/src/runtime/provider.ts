// Runtime providers — turn a profile into a working runtime accessor. Local
// profiles (installed/bundled) both drive the Tauri desktop core (which spawns
// Pi); remote drives the WSS client. The binary-source difference for
// installed vs bundled is resolved on the Rust side.

import type { LatticeApi } from "../../../shared/api";
import type {
  PiRuntime,
  RuntimeCapabilities,
  RuntimeInfo,
  RuntimeProfile,
} from "./types";
import { LOCAL_CAPABILITIES, REMOTE_CAPABILITIES } from "./capabilities";
import { createLatticeTauri } from "../lattice-tauri";
import { createLatticeRemote } from "../lattice-remote";

export interface ResolvedRuntime {
  api: LatticeApi;
  info: RuntimeInfo;
  capabilities: RuntimeCapabilities;
}

export function createProvider(profile: RuntimeProfile): ResolvedRuntime {
  const provider = profile.provider;
  switch (provider.type) {
    case "installed":
    case "bundled":
      return {
        api: createLatticeTauri(),
        info: {
          name: profile.name,
          provider: provider.type,
          location: "local",
          piHome: profile.state?.piHome,
          executablePath: provider.type === "installed" ? provider.executable : undefined,
        },
        capabilities: LOCAL_CAPABILITIES,
      };
    case "remote":
      return {
        api: createLatticeRemote({ url: provider.url, token: provider.token }),
        info: {
          name: profile.name,
          provider: "remote",
          location: "remote",
        },
        capabilities: REMOTE_CAPABILITIES,
      };
  }
}

/** A no-op runtime for tests / disconnected UI. */
export function createDisconnectedRuntime(): PiRuntime {
  return {
    connect: () => Promise.resolve(),
    disconnect: () => Promise.resolve(),
    getRuntimeInfo: () => Promise.reject(new Error("no runtime")),
    getCapabilities: () => Promise.reject(new Error("no runtime")),
    listSessions: () => Promise.resolve([]),
    createSession: () => Promise.reject(new Error("no runtime")),
    getModels: () => Promise.resolve([]),
    subscribeEvents: () => () => {},
  };
}
