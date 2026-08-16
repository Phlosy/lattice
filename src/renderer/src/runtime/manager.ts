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
