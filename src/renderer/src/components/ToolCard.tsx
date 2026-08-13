import { useState } from "react";
import type { ToolExecState } from "../lib/session-reducer";
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

interface ToolCardProps {
  toolName: string;
  args: Record<string, unknown>;
  resultContent?: unknown;
  resultDetails?: unknown;
  isError?: boolean;
  exec?: ToolExecState;
}

export function ToolCard({ toolName, args, resultContent, resultDetails, isError, exec }: ToolCardProps) {
  const [open, setOpen] = useState(false);

  const command = typeof args?.command === "string" ? args.command : undefined;
  const path = typeof args?.path === "string" ? args.path : undefined;
  const summary = command ?? (path ? `${toolName} ${path}` : toolName);

  const running = exec && !exec.result && !exec.isError;
  const isEdit = toolName === "edit" || toolName === "write";

  const bodyText = contentToText(exec?.partial?.content ?? resultContent);
  const patch =
    (resultDetails as { patch?: string } | undefined)?.patch ??
    (resultDetails as { diff?: string } | undefined)?.diff;

  return (
    <div className={`tool-card ${isError ? "error" : ""} ${running ? "running" : ""}`}>
      <div className="tool-card-head" onClick={() => setOpen((v) => !v)}>
        <span>{open ? "▾" : "▸"}</span>
        <span style={{ color: "var(--text-primary)" }}>${toolName}</span>
        <span className="cmd">{summary}</span>
        {running && <span style={{ color: "var(--accent)" }}>…</span>}
        {isError && <span style={{ color: "var(--danger)" }}>failed</span>}
      </div>
      {open && (
        <div className="tool-card-body">
          {isEdit && patch ? (
            <DiffViewer diff={patch} />
          ) : bodyText ? (
            bodyText
          ) : isError ? (
            <span style={{ color: "var(--danger)" }}>Tool returned an error.</span>
          ) : (
            "—"
          )}
        </div>
      )}
    </div>
  );
}
