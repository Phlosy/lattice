// RuntimeLoadingOverlay — floating modal shown while a runtime profile switch
// is in flight (local ⇄ local, or any connect), so the UI never flashes to a
// blank screen during the sidecar restart.

import { useRuntime } from "./store";

export function RuntimeLoadingOverlay() {
  const transitioning = useRuntime((s) => s.transitioning);
  const profileName = useRuntime((s) => s.profile?.name);

  if (!transitioning) return null;

  return (
    <div className="runtime-loading-overlay">
      <div className="runtime-loading-card">
        <span className="spinner" />
        <div className="runtime-loading-title">Switching runtime</div>
        <div className="runtime-loading-sub">Connecting to {profileName ?? "runtime"}…</div>
      </div>
    </div>
  );
}
