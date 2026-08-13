import { describe, expect, it } from "vitest";
import { classifyTool } from "../src/main/runtime/dialog-bridge";

describe("permission policy", () => {
  it("allows read-only tools by default", () => {
    expect(classifyTool("read")).toBe("always-allow");
    expect(classifyTool("grep")).toBe("always-allow");
    expect(classifyTool("find")).toBe("always-allow");
    expect(classifyTool("ls")).toBe("always-allow");
  });

  it("requires approval for mutating tools", () => {
    expect(classifyTool("bash")).toBe("require-approval");
    expect(classifyTool("write")).toBe("require-approval");
    expect(classifyTool("edit")).toBe("require-approval");
  });

  it("allows unknown/custom tools by default", () => {
    expect(classifyTool("my_custom_tool")).toBe("allow-by-default");
  });
});
