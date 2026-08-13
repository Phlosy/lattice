import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import type { LatticeApi } from "../../shared/api";
import { useApp } from "./store/useApp";
import { createLatticeStub } from "./lattice-stub";
import { createLatticeTauri } from "./lattice-tauri";
import { createLatticeRemote } from "./lattice-remote";
import "./styles/tokens.css";

// Type declaration for the preload-exposed API.
declare global {
  interface Window {
    lattice: LatticeApi;
    __latticeStore: typeof useApp;
  }
}

const RUNTIME_URL_KEY = "lattice.runtime.url";
const RUNTIME_TOKEN_KEY = "lattice.runtime.token";

function isMobileWebView(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function selectAdapter(): LatticeApi {
  const tauri = (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  if (!tauri) return createLatticeStub();
  // Mobile (Android/iOS WebView): the Tauri shell cannot spawn a local Pi
  // sidecar, so use the Remote adapter when a runtime host is configured.
  if (isMobileWebView()) {
    const url = localStorage.getItem(RUNTIME_URL_KEY);
    const token = localStorage.getItem(RUNTIME_TOKEN_KEY) ?? undefined;
    return url ? createLatticeRemote({ url, token }) : createLatticeStub();
  }
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
