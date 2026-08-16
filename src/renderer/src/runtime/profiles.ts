// Runtime profiles — built-in defaults and provider resolution. Binary source
// and state source are independent: installed and bundled both default to
// `~/.pi`.

import type { DiscoveryResult, RuntimeProfile } from "./types";

export const INSTALLED_PROFILE: RuntimeProfile = {
  id: "installed",
  name: "Local Pi",
  provider: { type: "installed", executable: "auto" },
};

export const BUNDLED_PROFILE: RuntimeProfile = {
  id: "bundled",
  name: "Built-in Pi",
  provider: { type: "bundled" },
  autoConnect: true,
};

export function defaultProfiles(): RuntimeProfile[] {
  return [INSTALLED_PROFILE, BUNDLED_PROFILE];
}

/**
 * Provider fallback order (task §7):
 *   explicit profile → compatible installed Pi → bundled Pi.
 */
export function resolveProfile(
  explicit: RuntimeProfile | undefined,
  discovery: DiscoveryResult | null,
): RuntimeProfile {
  if (explicit) return explicit;
  if (discovery && discovery.compatibility === "compatible") {
    return {
      ...INSTALLED_PROFILE,
      provider: { type: "installed", executable: discovery.executablePath },
    };
  }
  return BUNDLED_PROFILE;
}
