// Runtime connection configuration — how the React UI reaches the Pi runtime.
//
// This is intentionally separate from `AppSettings` (which persists appearance
// and permission preferences through the LatticeApi / Rust Desktop Core).
// Runtime config must be readable synchronously at startup, *before* an adapter
// is chosen, so it lives in localStorage and never round-trips through a runtime
// that may not be reachable yet.

export type RuntimeMode = "local" | "remote";

export interface RuntimeConfig {
  mode: RuntimeMode;
  /** WebSocket URL of the Lattice Runtime Host (wss:// or ws://). */
  remoteUrl: string;
  /** Device token issued by the Runtime Host. */
  remoteToken: string;
}

const KEY = "lattice.runtime.config.v1";

const DEFAULTS: RuntimeConfig = {
  mode: "local",
  remoteUrl: "",
  remoteToken: "",
};

type Listener = (config: RuntimeConfig) => void;
const listeners = new Set<Listener>();

function sanitize(raw: unknown): RuntimeConfig {
  const value = (raw ?? {}) as Partial<RuntimeConfig>;
  const mode: RuntimeMode = value.mode === "remote" ? "remote" : "local";
  return {
    mode,
    remoteUrl: typeof value.remoteUrl === "string" ? value.remoteUrl.trim() : "",
    remoteToken: typeof value.remoteToken === "string" ? value.remoteToken : "",
  };
}

export function loadRuntimeConfig(): RuntimeConfig {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw)) : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Persist a single field and return the new config (per-field save). */
export function saveRuntimeConfigField<K extends keyof RuntimeConfig>(
  key: K,
  value: RuntimeConfig[K],
): RuntimeConfig {
  const next = { ...loadRuntimeConfig(), [key]: value };
  localStorage.setItem(KEY, JSON.stringify(next));
  for (const listener of listeners) listener(next);
  return next;
}

export function subscribeRuntimeConfig(listener: Listener): () => void {
  listeners.add(listener);
  // React to changes made in other tabs/windows.
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener(loadRuntimeConfig());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
