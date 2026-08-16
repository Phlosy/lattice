// Compact runtime indicator — shows the active runtime profile and jumps to
// Runtime settings when clicked. Kept deliberately light (IDE status-bar style).

import { useEffect, useState } from "react";
import { useApp } from "../store/useApp";
import { loadProfiles, getActiveProfileId, subscribeProfiles } from "./profiles-store";

function resolveActiveName(): string {
  const id = getActiveProfileId();
  return loadProfiles().find((p) => p.id === id)?.name ?? "Built-in Pi";
}

export function RuntimeIndicator() {
  const setView = useApp((s) => s.setView);
  const [name, setName] = useState<string>(resolveActiveName);

  useEffect(() => subscribeProfiles(() => setName(resolveActiveName())), []);

  return (
    <button
      className="runtime-indicator"
      data-tooltip="Runtime"
      onClick={() => setView("settings")}
    >
      <span className="status-dot success" />
      <span className="runtime-indicator-name">{name}</span>
    </button>
  );
}
