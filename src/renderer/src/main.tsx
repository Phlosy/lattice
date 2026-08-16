import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import type { LatticeApi } from "../../shared/api";
import { useApp } from "./store/useApp";
import { createLatticeStub } from "./lattice-stub";
import { RuntimeManager } from "./runtime/manager";
import {
  loadProfiles,
  getActiveProfileId,
  migrateLegacyRuntimeConfig,
} from "./runtime/profiles-store";
import "./styles/tokens.css";

// Type declaration for the preload-exposed API.
declare global {
  interface Window {
    lattice: LatticeApi;
    __latticeStore: typeof useApp;
  }
}

function isMobileWebView(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

const runtimeManager = new RuntimeManager();

function selectAdapter(): LatticeApi {
  const tauri = (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  if (!tauri) return createLatticeStub();

  // One-time migration from the old single-config model.
  migrateLegacyRuntimeConfig();

  const profiles = loadProfiles();
  const activeId = getActiveProfileId();
  const active = profiles.find((p) => p.id === activeId);

  // Mobile cannot spawn a local Pi; it needs a remote profile.
  if (isMobileWebView()) {
    const remote = active?.provider?.type === "remote" ? active : undefined;
    return remote ? runtimeManager.connect(remote, null).api : createLatticeStub();
  }

  // Fallback order: explicit profile → compatible installed Pi → bundled Pi.
  return runtimeManager.connect(active, null).api;
}

if (!window.lattice) {
  window.lattice = selectAdapter();
}

// Expose the store so the visual-regression driver can reach UI state.
window.__latticeStore = useApp;

// Tag the document with the platform so CSS can adapt (e.g. macOS traffic lights).
window.lattice.appInfo().then((info) => {
  document.body.dataset.platform = info.platform;
});

// Capture runtime errors so the capture driver can inspect them.
(globalThis as unknown as { __latticeErrors: string[] }).__latticeErrors = [];
const pushError = (msg: string) => {
  (globalThis as unknown as { __latticeErrors: string[] }).__latticeErrors.push(msg);
};
window.addEventListener("error", (e) => pushError(String(e.message)));
window.addEventListener("unhandledrejection", (e) => pushError(String(e.reason)));
const origError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  pushError(args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "));
  origError(...args);
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
