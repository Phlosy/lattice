// Runtime profile persistence — replaces the old `{ mode, remoteUrl, token }`
// model with a list of profiles plus an active selection.

import type { RuntimeProfile } from "./types";
import { INSTALLED_PROFILE, BUNDLED_PROFILE } from "./profiles";

const PROFILES_KEY = "lattice.runtime.profiles.v1";
const ACTIVE_KEY = "lattice.runtime.active.v1";
const LEGACY_KEY = "lattice.runtime.config.v1";

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

function isProfile(value: unknown): value is RuntimeProfile {
  if (!value || typeof value !== "object") return false;
  const p = value as RuntimeProfile;
  return typeof p.id === "string" && typeof p.name === "string" && !!p.provider;
}

function sanitize(raw: unknown): RuntimeProfile[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isProfile);
}

export function loadProfiles(): RuntimeProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    const profiles = raw ? sanitize(JSON.parse(raw)) : [];
    // Always ensure the two built-ins exist.
    const ids = new Set(profiles.map((p) => p.id));
    if (!ids.has(INSTALLED_PROFILE.id)) profiles.unshift(INSTALLED_PROFILE);
    if (!ids.has(BUNDLED_PROFILE.id)) profiles.push(BUNDLED_PROFILE);
    return profiles;
  } catch {
    return [INSTALLED_PROFILE, BUNDLED_PROFILE];
  }
}

function persist(profiles: RuntimeProfile[]): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  notify();
}

export function saveProfiles(profiles: RuntimeProfile[]): void {
  persist(profiles);
}

export function addProfile(profile: RuntimeProfile): RuntimeProfile[] {
  const profiles = loadProfiles().filter((p) => p.id !== profile.id);
  profiles.push(profile);
  persist(profiles);
  return profiles;
}

export function updateProfile(profile: RuntimeProfile): RuntimeProfile[] {
  const profiles = loadProfiles().map((p) => (p.id === profile.id ? profile : p));
  persist(profiles);
  return profiles;
}

export function removeProfile(id: string): RuntimeProfile[] {
  const profiles = loadProfiles().filter((p) => p.id !== id);
  persist(profiles);
  return profiles;
}

export function getActiveProfileId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveProfileId(id: string | null): void {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
  notify();
}

export function subscribeProfiles(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Non-destructive one-time migration from the old single-config model. */
export function migrateLegacyRuntimeConfig(): void {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const legacy = JSON.parse(raw) as { mode?: string; remoteUrl?: string; remoteToken?: string };
    if (legacy.mode === "remote" && legacy.remoteUrl) {
      addProfile({
        id: "remote",
        name: "Remote Runtime",
        provider: { type: "remote", url: legacy.remoteUrl, token: legacy.remoteToken || undefined },
      });
      setActiveProfileId("remote");
    }
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore malformed legacy state */
  }
}
