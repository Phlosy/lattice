import { describe, expect, it } from "vitest";
import { initialTranscript, reduceTranscript } from "../src/renderer/src/lib/session-reducer";

describe("reduceTranscript", () => {
  it("sets running on agent_start and clears on agent_settled", () => {
    let s = reduceTranscript(initialTranscript, { type: "agent_start" });
    expect(s.running).toBe(true);
    s = reduceTranscript(s, { type: "agent_settled" });
    expect(s.running).toBe(false);
  });

  it("appends a user message on message_start", () => {
    const s = reduceTranscript(initialTranscript, {
      type: "message_start",
      message: { role: "user", content: "hi", timestamp: 1 },
    });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].role).toBe("user");
  });

  it("streams assistant text across message_update deltas", () => {
    let s = reduceTranscript(initialTranscript, {
      type: "message_start",
      message: { role: "assistant", content: [], timestamp: 1 },
    });
    s = reduceTranscript(s, { type: "message_update", assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
    s = reduceTranscript(s, { type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hel" } });
    s = reduceTranscript(s, { type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "lo" } });
    expect(s.streaming?.content[0]).toEqual({ type: "text", text: "Hello" });
    expect(s.messages).toHaveLength(0);
  });

  it("finalizes the assistant message on message_end", () => {
    let s = reduceTranscript(initialTranscript, {
      type: "message_start",
      message: { role: "assistant", content: [], timestamp: 1 },
    });
    s = reduceTranscript(s, {
      type: "message_end",
      message: { role: "assistant", content: [{ type: "text", text: "done" }], timestamp: 1 },
    });
    expect(s.streaming).toBeNull();
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].role).toBe("assistant");
  });

  it("tracks tool execution start/update/end", () => {
    let s = reduceTranscript(initialTranscript, {
      type: "tool_execution_start",
      toolCallId: "c1",
      toolName: "read",
      args: { path: "a.txt" },
    });
    expect(s.toolExecutions.c1.toolName).toBe("read");

    s = reduceTranscript(s, {
      type: "tool_execution_end",
      toolCallId: "c1",
      toolName: "read",
      result: { content: [{ type: "text", text: "ok" }] },
      isError: false,
    });
    expect(s.toolExecutions.c1.result).toBeDefined();
    expect(s.toolExecutions.c1.isError).toBe(false);
  });

  it("does not duplicate a message on message_start followed by message_end", () => {
    const msg = { role: "user", content: "x", timestamp: 1 };
    let s = reduceTranscript(initialTranscript, { type: "message_start", message: msg });
    s = reduceTranscript(s, { type: "message_end", message: msg });
    expect(s.messages).toHaveLength(1);
  });

  it("updates queue state", () => {
    const s = reduceTranscript(initialTranscript, {
      type: "queue_update",
      steering: ["a"],
      followUp: ["b"],
    });
    expect(s.steering).toEqual(["a"]);
    expect(s.followUp).toEqual(["b"]);
  });
});
