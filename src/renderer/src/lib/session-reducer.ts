// Pure session-transcript reducer. Reduces the Pi event stream into a display
// transcript. Kept pure so it can be unit-tested independently of the UI.

import type { AgentMessage, AssistantMessage } from "@shared/types";

export interface ToolExecState {
  toolName: string;
  args: Record<string, unknown>;
  startTime?: number;
  endTime?: number;
  partial?: { content?: Array<{ type: string; text?: string }> };
  result?: unknown;
  isError?: boolean;
}

export interface TranscriptState {
  messages: AgentMessage[];
  streaming: AssistantMessage | null;
  running: boolean;
  toolExecutions: Record<string, ToolExecState>;
  steering: string[];
  followUp: string[];
  lastError?: string;
}

export const initialTranscript: TranscriptState = {
  messages: [],
  streaming: null,
  running: false,
  toolExecutions: {},
  steering: [],
  followUp: [],
};

type Event = Record<string, any>;

export function reduceTranscript(state: TranscriptState, event: Event): TranscriptState {
  switch (event.type) {
    case "agent_start":
      return { ...state, running: true, lastError: undefined };

    case "agent_end":
      // willRetry keeps the run active; agent_settled will clear it.
      return state;

    case "agent_settled":
      return { ...state, running: false, streaming: null };

    case "message_start": {
      const msg = event.message as AgentMessage;
      if (msg.role === "assistant") {
        return {
          ...state,
          streaming: { role: "assistant", content: [], timestamp: Date.now() },
        };
      }
      // Non-assistant messages are complete at start; append once.
      if (isTranscriptRole(msg.role)) {
        return { ...state, messages: appendOnce(state.messages, msg) };
      }
      return state;
    }

    case "message_update":
      return { ...state, streaming: applyDelta(state.streaming, event.assistantMessageEvent) };

    case "message_end": {
      const msg = event.message as AgentMessage;
      if (msg.role === "assistant") {
        return { ...state, messages: [...state.messages, msg as AssistantMessage], streaming: null };
      }
      return state;
    }

    case "tool_execution_start":
      return {
        ...state,
        toolExecutions: {
          ...state.toolExecutions,
          [event.toolCallId]: { toolName: event.toolName, args: event.args ?? {}, startTime: Date.now() },
        },
      };

    case "tool_execution_update":
      return {
        ...state,
        toolExecutions: {
          ...state.toolExecutions,
          [event.toolCallId]: {
            ...(state.toolExecutions[event.toolCallId] ?? { toolName: event.toolName, args: {} }),
            partial: event.partialResult,
          },
        },
      };

    case "tool_execution_end":
      return {
        ...state,
        toolExecutions: {
          ...state.toolExecutions,
          [event.toolCallId]: {
            ...(state.toolExecutions[event.toolCallId] ?? { toolName: event.toolName, args: {} }),
            result: event.result,
            isError: event.isError,
            endTime: Date.now(),
          },
        },
      };

    case "queue_update":
      return { ...state, steering: event.steering ?? [], followUp: event.followUp ?? [] };

    case "auto_retry_end":
      if (event.success === false && event.finalError) {
        return { ...state, lastError: String(event.finalError) };
      }
      return state;

    default:
      return state;
  }
}

function isTranscriptRole(role: string): boolean {
  return (
    role === "user" ||
    role === "toolResult" ||
    role === "custom" ||
    role === "bashExecution" ||
    role === "branchSummary" ||
    role === "compactionSummary"
  );
}

function appendOnce(messages: AgentMessage[], msg: AgentMessage): AgentMessage[] {
  // Avoid duplicates: message_start + message_end can both fire for the same
  // message. Compare by identity (object reference) is enough for the live
  // stream; a re-fetch reconciles the rest.
  if (messages.length > 0 && messages[messages.length - 1] === msg) return messages;
  return [...messages, msg];
}

function applyDelta(
  streaming: AssistantMessage | null,
  delta: { type: string; contentIndex: number; [k: string]: unknown },
): AssistantMessage | null {
  if (!streaming) return streaming;
  const content = [...streaming.content];
  const idx = delta.contentIndex;

  switch (delta.type) {
    case "text_start":
      content[idx] = { type: "text", text: "" };
      break;
    case "text_delta":
      if (content[idx]?.type === "text") {
        content[idx] = { type: "text", text: content[idx].text + (delta.delta as string) };
      }
      break;
    case "thinking_start":
      content[idx] = { type: "thinking", thinking: "" };
      break;
    case "thinking_delta":
      if (content[idx]?.type === "thinking") {
        content[idx] = {
          type: "thinking",
          thinking: (content[idx] as { thinking: string }).thinking + (delta.delta as string),
        };
      }
      break;
    case "toolcall_start":
      content[idx] = { type: "toolCall", id: (delta.toolCall as { id: string }).id, name: (delta.toolCall as { name: string }).name, arguments: {} };
      break;
    case "toolcall_delta":
      if (content[idx]?.type === "toolCall") {
        const c = content[idx] as { id: string; name: string; arguments: Record<string, unknown> };
        const raw = ((c.arguments._raw as string) ?? "") + (delta.delta as string);
        content[idx] = {
          type: "toolCall",
          id: c.id,
          name: c.name,
          arguments: { ...c.arguments, _raw: raw },
        };
      }
      break;
    case "toolcall_end":
      content[idx] = { type: "toolCall", ...(delta.toolCall as object) } as never;
      break;
    default:
      break;
  }
  return { ...streaming, content };
}
