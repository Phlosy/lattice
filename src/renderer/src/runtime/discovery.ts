// Installed Pi discovery — pure selection logic. The actual filesystem probe
// happens in Rust (a Desktop Core command); this module turns candidate paths
// into a deterministic choice so it is unit-testable and platform-agnostic.

export type CandidateSource = "explicit" | "path" | "common";

export interface Candidate {
  path: string;
  source: CandidateSource;
}

/** Common install locations, ordered by preference (not hardcoded as the only path). */
export function commonInstallCandidates(home: string): Candidate[] {
  return [
    { path: "/opt/homebrew/bin/pi", source: "common" },
    { path: "/usr/local/bin/pi", source: "common" },
    { path: `${home}/.local/bin/pi`, source: "common" },
    { path: "/usr/bin/pi", source: "common" },
  ];
}

/**
 * Resolve an executable from a configured value + PATH-derived candidates.
 * Returns the first existing candidate, or null.
 */
export function selectInstalledExecutable(
  explicit: string | undefined,
  pathCandidates: string[],
  commonCandidates: Candidate[],
  exists: (path: string) => boolean,
): Candidate | null {
  if (explicit && explicit !== "auto" && exists(explicit)) {
    return { path: explicit, source: "explicit" };
  }
  for (const path of pathCandidates) {
    if (exists(path)) return { path, source: "path" };
  }
  for (const candidate of commonCandidates) {
    if (exists(candidate.path)) return candidate;
  }
  return null;
}
