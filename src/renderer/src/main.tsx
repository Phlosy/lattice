import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import type { LatticeApi } from "../../shared/api";
import { useApp } from "./store/useApp";
import { createLatticeStub } from "./lattice-stub";
import { createLatticeTauri } from "./lattice-tauri";
import { createLatticeRemote } from "./lattice-remote";
import { loadRuntimeConfig } from "./lib/runtime-config";
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

function selectAdapter(): LatticeApi {
  const tauri = (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  if (!tauri) return createLatticeStub();
  const config = loadRuntimeConfig();
  // Remote mode: route all LatticeApi traffic over WebSocket to a Runtime Host,
  // whether on desktop or mobile. A URL is required to select it.
  if (config.mode === "remote" && config.remoteUrl) {
    return createLatticeRemote({
      url: config.remoteUrl,
      token: config.remoteToken || undefined,
    });
  }
  // Local mode. Mobile cannot spawn a local Pi sidecar, so fall back to stub.
  if (isMobileWebView()) return createLatticeStub();
  return createLatticeTauri();
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
