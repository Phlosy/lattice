import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import type { LatticeApi } from "../../shared/api";
import { useApp } from "./store/useApp";
import "./styles/tokens.css";

// Type declaration for the preload-exposed API.
declare global {
  interface Window {
    lattice: LatticeApi;
    __latticeStore: typeof useApp;
  }
}

// Expose the store so the visual-regression driver can reach UI state.
window.__latticeStore = useApp;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
