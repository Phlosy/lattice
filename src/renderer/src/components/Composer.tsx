import { useLayoutEffect, useRef, useState } from "react";
import { useApp } from "../store/useApp";
import { useT } from "../i18n";

export function Composer() {
  const t = useT();
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
            placeholder={disabled ? t("composer.placeholderNoModel") : t("composer.placeholder")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
            disabled={disabled}
          />
          {running ? (
            <button className="stop-btn" onClick={() => void abort()} data-tooltip={`${t("composer.stop")} (Esc)`}>
              ■
            </button>
          ) : (
            <button className="send-btn" onClick={submit} disabled={!text.trim() || disabled} data-tooltip={`${t("composer.send")} (⏎)`}>
              ↑
            </button>
          )}
        </div>
        <div className="composer-hint">
          <span>
            <kbd>⏎</kbd> {t("composer.send")} · <kbd>⇧⏎</kbd> {t("composer.newline")}
          </span>
          {running && (
            <span className="queue">
              {queueCount > 0 ? `${queueCount} ${t("composer.queued")}` : t("composer.working")}
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
