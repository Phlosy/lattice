// Session tabs — Codex-style top tab bar for multi-session parallel work.
// Each open session is a tab; tabs can be switched and closed.

import { useApp } from "../store/useApp";

export function SessionTabs() {
  const sessions = useApp((s) => s.sessions);
  const openSessionIds = useApp((s) => s.openSessionIds);
  const activeSessionId = useApp((s) => s.activeSessionId);
  const running = useApp((s) => s.transcript.running);
  const setActiveSession = useApp((s) => s.setActiveSession);
  const closeSessionTab = useApp((s) => s.closeSessionTab);
  const createSession = useApp((s) => s.createSession);

  if (openSessionIds.length === 0) return null;

  const nameOf = (id: string) => {
    const m = sessions.find((s) => s.id === id);
    return m?.name || m?.id.slice(0, 8) || id.slice(0, 8);
  };

  return (
    <div className="session-tabs">
      {openSessionIds.map((id) => {
        const active = id === activeSessionId;
        const isRunning = active && running;
        return (
          <div
            key={id}
            className={`session-tab ${active ? "active" : ""} ${running && !active ? "disabled" : ""}`}
            aria-disabled={running && !active}
            onClick={() => void setActiveSession(id)}
          >
            <span className={`status-dot ${isRunning ? "running" : active ? "success" : ""}`} />
            <span className="tab-label">{nameOf(id)}</span>
            <span
              className="tab-close"
              aria-disabled={running && active}
              onClick={(e) => {
                e.stopPropagation();
                void closeSessionTab(id);
              }}
            >
              ✕
            </span>
          </div>
        );
      })}
      <button className="tab-new" data-tooltip="New session" disabled={running} onClick={() => void createSession()}>
        ＋
      </button>
    </div>
  );
}
