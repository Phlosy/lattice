// Installed Pi discovery client — calls the Rust `runtime_detect` command.
// Lives in the runtime layer so the UI never probes the filesystem itself.

import type { DiscoveryResult } from "./types";

interface TauriWindow extends Window {
  __TAURI__?: {
    core: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
  };
}

type DetectResponse =
  | { found: false }
  | {
      found: true;
      executablePath: string;
      version?: string;
      compatibility: string;
      piHome?: string;
    };

export async function discoverInstalledPi(): Promise<DiscoveryResult | null> {
  const tauri = (window as TauriWindow).__TAURI__;
  if (!tauri) return null;
  const raw = (await tauri.core.invoke("runtime_detect")) as DetectResponse;
  if (!raw.found) return null;
  return {
    executablePath: raw.executablePath,
    version: raw.version,
    compatibility: (raw.compatibility as DiscoveryResult["compatibility"]) ?? "unknown",
    piHome: raw.piHome,
  };
}

/** Point the Rust Desktop Core at a specific installed Pi (empty = bundled). */
export async function setInstalledExecutable(path: string | null): Promise<void> {
  const tauri = (window as TauriWindow).__TAURI__;
  if (!tauri) return;
  await tauri.core.invoke("pi_set_executable", { path: path ?? "" });
}
