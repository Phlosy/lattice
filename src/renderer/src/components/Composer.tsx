import { useState } from "react";
import { useApp } from "../store/useApp";

export function Composer() {
  const [text, setText] = useState("");
  const prompt = useApp((s) => s.prompt);
  const abort = useApp((s) => s.abort);
  const running = useApp((s) => s.transcript.running);
  const steering = useApp((s) => s.transcript.steering);
  const followUp = useApp((s) => s.transcript.followUp);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    void prompt(t);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="composer">
      <div className="composer-inner">
        <div className="composer-box">
          <textarea
            rows={1}
            placeholder="Ask Lattice to build, fix, or explain…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
          />
          {running ? (
            <button className="btn btn-sm" onClick={() => void abort()}>
              ■ Stop
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={submit} disabled={!text.trim()}>
              ↑ Send
            </button>
          )}
        </div>
        <div className="composer-meta">
          <span className={running ? "running" : ""}>{running ? "Agent is working…" : "Ready"}</span>
          {steering.length > 0 && <span>queued steering: {steering.length}</span>}
          {followUp.length > 0 && <span>queued follow-up: {followUp.length}</span>}
          <div style={{ flex: 1 }} />
          <span>⏎ send · ⇧⏎ newline</span>
        </div>
      </div>
    </div>
  );
}
