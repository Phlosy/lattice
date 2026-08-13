import { useEffect, useRef, useState } from "react";
import type { AgentMessage } from "@shared/types";
import { useApp } from "../store/useApp";
import { useT } from "../i18n";
import { AssistantMessageView, contentToText } from "./blocks";

function BashExecutionView({ message }: { message: Extract<AgentMessage, { role: "bashExecution" }> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const failed = message.exitCode !== 0 && message.exitCode !== undefined;
  return (
    <div className={`block ${failed ? "block-error" : ""} ${open ? "open" : ""}`}>
      <div className="block-head" onClick={() => setOpen((v) => !v)}>
        <span className="chev">▸</span>
        <span style={{ color: failed ? "var(--danger)" : "var(--success)" }}>{failed ? "✗" : "✓"}</span>
        <span className="kind">$ {message.command}</span>
        {message.exitCode !== undefined && (
          <span className={`exit-${failed ? "err" : "0"}`}>{t("thread.exit")} {message.exitCode}</span>
        )}
      </div>
      {open && <div className="block-body">{message.output || "—"}</div>}
    </div>
  );
}

function SummaryBlock({ label, summary }: { label: string; summary: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`block block-thinking ${open ? "open" : ""}`}>
      <div className="block-head" onClick={() => setOpen((v) => !v)}>
        <span className="chev">▸</span>
        <span className="kind">{label}</span>
      </div>
      {open && <div className="block-body">{summary}</div>}
    </div>
  );
}

function MessageItem({ message }: { message: AgentMessage }) {
  const execs = useApp((s) => s.transcript.toolExecutions);
  const messages = useApp((s) => s.transcript.messages);

  switch (message.role) {
    case "user":
      return <div className="msg-user">{contentToText(message.content)}</div>;
    case "assistant":
      return <AssistantMessageView message={message} execs={execs} messages={messages} />;
    case "toolResult":
      return null; // rendered inline within the tool call block
    case "bashExecution":
      return <BashExecutionView message={message} />;
    case "branchSummary":
      return <BranchSummaryView summary={message.summary} />;
    case "compactionSummary":
      return <CompactionView summary={message.summary} />;
    case "custom":
      if (!message.display) return null;
      return <div className="msg-user">{contentToText(message.content)}</div>;
    default:
      return null;
  }
}

function BranchSummaryView({ summary }: { summary: string }) {
  const t = useT();
  return <SummaryBlock label={t("thread.branchSummary")} summary={summary} />;
}

function CompactionView({ summary }: { summary: string }) {
  const t = useT();
  return <SummaryBlock label={t("thread.compacted")} summary={summary} />;
}

export function ThreadView() {
  const t = useT();
  const transcript = useApp((s) => s.transcript);
  const activeSessionId = useApp((s) => s.activeSessionId);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript.messages.length, transcript.streaming?.content, transcript.running]);

  if (!activeSessionId) {
    return (
      <div className="empty-state">
        <div className="icon">＋</div>
        <h2>{t("thread.noSession")}</h2>
        <p>{t("thread.noSessionDesc")}</p>
      </div>
    );
  }

  if (transcript.messages.length === 0 && !transcript.running) {
    return <EmptySession />;
  }

  return (
    <div className="conversation">
      <div className="conversation-inner">
        {transcript.messages.map((m, i) => (
          <MessageItem key={i} message={m} />
        ))}
        {transcript.streaming && (
          <AssistantMessageView
            message={transcript.streaming}
            streaming
            execs={transcript.toolExecutions}
            messages={transcript.messages}
          />
        )}
        {transcript.running && !transcript.streaming && (
          <div className="loading-row">
            <span className="spinner" />
            {t("thread.waiting")}
          </div>
        )}
        {transcript.lastError && (
          <div className="block block-error">
            <div className="block-head">✗ {t("thread.error")}</div>
            <div className="block-body">{transcript.lastError}</div>
          </div>
        )}
        <FileChanges />
        <div ref={endRef} />
      </div>
    </div>
  );
}

/** Codex-style inline file-change summary (path +N -M) after the agent runs. */
function FileChanges() {
  const gitStatus = useApp((s) => s.gitStatus);
  const togglePanel = useApp((s) => s.togglePanel);
  if (!gitStatus || gitStatus.clean || gitStatus.files.length === 0) return null;
  return (
    <div className="file-changes">
      <div className="file-changes-head" onClick={() => togglePanel("git")}>
        <span className="chev">⑂</span>
        <span>{gitStatus.files.length} files changed</span>
        <span className="diff-total">
          +{gitStatus.added} −{gitStatus.removed}
        </span>
      </div>
      <div className="file-changes-list">
        {gitStatus.files.slice(0, 12).map((f) => (
          <div key={f.path} className="file-change-row" onClick={() => togglePanel("git")}>
            <span className={`fc-status ${f.index === "?" ? "untracked" : f.staged ? "staged" : "modified"}`}>
              {f.index === "?" ? "U" : f.index === " " ? "M" : f.index.toUpperCase()}
            </span>
            <span className="fc-path">{f.path}</span>
            <span className="fc-num">
              +{f.added} −{f.removed}
            </span>
          </div>
        ))}
        {gitStatus.files.length > 12 && (
          <div className="file-change-more">+{gitStatus.files.length - 12} more</div>
        )}
      </div>
    </div>
  );
}

function EmptySession() {
  const t = useT();
  const prompt = useApp((s) => s.prompt);
  const suggestions = [
    t("suggest.summarize"),
    t("suggest.bugs"),
    t("suggest.tests"),
    t("suggest.arch"),
  ];
  return (
    <div className="empty-state empty-session">
      <div className="icon">Λ</div>
      <h2>{t("thread.emptyTitle")}</h2>
      <p>{t("thread.emptyDesc")}</p>
      <div className="suggestions">
        {suggestions.map((s) => (
          <button key={s} className="suggestion" onClick={() => void prompt(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
