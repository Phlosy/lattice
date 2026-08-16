// Runtime connectivity test — gray (untested) / red (failed) / green (ok).
// Local profiles probe the Rust Desktop Core (discovery / sidecar status);
// remote profiles open a throwaway WSS connection. Results persist to
// localStorage so status survives restarts.

import type { RuntimeProfile } from "./types";
import { discoverInstalledPi } from "./discovery-client";
import { createLatticeRemote } from "../lattice-remote";

export interface RuntimeTestResult {
  ok: boolean;
  at: number;
  detail?: string;
  error?: string;
}

export type RuntimeTestStatus = "untested" | "testing" | "ok" | "fail";

const TEST_KEY = "lattice.runtime.test.v1";

export function loadTestResults(): Record<string, RuntimeTestResult> {
  try {
    const raw = localStorage.getItem(TEST_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveTestResult(id: string, result: RuntimeTestResult): void {
  const all = loadTestResults();
  all[id] = result;
  try {
    localStorage.setItem(TEST_KEY, JSON.stringify(all));
  } catch {
    /* ignore quota errors */
  }
}

export function testStatus(id: string): RuntimeTestStatus {
  const result = loadTestResults()[id];
  return result ? (result.ok ? "ok" : "fail") : "untested";
}

function tauriInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  const tauri = (window as unknown as { __TAURI__?: { core: { invoke: (c: string, a?: Record<string, unknown>) => Promise<unknown> } } }).__TAURI__;
  if (!tauri) return Promise.reject(new Error("not running in desktop"));
  return tauri.core.invoke(cmd, args);
}

export async function testProfile(profile: RuntimeProfile): Promise<RuntimeTestResult> {
  const provider = profile.provider;
  try {
    if (provider.type === "installed") {
      const found = await discoverInstalledPi();
      if (found) {
        return { ok: true, at: Date.now(), detail: found.executablePath };
      }
      return { ok: false, at: Date.now(), error: "No Pi binary found on PATH" };
    }

    if (provider.type === "bundled") {
      const status = (await tauriInvoke("pi_status")) as { state?: string };
      const state = status?.state ?? "";
      if (state === "FAILED") {
        return { ok: false, at: Date.now(), error: "Pi failed to start" };
      }
      return { ok: true, at: Date.now(), detail: `state=${state || "STOPPED"}` };
    }

    // remote — throwaway WSS probe; never touches the active runtime.
    const { url, token } = provider;
    return await new Promise<RuntimeTestResult>((resolve) => {
      let settled = false;
      const finish = (result: RuntimeTestResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(
        () => finish({ ok: false, at: Date.now(), error: "connection timed out" }),
        8000,
      );
      createLatticeRemote({
        url,
        token,
        onStatus: (status) => {
          if (status === "connected") finish({ ok: true, at: Date.now(), detail: url });
          else if (status === "error") finish({ ok: false, at: Date.now(), error: "connection failed" });
        },
      });
    });
  } catch (error) {
    return { ok: false, at: Date.now(), error: String(error) };
  }
}
