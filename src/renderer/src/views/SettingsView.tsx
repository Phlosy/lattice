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
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  return (
    <div className="view">
      <div className="view-inner">
        <h1>Settings</h1>

        <h2>Appearance</h2>
        <div className="section-card">
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
            <span className="hint">Scales the whole interface (default 13).</span>
          </div>
        </div>

        <h2>Model & API</h2>
        <div className="section-card">
          <p className="desc">
            {models.length > 0 ? (
              <>
                <b>{models.length}</b> model{models.length === 1 ? "" : "s"} available with current credentials.
              </>
            ) : (
              "No models available. Add an API key for a provider below."
            )}
          </p>
          {providers.map((p) => (
            <div key={p.id} className="provider-row">
              <div className="provider-info">
                <div className="provider-name">{p.name}</div>
                <div className={`provider-state ${p.hasAuth ? "ok" : ""}`}>
                  {p.hasAuth ? "authenticated" : "no credentials"}
                </div>
              </div>
              {!p.hasAuth && (
                <div className="provider-auth">
                  <input
                    type={showKeys[p.id] ? "text" : "password"}
                    placeholder="API key"
                    value={keyInputs[p.id] ?? ""}
                    onChange={(e) => setKeyInputs((m) => ({ ...m, [p.id]: e.target.value }))}
                  />
                  <button
                    className="icon-btn"
                    data-tooltip={showKeys[p.id] ? "Hide" : "Show"}
                    onClick={() => setShowKeys((m) => ({ ...m, [p.id]: !m[p.id] }))}
                  >
                    👁
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={() => void setApiKey(p.id, keyInputs[p.id] ?? "")}>
                    Save
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <h2>Agent & permissions</h2>
        <div className="section-card">
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
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.autoApproveReadOnly}
                onChange={(e) => void updateSettings({ autoApproveReadOnly: e.target.checked })}
              />
              Auto-approve read-only tools (read, grep, find, ls)
            </label>
          </div>
          <p className="desc">
            Mutating tools (bash, write, edit) always ask for approval unless you choose &quot;Always allow&quot;
            when prompted. Decisions are stored per project.
          </p>
        </div>

        <h2>About</h2>
        <div className="section-card">
          <p className="desc" style={{ marginBottom: 0 }}>
            Lattice — a desktop coding agent powered by the Pi runtime.
          </p>
        </div>
      </div>
    </div>
  );
}
