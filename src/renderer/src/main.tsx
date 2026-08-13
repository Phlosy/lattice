import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import type { LatticeApi } from "../../shared/api";
import "./styles/tokens.css";

// Type declaration for the preload-exposed API.
declare global {
  interface Window {
    lattice: LatticeApi;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
