// RuntimeManager state machine — pure, deterministic connection-state
// transitions. The React UI drives this; providers implement the side effects.

import type { RuntimeConnectionState } from "./types";

export type ManagerEvent =
  | { type: "discover" }
  | { type: "connect" }
  | { type: "connected" }
  | { type: "disconnect" }
  | { type: "disconnected" }
  | { type: "connection-lost" }
  | { type: "reconnect" }
  | { type: "error"; reason: "incompatible" | "unavailable" | "auth" | "network" | "crash" };

export function nextState(
  state: RuntimeConnectionState,
  event: ManagerEvent,
): RuntimeConnectionState {
  switch (event.type) {
    case "discover":
      return "discovering";
    case "connect":
    case "reconnect":
      return "connecting";
    case "connected":
      return "connected";
    case "disconnect":
    case "disconnected":
      return "disconnected";
    case "connection-lost":
      return "reconnecting";
    case "error":
      switch (event.reason) {
        case "incompatible":
          return "incompatible";
        case "unavailable":
          return "unavailable";
        case "crash":
          return "crashed";
        default:
          return "disconnected";
      }
  }
}

/** True if the state is one the user can trigger a connect from. */
export function canConnect(state: RuntimeConnectionState): boolean {
  return ["idle", "disconnected", "unavailable", "incompatible", "crashed", "discovering"].includes(
    state,
  );
}

/** Human-readable status label (kept in English; UI maps to i18n). */
export function connectionStatus(state: RuntimeConnectionState): string {
  switch (state) {
    case "idle":
      return "idle";
    case "discovering":
      return "discovering";
    case "connecting":
      return "connecting";
    case "connected":
      return "connected";
    case "reconnecting":
      return "reconnecting";
    case "incompatible":
      return "incompatible";
    case "unavailable":
      return "unavailable";
    case "crashed":
      return "crashed";
    case "disconnected":
      return "disconnected";
  }
}

import type { DiscoveryResult, RuntimeCapabilities, RuntimeInfo, RuntimeProfile } from "./types";
import { createProvider, type ResolvedRuntime } from "./provider";
import { resolveProfile } from "./profiles";
import { hasCapability } from "./capabilities";

/** The single owner of runtime connection state and provider selection. */
export class RuntimeManager {
  private state: RuntimeConnectionState = "idle";
  private profile: RuntimeProfile | null = null;
  private runtime: ResolvedRuntime | null = null;
  private readonly listeners = new Set<(state: RuntimeConnectionState) => void>();

  getState(): RuntimeConnectionState {
    return this.state;
  }

  getProfile(): RuntimeProfile | null {
    return this.profile;
  }

  getInfo(): RuntimeInfo | null {
    return this.runtime?.info ?? null;
  }

  getCapabilities(): RuntimeCapabilities | null {
    return this.runtime?.capabilities ?? null;
  }

  /** The active LatticeApi (operations surface), or null when disconnected. */
  getApi() {
    return this.runtime?.api ?? null;
  }

  hasCapability(key: keyof RuntimeCapabilities): boolean {
    const caps = this.runtime?.capabilities;
    return caps ? hasCapability(caps, key) : false;
  }

  subscribe(listener: (state: RuntimeConnectionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Replace the effective capabilities after async negotiation. */
  updateCapabilities(caps: RuntimeCapabilities): void {
    if (this.runtime) {
      this.runtime.capabilities = caps;
      this.notify();
    }
  }

  /** Resolve + connect, applying the fallback order (explicit → installed → bundled). */
  connect(explicit: RuntimeProfile | undefined, discovery: DiscoveryResult | null): ResolvedRuntime {
    const profile = resolveProfile(explicit, discovery);
    this.profile = profile;
    this.setState("connecting");
    this.runtime = createProvider(profile);
    this.setState("connected");
    return this.runtime;
  }

  disconnect(): void {
    this.runtime = null;
    this.setState("disconnected");
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.state);
  }

  private setState(next: RuntimeConnectionState): void {
    this.state = next;
    this.notify();
  }
}
