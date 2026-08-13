// Extension marketplace — a VS Code-like registry layered on Pi's package
// system (npm / git / local sources). v1 registry protocol is a JSON manifest
// served from any URL or local path; install/uninstall delegates to Pi's
// DefaultPackageManager.

import { DefaultPackageManager, type PackageManager } from "@earendil-works/pi-coding-agent";
import type { SettingsManager } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import type { InstalledPackage, RegistryPackage } from "@shared/types";

export interface RegistrySource {
  url: string;
  name: string;
}

const DEFAULT_REGISTRY_SOURCES: RegistrySource[] = [];

export class ExtensionRegistry {
  private managers = new Map<string, PackageManager>();

  constructor(private readonly agentDir: string) {}

  private manager(cwd: string, settingsManager: SettingsManager): PackageManager {
    const key = cwd;
    if (!this.managers.has(key)) {
      this.managers.set(
        key,
        new DefaultPackageManager({ cwd, agentDir: this.agentDir, settingsManager }),
      );
    }
    return this.managers.get(key)!;
  }

  async listInstalled(cwd: string, settingsManager: SettingsManager): Promise<InstalledPackage[]> {
    const pm = this.manager(cwd, settingsManager);
    const configured = pm.listConfiguredPackages();
    return configured.map((p) => ({
      source: p.source,
      name: this.sourceName(p.source),
      location: p.scope,
      kinds: [],
      enabled: true,
    }));
  }

  async install(cwd: string, settingsManager: SettingsManager, source: string): Promise<void> {
    const pm = this.manager(cwd, settingsManager);
    await pm.installAndPersist(source);
  }

  async uninstall(cwd: string, settingsManager: SettingsManager, source: string): Promise<void> {
    const pm = this.manager(cwd, settingsManager);
    await pm.removeAndPersist(source);
  }

  async setEnabled(
    cwd: string,
    settingsManager: SettingsManager,
    source: string,
    enabled: boolean,
  ): Promise<void> {
    const pm = this.manager(cwd, settingsManager);
    if (enabled) {
      pm.addSourceToSettings(source);
    } else {
      pm.removeSourceFromSettings(source);
    }
  }

  private sourceName(source: string): string {
    // npm:pkg / git:host/repo / /local/path → short name
    return source.replace(/^npm:/, "").replace(/^git:/, "").replace(/@.*$/, "");
  }

  /** Load a registry manifest (JSON array) from a URL or local path. */
  async loadRegistry(urlOrPath: string): Promise<RegistryPackage[]> {
    if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
      const res = await fetch(urlOrPath);
      const json = (await res.json()) as RegistryPackage[] | { packages: RegistryPackage[] };
      return Array.isArray(json) ? json : json.packages;
    }
    const raw = readFileSync(urlOrPath, "utf8");
    const json = JSON.parse(raw) as RegistryPackage[] | { packages: RegistryPackage[] };
    return Array.isArray(json) ? json : json.packages;
  }

  getDefaultRegistries(): RegistrySource[] {
    return DEFAULT_REGISTRY_SOURCES;
  }
}
