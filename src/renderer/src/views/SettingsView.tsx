import { useEffect, useState } from "react";
import { useApp } from "../store/useApp";

export function SettingsView() {
  const settings = useApp((s) => s.settings);
  const providers = useApp((s) => s.providers);
  const models = useApp((s) => s.models);
  const updateSettings = useApp((s) => s.updateSettings);
  const loadModels = useApp((s) => s.loadModels);
  const setApiKey = useApp((s) => s.setApiKey);

  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  return (
    <div className="view">
      <div className="view-inner">
        <h1>Settings</h1>

        <h2>Appearance</h2>
        <div className="card">
          <div className="field">
            <label>Theme</label>
            <select
              value={settings.theme}
              onChange={(e) => void updateSettings({ theme: e.target.value as "dark" | "light" })}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
          <div className="field">
            <label>Font size</label>
            <input
              type="number"
              min={11}
              max={18}
              value={settings.fontSize}
              onChange={(e) => void updateSettings({ fontSize: Number(e.target.value) })}
            />
          </div>
        </div>

        <h2>Model & API</h2>
        <div className="card">
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 0 }}>
            Models available with current credentials: <b>{models.length}</b>
          </p>
          <div className="card-list">
            {providers.map((p) => (
              <div className="card" key={p.id}>
                <div className="card-row">
                  <div className="grow">
                    <div style={{ fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: p.hasAuth ? "var(--success)" : "var(--text-muted)" }}>
                      {p.hasAuth ? "authenticated" : "no credentials"}
                    </div>
                  </div>
                  {!p.hasAuth && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        type="password"
                        placeholder="API key"
                        value={keyInputs[p.id] ?? ""}
                        onChange={(e) => setKeyInputs((m) => ({ ...m, [p.id]: e.target.value }))}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          background: "var(--surface-1)",
                          color: "var(--text-primary)",
                        }}
                      />
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => void setApiKey(p.id, keyInputs[p.id] ?? "")}
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <h2>Agent & permissions</h2>
        <div className="card">
          <div className="field">
            <label>Sandbox mode</label>
            <select
              value={settings.sandboxMode}
              onChange={(e) => void updateSettings({ sandboxMode: e.target.value as "none" | "docker" })}
            >
              <option value="none">None (run with your user permissions)</option>
              <option value="docker">Docker (not yet enabled)</option>
            </select>
          </div>
          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={settings.autoApproveReadOnly}
                onChange={(e) => void updateSettings({ autoApproveReadOnly: e.target.checked })}
              />{" "}
              Auto-approve read-only tools (read, grep, find, ls)
            </label>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 12 }}>
            Tools that modify state (bash, write, edit) always ask for approval unless you choose
            &quot;Always allow&quot; when prompted. Approval decisions are stored per project.
          </p>
        </div>

        <h2>About</h2>
        <div className="card">
          <p style={{ margin: 0 }}>Lattice — desktop coding agent powered by the Pi runtime.</p>
          <p style={{ color: "var(--text-muted)", fontSize: 12 }}>
            Pi settings (compaction, retry, model defaults) are managed through Pi&apos;s own
            configuration files at <code>~/.pi/agent/settings.json</code> to avoid conflicts.
          </p>
        </div>
      </div>
    </div>
  );
}
