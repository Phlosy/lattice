// Runtime store — the single reactive source of truth for runtime state.
// The RuntimeManager is a controller that writes here; the React UI reads
// exclusively through `useRuntime`.

import { create } from "zustand";
import type { LatticeApi } from "../../../shared/api";
import type {
  RuntimeCapabilities,
  RuntimeConnectionState,
  RuntimeInfo,
  RuntimeProfile,
} from "./types";
import { NO_CAPABILITIES, mergeCapabilities } from "./capabilities";
import { RuntimeManager } from "./manager";
import { getRuntimeCapabilities } from "./discovery-client";
import {
  loadProfiles,
  getActiveProfileId,
  setActiveProfileId,
  migrateLegacyRuntimeConfig,
} from "./profiles-store";

const manager = new RuntimeManager();

function clientPlatform(): "desktop" | "mobile" | "browser" {
  const tauri = (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  if (!tauri) return "browser";
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return "mobile";
  return "desktop";
}

function snapshot() {
  const info = manager.getInfo();
  return {
    state: manager.getState(),
    profile: manager.getProfile(),
    info: info ? { ...info, platform: clientPlatform() } : null,
    capabilities: manager.getCapabilities() ?? NO_CAPABILITIES,
    api: manager.getApi(),
  };
}

export interface RuntimeStore {
  state: RuntimeConnectionState;
  profile: RuntimeProfile | null;
  info: RuntimeInfo | null;
  capabilities: RuntimeCapabilities;
  api: LatticeApi | null;

  /** Synchronously resolve + connect; returns the operations surface (or null). */
  boot(): LatticeApi | null;
  connect(profile: RuntimeProfile): Promise<void>;
  disconnect(): Promise<void>;
  selectProfile(id: string): Promise<void>;
  refreshCapabilities(): Promise<void>;
}

export const useRuntime = create<RuntimeStore>((set, get) => {
  const sync = () => set(snapshot());
  manager.subscribe(sync);

  return {
    ...snapshot(),

    boot() {
      migrateLegacyRuntimeConfig();
      const profiles = loadProfiles();
      const activeId = getActiveProfileId();
      const active = profiles.find((p) => p.id === activeId);

      const platform = clientPlatform();
      if (platform === "mobile") {
        // Mobile cannot spawn a local Pi; it needs a remote profile.
        const remote = active?.provider?.type === "remote" ? active : undefined;
        if (!remote) {
          manager.disconnect();
          sync();
          return null;
        }
        manager.connect(remote, null);
        sync();
        void get().refreshCapabilities();
        return manager.getApi();
      }

      manager.connect(active, null);
      sync();
      void get().refreshCapabilities();
      return manager.getApi();
    },

    async connect(profile) {
      manager.connect(profile, null);
      sync();
      await get().refreshCapabilities();
    },

    async disconnect() {
      manager.disconnect();
      sync();
    },

    async selectProfile(id) {
      setActiveProfileId(id);
      const profile = loadProfiles().find((p) => p.id === id);
      if (!profile) return;
      await get().connect(profile);
    },

    async refreshCapabilities() {
      const info = get().info;
      // Remote capability negotiation is deferred (host reports `runtime.capabilities`).
      if (!info || info.location === "remote") return;
      const caps = await getRuntimeCapabilities();
      if (caps) {
        manager.updateCapabilities(mergeCapabilities(get().capabilities, caps));
        sync();
      }
    },
  };
});
