import { describe, expect, it } from "vitest";
import { Model } from "flexlayout-react";
import { defaultLayoutJson } from "../src/renderer/src/workbench/layout";

describe("workbench layout model", () => {
  it("default is a vertical split: conversation top, [terminal, git] bottom", () => {
    const json = defaultLayoutJson();
    expect(json.global?.rootOrientationVertical).toBe(true);

    const root = json.layout;
    expect(root.type).toBe("row");
    expect(root.children?.length).toBe(2);

    const [top, bottom] = root.children ?? [];
    expect(top.type).toBe("tabset");
    expect(bottom.type).toBe("tabset");

    const topTabs = (top as { children?: Array<{ component?: string }> }).children ?? [];
    const bottomTabs = (bottom as { children?: Array<{ component?: string }> }).children ?? [];
    expect(topTabs.map((t) => t.component)).toEqual(["conversation"]);
    expect(bottomTabs.map((t) => t.component)).toEqual(["terminal", "git"]);
  });

  it("round-trips through the FlexLayout Model (fromJson → toJson)", () => {
    const model = Model.fromJson(defaultLayoutJson());
    const json = model.toJson();
    expect(json.layout?.children?.length).toBe(2);
    // The serialized tree keeps the two tabsets in order.
    const components = (json.layout.children ?? []).flatMap((n) =>
      n.type === "tabset" ? ((n.children ?? []) as Array<{ component?: string }>).map((t) => t.component) : [],
    );
    expect(components).toContain("conversation");
    expect(components).toContain("terminal");
    expect(components).toContain("git");
  });

  it("conversation tab is non-closable in the default layout", () => {
    const json = defaultLayoutJson();
    const top = json.layout.children?.[0];
    const conv = (top as { children?: Array<{ component?: string; enableClose?: boolean }> })
      ?.children?.[0];
    expect(conv?.component).toBe("conversation");
    expect(conv?.enableClose).toBe(false);
  });
});
