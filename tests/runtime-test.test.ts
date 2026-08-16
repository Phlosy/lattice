// Runtime connectivity test status — gray (untested) / red (fail) / green (ok)
// mapping + persistence. Pure except for localStorage, which is stubbed.

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadTestResults,
  saveTestResult,
  testStatus,
} from "../src/renderer/src/runtime/test";

describe("runtime test status", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      _store: {} as Record<string, string>,
      getItem(k: string) {
        return this._store[k] ?? null;
      },
      setItem(k: string, v: string) {
        this._store[k] = v;
      },
      removeItem(k: string) {
        delete this._store[k];
      },
    });
  });

  it("defaults to untested", () => {
    expect(testStatus("any")).toBe("untested");
  });

  it("persists ok/fail and reflects status", () => {
    saveTestResult("a", { ok: true, at: 1 });
    saveTestResult("b", { ok: false, at: 1, error: "boom" });
    expect(testStatus("a")).toBe("ok");
    expect(testStatus("b")).toBe("fail");
  });

  it("loads empty on corrupt storage", () => {
    (localStorage as any)._store["lattice.runtime.test.v1"] = "{nope";
    expect(loadTestResults()).toEqual({});
  });
});
