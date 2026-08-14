import { describe, expect, it } from "vitest";
import { normalizeModel, DEFAULT_THINKING_LEVELS } from "../src/renderer/src/lib/model";
import type { ModelInfo } from "../src/shared/types";

function model(overrides: Partial<ModelInfo> = {}): ModelInfo {
  return {
    id: "m1",
    name: "Model",
    provider: "deepseek",
    reasoning: true,
    contextWindow: 128000,
    maxTokens: 4096,
    input: ["text"],
    ...overrides,
  };
}

describe("normalizeModel (thinking capability mapping)", () => {
  it("derives levels from Pi thinkingLevelMap (non-null keys)", () => {
    const raw = model() as ModelInfo & { thinkingLevelMap: Record<string, string | null> };
    raw.thinkingLevelMap = { minimal: null, low: "low", medium: null, high: "high", max: "max" };
    const out = normalizeModel(raw);
    expect(out.thinkingLevels).toEqual(["low", "high", "max"]);
  });

  it("falls back to common levels for reasoning models without a map", () => {
    const out = normalizeModel(model({ reasoning: true }));
    expect(out.thinkingLevels).toEqual([...DEFAULT_THINKING_LEVELS]);
  });

  it("returns no levels for non-reasoning models", () => {
    const out = normalizeModel(model({ reasoning: false }));
    expect(out.thinkingLevels).toBeUndefined();
  });

  it("preserves other model fields", () => {
    const out = normalizeModel(model({ id: "deepseek-chat", reasoning: true }));
    expect(out.id).toBe("deepseek-chat");
    expect(out.provider).toBe("deepseek");
    expect(out.contextWindow).toBe(128000);
  });
});
