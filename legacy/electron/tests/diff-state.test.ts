import { describe, expect, it } from "vitest";
import { parseDiff } from "../src/renderer/src/lib/diff";
import { projectIdForPath, isGitRepo } from "../src/main/state";

describe("parseDiff", () => {
  it("classifies added, removed, hunk, and meta lines", () => {
    const diff = [
      "diff --git a/x.txt b/x.txt",
      "--- a/x.txt",
      "+++ b/x.txt",
      "@@ -1,2 +1,2 @@",
      " unchanged",
      "-removed",
      "+added",
    ].join("\n");
    const lines = parseDiff(diff);
    expect(lines[0].type).toBe("meta");
    expect(lines[1].type).toBe("meta");
    expect(lines[2].type).toBe("meta");
    expect(lines[3].type).toBe("hunk");
    expect(lines[4].type).toBe("ctx");
    expect(lines[5].type).toBe("del");
    expect(lines[6].type).toBe("add");
  });

  it("does not misclassify +++ / --- as add/del", () => {
    const lines = parseDiff("+++ b/x\n--- a/x\n+real add\n-real del\n");
    expect(lines[0].type).toBe("meta");
    expect(lines[1].type).toBe("meta");
    expect(lines[2].type).toBe("add");
    expect(lines[3].type).toBe("del");
  });
});

describe("projectIdForPath", () => {
  it("is deterministic and stable", () => {
    const a = projectIdForPath("/Users/me/project");
    const b = projectIdForPath("/Users/me/project");
    expect(a).toBe(b);
    expect(a).toMatch(/^proj-[0-9a-f]{8}$/);
  });

  it("differs for different paths", () => {
    expect(projectIdForPath("/a")).not.toBe(projectIdForPath("/b"));
  });
});
