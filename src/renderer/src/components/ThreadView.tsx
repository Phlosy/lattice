import { useEffect, useRef } from "react";
import type { AgentMessage, AssistantMessage, ToolCall } from "@shared/types";
import { useApp } from "../store/useApp";
import { Markdown } from "./Markdown";
import { ToolCard, contentToText } from "./ToolCard";

function ToolCallCard({ call }: { call: ToolCall }) {
  const exec = useApp((s) => s.transcript.toolExecutions[call.id]);
  const result = useApp((s) => findToolResult(s.transcript.messages, call.id));
  return (
    <ToolCard
      toolName={call.name}
      args={call.arguments}
      resultContent={result?.content}
      resultDetails={result?.details}
      isError={result?.isError}
      exec={exec}
    />
  );
}

function findToolResult(messages: AgentMessage[], toolCallId: string) {
  for (const m of messages) {
    if (m.role === "toolResult" && m.toolCallId === toolCallId) return m;
  }
  return undefined;
}

function AssistantBlocks({ message }: { message: AssistantMessage }) {
  return (
    <div className="msg msg-assistant">
      {message.content.map((block, i) => {
        if (block.type === "text") {
          return <Markdown key={i} text={block.text} />;
        }
        if (block.type === "thinking") {
          return (
            <details className="thinking-block" key={i}>
              <summary>Thinking</summary>
              <div className="thinking-body">{block.thinking}</div>
            </details>
          );
        }
        if (block.type === "toolCall") {
          return <ToolCallCard key={i} call={block} />;
        }
        return null;
      })}
      {message.errorMessage && (
        <div className="tool-card error">
          <div className="tool-card-body" style={{ color: "var(--danger)" }}>
            {message.errorMessage}
          </div>
        </div>
      )}
    </div>
  );
}

function MessageItem({ message }: { message: AgentMessage }) {
  switch (message.role) {
    case "user":
      return <div className="msg-user">{contentToText(message.content)}</div>;
    case "assistant":
      return <AssistantBlocks message={message} />;
    case "toolResult":
      return (
        <ToolCard
          toolName={message.toolName}
          args={{}}
          resultContent={message.content}
          resultDetails={message.details}
          isError={message.isError}
        />
      );
    case "bashExecution":
      return (
        <ToolCard
          toolName="bash"
          args={{ command: message.command }}
          resultContent={[{ type: "text", text: message.output }]}
          isError={message.exitCode !== 0 && message.exitCode !== undefined}
        />
      );
    case "branchSummary":
      return (
        <div className="thinking-block">
          <details>
            <summary>Branch summary</summary>
            <div className="thinking-body">{message.summary}</div>
          </details>
        </div>
      );
    case "compactionSummary":
      return (
        <div className="thinking-block">
          <details>
            <summary>Context compacted</summary>
            <div className="thinking-body">{message.summary}</div>
          </details>
        </div>
      );
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
      <div className="empty">
        <div>Create a session to start coding</div>
      </div>
    );
  }

  return (
    <div className="thread">
      <div className="thread-inner">
        {transcript.messages.map((m, i) => (
          <MessageItem key={i} message={m} />
        ))}
        {transcript.streaming && <AssistantBlocks message={transcript.streaming} />}
        {transcript.running && !transcript.streaming && <div className="msg-role-label">thinking…</div>}
        {transcript.lastError && (
          <div className="tool-card error">
            <div className="tool-card-body" style={{ color: "var(--danger)" }}>
              {transcript.lastError}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
