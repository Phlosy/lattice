// Runtime capability model — UI gating is driven by capabilities, never by
// provider type or version checks.

import type { RuntimeCapabilities } from "./types";

export const CAPABILITY_KEYS: (keyof RuntimeCapabilities)[] = [
  "chat",
  "sessions",
  "sessionResume",
  "filesystem",
  "git",
  "shell",
  "pty",
  "skills",
  "extensions",
  "subagents",
  "remoteFilesystem",
];

export const NO_CAPABILITIES: RuntimeCapabilities = {
  chat: false,
  sessions: false,
  sessionResume: false,
  filesystem: false,
  git: false,
  shell: false,
  pty: false,
  skills: false,
  extensions: false,
  subagents: false,
  remoteFilesystem: false,
};

/** A local Pi (installed or bundled) exposes the full local capability set. */
export const LOCAL_CAPABILITIES: RuntimeCapabilities = {
  chat: true,
  sessions: true,
  sessionResume: true,
  filesystem: true,
  git: true,
  shell: true,
  pty: true,
  skills: true,
  extensions: true,
  subagents: true,
  remoteFilesystem: false,
};

/** A remote host exposes the same product surface over WSS. */
export const REMOTE_CAPABILITIES: RuntimeCapabilities = {
  ...LOCAL_CAPABILITIES,
  remoteFilesystem: true,
};

export function hasCapability(
  capabilities: RuntimeCapabilities,
  key: keyof RuntimeCapabilities,
): boolean {
  return capabilities[key] === true;
}

/** Merge partial capability sets; true wins (conservative: false only if all false). */
export function mergeCapabilities(
  ...sets: Partial<RuntimeCapabilities>[]
): RuntimeCapabilities {
  const merged = { ...NO_CAPABILITIES };
  for (const set of sets) {
    for (const key of CAPABILITY_KEYS) {
      if (set[key] === true) merged[key] = true;
    }
  }
  return merged;
}

/** The capabilities a capability set is missing relative to another. */
export function missingCapabilities(
  have: RuntimeCapabilities,
  want: RuntimeCapabilities,
): (keyof RuntimeCapabilities)[] {
  return CAPABILITY_KEYS.filter((key) => want[key] && !have[key]);
}
