// Agent conversation blocks — productized rendering of assistant content,
// tool calls, commands, file edits, and errors. Designed to stay scannable
// even when the agent emits many tool calls.

import { useState } from "react";
import type { AgentMessage, AssistantMessage, ToolCall, ToolResultMessage } from "@shared/types";
import type { ToolExecState } from "../lib/session-reducer";
import { useT } from "../i18n";
import { Markdown } from "./Markdown";
import { DiffViewer } from "./DiffViewer";

export function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (c && typeof c === "object" && "text" in c) return (c as { text: string }).text;
        return "";
      })
      .join("");
  }
  return "";
}

export function summarizeArgs(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "bash":
      return typeof args.command === "string" ? args.command : "";
    case "read":
    case "write":
    case "edit":
      return typeof args.path === "string" ? args.path : "";
    case "grep":
    case "find":
      return typeof args.pattern === "string" ? args.pattern : "";
    case "ls":
      return typeof args.path === "string" ? args.path : ".";
    default:
      try {
        const s = JSON.stringify(args);
        return s.length > 120 ? s.slice(0, 120) + "…" : s;
      } catch {
        return "";
      }
  }
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function findToolResult(messages: AgentMessage[], toolCallId: string): ToolResultMessage | undefined {
  for (const m of messages) {
    if (m.role === "toolResult" && m.toolCallId === toolCallId) return m;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Thinking block — collapsed by default, expands to reveal reasoning.
// ---------------------------------------------------------------------------
export function ThinkingBlock({ thinking, running }: { thinking: string; running: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(running);
  return (
    <div className={`block block-thinking ${open ? "open" : ""}`}>
      <div className="block-head" onClick={() => setOpen((v) => !v)}>
        <span className="chev">▸</span>
        {running ? <span className="spinner" style={{ width: 11, height: 11 }} /> : <span>💭</span>}
        <span className="kind">{t("block.thinking")}</span>
        {running && <span className="badge running">{t("block.running")}</span>}
      </div>
      {open && <div className="block-body">{thinking}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool block — compact head with state, expandable body.
// ---------------------------------------------------------------------------
type ToolState = "pending" | "running" | "done" | "error";

function toolState(exec: ToolExecState | undefined): ToolState {
  if (!exec) return "pending";
  if (exec.isError) return "error";
  if (exec.result === undefined) return "running";
  return "done";
}

export function ToolBlock({
  call,
  exec,
  result,
}: {
  call: ToolCall;
  exec?: ToolExecState;
  result?: ToolResultMessage;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const state = toolState(exec);
  const summary = summarizeArgs(call.name, call.arguments);
  const isEdit = call.name === "edit" || call.name === "write";
  const bodyText = contentToText(exec?.partial?.content ?? result?.content);
  const patch =
    (result?.details as { patch?: string } | undefined)?.patch ??
    (result?.details as { diff?: string } | undefined)?.diff;
  const duration = formatDuration(exec?.endTime && exec?.startTime ? exec.endTime - exec.startTime : undefined);

  return (
    <div className={`block ${state === "error" ? "block-error" : ""} ${open ? "open" : ""}`}>
      <div className="block-head" onClick={() => setOpen((v) => !v)}>
        <span className="chev">▸</span>
        {state === "running" && <span className="spinner" style={{ width: 11, height: 11 }} />}
        {state === "done" && <span style={{ color: "var(--success)" }}>✓</span>}
        {state === "error" && <span style={{ color: "var(--danger)" }}>✗</span>}
        {state === "pending" && <span style={{ color: "var(--text-faint)" }}>…</span>}
        <span className="kind">${call.name}</span>
        {summary && <span className="summary">{summary}</span>}
        {duration && <span className="dur">{duration}</span>}
      </div>
      {open && (
        <div className="block-body" style={isEdit && patch ? { padding: 0 } : undefined}>
          {isEdit && patch ? (
            <DiffViewer diff={patch} />
          ) : bodyText ? (
            bodyText
          ) : state === "error" ? (
            <span style={{ color: "var(--danger)" }}>{t("block.toolFailed")}</span>
          ) : (
            "—"
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assistant message — renders content blocks, wiring tool calls to live exec
// state and persisted tool results.
// ---------------------------------------------------------------------------
export function AssistantMessageView({
  message,
  streaming,
  execs,
  messages,
}: {
  message: AssistantMessage;
  streaming?: boolean;
  execs: Record<string, ToolExecState>;
  messages: AgentMessage[];
}) {
  const t = useT();
  return (
    <div className="msg-assistant">
      {message.content.map((block, i) => {
        if (block.type === "text") return <Markdown key={i} text={block.text} />;
        if (block.type === "thinking") {
          return <ThinkingBlock key={i} thinking={block.thinking} running={!!streaming} />;
        }
        if (block.type === "toolCall") {
          const exec = execs[block.id];
          const result = findToolResult(messages, block.id);
          return <ToolBlock key={i} call={block} exec={exec} result={result} />;
        }
        return null;
      })}
      {message.errorMessage && (
        <div className="block block-error">
          <div className="block-head">✗ {t("thread.error")}</div>
          <div className="block-body">{message.errorMessage}</div>
        </div>
      )}
    </div>
  );
}
