// RuntimeDiagnostics — developer-facing runtime status: connection state, info,
// capabilities, copy + reconnect. Kept technical and out of the normal user flow.

import { useRuntime } from "./store";
import { useT } from "../i18n";

const CAPABILITY_LABELS: Record<string, string> = {
  chat: "Chat",
  sessions: "Sessions",
  sessionResume: "Session resume",
  filesystem: "Filesystem",
  git: "Git",
  shell: "Shell",
  pty: "PTY",
  skills: "Skills",
  extensions: "Extensions",
  subagents: "Subagents",
  remoteFilesystem: "Remote filesystem",
};

export function RuntimeDiagnostics() {
  const t = useT();
  const state = useRuntime((s) => s.state);
  const info = useRuntime((s) => s.info);
  const capabilities = useRuntime((s) => s.capabilities);
  const profile = useRuntime((s) => s.profile);
  const connect = useRuntime((s) => s.connect);

  const copy = () => {
    const diagnostics = { state, info, capabilities, profileId: profile?.id };
    void navigator.clipboard?.writeText(JSON.stringify(diagnostics, null, 2));
  };

  const reconnect = () => {
    if (profile) void connect(profile);
  };

  return (
    <div className="runtime-diagnostics">
      <div className="diag-row">
        <span>State</span>
        <b>{state}</b>
      </div>
      {info && (
        <>
          <div className="diag-row"><span>Name</span><b>{info.name}</b></div>
          <div className="diag-row"><span>Provider</span><b>{info.provider}</b></div>
          <div className="diag-row"><span>Location</span><b>{info.location}</b></div>
          <div className="diag-row"><span>Platform</span><b>{info.platform ?? "—"}</b></div>
          <div className="diag-row"><span>Pi Home</span><b>{info.piHome ?? "—"}</b></div>
          {info.executablePath && (
            <div className="diag-row"><span>Executable</span><b>{info.executablePath}</b></div>
          )}
          {info.version && (
            <div className="diag-row"><span>Version</span><b>{info.version}</b></div>
          )}
        </>
      )}
      <div className="diag-capabilities">
        {Object.entries(capabilities).map(([key, value]) => (
          <div key={key} className="diag-row">
            <span>{CAPABILITY_LABELS[key] ?? key}</span>
            <b style={{ color: value ? "var(--success)" : "var(--text-faint)" }}>
              {value ? "✓" : "✗"}
            </b>
          </div>
        ))}
      </div>
      <div className="diag-actions">
        <button className="btn btn-sm" onClick={copy}>Copy diagnostics</button>
        <button className="btn btn-sm" onClick={reconnect} disabled={!profile}>
          {t("settings.runtimeReconnect")}
        </button>
      </div>
    </div>
  );
}
