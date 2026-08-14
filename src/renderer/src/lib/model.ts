import type { ModelInfo } from "@shared/types";

/** Fallback reasoning levels when a model doesn't expose thinkingLevelMap. */
export const DEFAULT_THINKING_LEVELS = ["low", "medium", "high"] as const;

/**
 * Derive supported reasoning levels from Pi's per-model `thinkingLevelMap`
 * (keys whose value is non-null are the levels the provider accepts). Falls
 * back to the common levels for reasoning models that omit the map.
 */
export function normalizeModel(model: ModelInfo): ModelInfo {
  const map = (
    model as unknown as { thinkingLevelMap?: Record<string, string | null> }
  ).thinkingLevelMap;
  const levels = map
    ? Object.keys(map).filter((key) => map[key] != null)
    : model.reasoning
      ? [...DEFAULT_THINKING_LEVELS]
      : undefined;
  return { ...model, thinkingLevels: levels };
}
