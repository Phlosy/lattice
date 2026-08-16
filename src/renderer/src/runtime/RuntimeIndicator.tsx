// RuntimeIndicator + QuickSwitcher — the lightweight runtime status surface.
// Reads the single runtime store; never touches the transport directly.

import { useEffect, useRef, useState } from "react";
import { useApp } from "../store/useApp";
import { useRuntime } from "./store";
import {
  loadProfiles,
  setActiveProfileId,
  subscribeProfiles,
} from "./profiles-store";
import { testStatus } from "./test";
import type { RuntimeConnectionState } from "./types";

const STATE_COLORS: Record<RuntimeConnectionState, string> = {
  idle: "var(--text-faint)",
  discovering: "var(--text-faint)",
  connecting: "var(--warning)",
  connected: "var(--success)",
  reconnecting: "var(--accent)",
  incompatible: "var(--danger)",
  unavailable: "var(--danger)",
  crashed: "var(--warning)",
  disconnected: "var(--text-muted)",
};

export function RuntimeIndicator() {
  const setView = useApp((s) => s.setView);
  const state = useRuntime((s) => s.state);
  const info = useRuntime((s) => s.info);
  const selectProfile = useRuntime((s) => s.selectProfile);

  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState(() => loadProfiles());
  const [activeId, setActiveId] = useState(() => localStorage.getItem("lattice.runtime.active.v1"));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeProfiles(() => {
    setProfiles(loadProfiles());
    setActiveId(localStorage.getItem("lattice.runtime.active.v1"));
  }), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const switchTo = (id: string) => {
    setActiveProfileId(id);
    setActiveId(id);
    setOpen(false);
    void selectProfile(id);
  };

  const dotColorFor = (id: string): string => {
    if (id === activeId) return state === "connected" ? "var(--success)" : STATE_COLORS[state];
    const status = testStatus(id);
    if (status === "ok") return "var(--success)";
    if (status === "fail") return "var(--danger)";
    return "var(--text-faint)";
  };

  const name = info?.name ?? "No runtime";

  return (
    <div className="runtime-indicator-wrap" ref={ref} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <button
        className="runtime-indicator"
        data-tooltip="Runtime"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="status-dot" style={{ background: STATE_COLORS[state] }} />
        <span className="runtime-indicator-name">{name}</span>
      </button>

      {open && (
        <div className="popover runtime-switcher" style={{ bottom: "calc(100% + 6px)", left: 0, minWidth: 220 }}>
          <div className="popover-header">Runtime</div>
          <div className="popover-list">
            {profiles.map((p) => (
              <button
                key={p.id}
                className="popover-item"
                onClick={() => switchTo(p.id)}
              >
                <span className="status-dot" style={{ background: dotColorFor(p.id) }} />
                <span style={{ flex: 1, textAlign: "left" }}>{p.name}</span>
                <span className="sub">
                  {p.provider.type === "remote" ? "Remote" : p.provider.type === "installed" ? "Installed" : "Built-in"}
                </span>
              </button>
            ))}
          </div>
          <button className="popover-item" onClick={() => { setOpen(false); setView("settings"); }}>
            ⚙ Manage runtimes
          </button>
        </div>
      )}
    </div>
  );
}
