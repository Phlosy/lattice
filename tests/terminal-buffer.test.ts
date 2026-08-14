import { describe, expect, it } from "vitest";
import {
  appendTerminalData,
  clearTerminalBuffer,
  getTerminalBuffer,
} from "../src/renderer/src/lib/terminal-buffer";

describe("terminal buffers", () => {
  it("keeps output across terminal view switches and clears on close", () => {
    appendTerminalData("a", "hello");
    appendTerminalData("b", "other");
    appendTerminalData("a", " world");
    expect(getTerminalBuffer("a")).toBe("hello world");
    expect(getTerminalBuffer("b")).toBe("other");
    clearTerminalBuffer("a");
    expect(getTerminalBuffer("a")).toBe("");
    clearTerminalBuffer("b");
  });
});
