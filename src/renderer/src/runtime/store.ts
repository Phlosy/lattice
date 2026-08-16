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
import { discoverInstalledPi, setInstalledExecutable } from "./discovery-client";
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
  /** True while a profile switch / connect is in flight (drives the overlay). */
  transitioning: boolean;

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
    transitioning: false,

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
      set({ transitioning: true });
      try {
        manager.connect(profile, null);
        sync();
        // Installed: discover + select the binary (drives the Rust-side spawn
        // / restart). Bundled: clear any override back to the packaged binary.
        if (profile.provider.type === "installed") {
          if (profile.provider.executable && profile.provider.executable !== "auto") {
            await setInstalledExecutable(profile.provider.executable);
          } else {
            const found = await discoverInstalledPi();
            await setInstalledExecutable(found ? found.executablePath : null);
          }
        } else if (profile.provider.type === "bundled") {
          await setInstalledExecutable(null);
        }
        await get().refreshCapabilities();
      } finally {
        set({ transitioning: false });
      }
    },

    async disconnect() {
      manager.disconnect();
      sync();
    },

    async selectProfile(id) {
      setActiveProfileId(id);
      const target = loadProfiles().find((p) => p.id === id);
      if (!target) return;
      const current = manager.getProfile();
      const transportChanged =
        (current?.provider.type === "remote") !== (target.provider.type === "remote");
      if (transportChanged) {
        // Switching the transport (local ⇄ remote) requires re-booting the whole
        // operations surface; the boot screen now animates so it is not a blank
        // flash.
        window.location.reload();
        return;
      }
      await get().connect(target);
    },

    async refreshCapabilities() {
      // Both local and remote adapters expose getCapabilities() (optional on
      // LatticeApi); the store merges the real report over the static baseline.
      const caps = await get().api?.getCapabilities?.();
      if (caps) {
        manager.updateCapabilities(mergeCapabilities(get().capabilities, caps as unknown as RuntimeCapabilities));
        sync();
      }
    },
  };
});
