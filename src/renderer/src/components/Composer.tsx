import { useLayoutEffect, useRef, useState } from "react";
import { useApp } from "../store/useApp";

export function Composer() {
  const [text, setText] = useState("");
  const prompt = useApp((s) => s.prompt);
  const abort = useApp((s) => s.abort);
  const running = useApp((s) => s.transcript.running);
  const steering = useApp((s) => s.transcript.steering);
  const followUp = useApp((s) => s.transcript.followUp);
  const sessionState = useApp((s) => s.sessionState);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
  }, [text]);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    void prompt(t);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const queueCount = steering.length + followUp.length;
  const disabled = !sessionState?.model;

  return (
    <div className="composer">
      <div className="composer-inner">
        <div className="composer-box">
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={disabled ? "Select a model to start" : "Ask Lattice to build, fix, or explain…"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
            disabled={disabled}
          />
          {running ? (
            <button className="stop-btn" onClick={() => void abort()} data-tooltip="Stop (Esc)">
              ■
            </button>
          ) : (
            <button className="send-btn" onClick={submit} disabled={!text.trim() || disabled} data-tooltip="Send (⏎)">
              ↑
            </button>
          )}
        </div>
        <div className="composer-hint">
          <span>
            <kbd>⏎</kbd> send · <kbd>⇧⏎</kbd> newline
          </span>
          {running && (
            <span className="queue">
              {queueCount > 0 ? `${queueCount} queued` : "agent is working…"}
            </span>
          )}
          <span className="spacer" />
          {sessionState?.model && (
            <span>
              {sessionState.model.name} · {sessionState.thinkingLevel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
