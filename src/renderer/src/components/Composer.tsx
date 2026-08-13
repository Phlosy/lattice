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
  const currentProject = useApp((s) => s.currentProject);
  const gitStatus = useApp((s) => s.gitStatus);

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
  const branch = gitStatus?.branch ?? "main";

  return (
    <div className="composer">
      <div className="composer-inner">
        {/* Project / branch context (Codex-style) */}
        {(currentProject || gitStatus) && (
          <div className="composer-context">
            <span className="composer-project">{currentProject?.name}</span>
            <span className="composer-sep">•</span>
            <span className="composer-branch">{branch}</span>
          </div>
        )}
        <div className="composer-box">
          <button className="attach-btn" data-tooltip="Attach" aria-label="Attach">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M11.5 6.5 8 10a2.12 2.12 0 0 1-3-3l3.5-3.5a3.18 3.18 0 0 1 4.5 4.5L9.5 11.5a4.24 4.24 0 0 1-6-6l3.5-3.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
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
              <span className="stop-icon" />
            </button>
          ) : (
            <button
              className={`send-btn ${text.trim() && !disabled ? "active" : ""}`}
              onClick={submit}
              disabled={!text.trim() || disabled}
              data-tooltip={`${t("composer.send")} (⏎)`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M7 2v10M3 6l4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
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
