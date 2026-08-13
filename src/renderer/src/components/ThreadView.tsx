import { useEffect, useRef, useState } from "react";
import type { AgentMessage } from "@shared/types";
import { useApp } from "../store/useApp";
import { AssistantMessageView, contentToText } from "./blocks";

function BashExecutionView({ message }: { message: Extract<AgentMessage, { role: "bashExecution" }> }) {
  const [open, setOpen] = useState(false);
  const failed = message.exitCode !== 0 && message.exitCode !== undefined;
  return (
    <div className={`block ${failed ? "block-error" : ""} ${open ? "open" : ""}`}>
      <div className="block-head" onClick={() => setOpen((v) => !v)}>
        <span className="chev">▸</span>
        <span style={{ color: failed ? "var(--danger)" : "var(--success)" }}>{failed ? "✗" : "✓"}</span>
        <span className="kind">$ {message.command}</span>
        {message.exitCode !== undefined && (
          <span className={`exit-${failed ? "err" : "0"}`}>exit {message.exitCode}</span>
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
      return <SummaryBlock label="Branch summary" summary={message.summary} />;
    case "compactionSummary":
      return <SummaryBlock label="Context compacted" summary={message.summary} />;
    case "custom":
      if (!message.display) return null;
      return <div className="msg-user">{contentToText(message.content)}</div>;
    default:
      return null;
  }
}

export function ThreadView() {
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
        <h2>No session</h2>
        <p>Create a session to start a coding task with the agent.</p>
      </div>
    );
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
            Waiting for the agent…
          </div>
        )}
        {transcript.lastError && (
          <div className="block block-error">
            <div className="block-head">✗ Error</div>
            <div className="block-body">{transcript.lastError}</div>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
