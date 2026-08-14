import { useEffect, useState } from "react";
import { useApp } from "../store/useApp";
import { useT } from "../i18n";
import {
  loadRuntimeConfig,
  saveRuntimeConfigField,
  subscribeRuntimeConfig,
  type RuntimeConfig,
  type RuntimeMode,
} from "../lib/runtime-config";
import { createLatticeRemote } from "../lattice-remote";

type Section = "appearance" | "model" | "agent" | "runtime" | "about";

export function SettingsView() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const providers = useApp((s) => s.providers);
  const models = useApp((s) => s.models);
  const updateSettings = useApp((s) => s.updateSettings);
  const loadModels = useApp((s) => s.loadModels);
  const setApiKey = useApp((s) => s.setApiKey);

  const [section, setSection] = useState<Section>("appearance");
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const nav = [
    { id: "appearance" as Section, label: t("settings.appearance") },
    { id: "model" as Section, label: t("settings.model") },
    { id: "agent" as Section, label: t("settings.agent") },
    { id: "runtime" as Section, label: t("settings.runtime") },
    { id: "about" as Section, label: t("settings.about") },
  ];

  return (
    <div className="settings-view">
      <nav className="settings-nav">
        <div className="settings-nav-title">{t("settings.title")}</div>
        {nav.map((n) => (
          <button
            key={n.id}
            className={`settings-nav-item ${section === n.id ? "active" : ""}`}
            onClick={() => setSection(n.id)}
          >
            {n.label}
          </button>
        ))}
      </nav>

      <div className="settings-content">
        {section === "appearance" && (
          <SectionCard title={t("settings.appearance")}>
            <div className="field">
              <label>{t("settings.theme")}</label>
              <select
                value={settings.theme}
                onChange={(e) => void updateSettings({ theme: e.target.value as "dark" | "light" })}
              >
                <option value="dark">{t("settings.themeDark")}</option>
                <option value="light">{t("settings.themeLight")}</option>
              </select>
            </div>
            <div className="field">
              <label>{t("settings.language")}</label>
              <select
                value={settings.locale}
                onChange={(e) => void updateSettings({ locale: e.target.value as "en" | "zh" })}
              >
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </div>
            <div className="field">
              <label>{t("settings.fontSize")}</label>
              <input
                type="number"
                min={11}
                max={18}
                value={settings.fontSize}
                onChange={(e) => void updateSettings({ fontSize: Number(e.target.value) })}
              />
              <span className="hint">{t("settings.fontHint")}</span>
            </div>
          </SectionCard>
        )}

        {section === "model" && (
          <SectionCard title={t("settings.model")}>
            <p className="desc">
              {models.length > 0 ? (
                <>
                  <b>{models.filter((m) => m.available !== false).length}</b> {t("settings.modelsAvailable")}
                </>
              ) : (
                t("settings.noModels")
              )}
            </p>
            {providers.map((p) => (
              <div key={p.id} className="provider-row">
                <div className="provider-info">
                  <div className="provider-name">{p.name}</div>
                  <div className={`provider-state ${p.hasAuth ? "ok" : ""}`}>
                    {p.hasAuth ? t("settings.authenticated") : t("settings.noCredentials")}
                  </div>
                </div>
                {!p.hasAuth && (
                  <div className="provider-auth">
                    <input
                      type={showKeys[p.id] ? "text" : "password"}
                      placeholder={t("settings.apiKey")}
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
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={!(keyInputs[p.id] ?? "").trim()}
                      onClick={() => void setApiKey(p.id, keyInputs[p.id] ?? "")}
                    >
                      {t("settings.save")}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </SectionCard>
        )}

        {section === "agent" && (
          <SectionCard title={t("settings.agent")}>
            <div className="field">
              <label>{t("settings.sandbox")}</label>
              <select
                value={settings.sandboxMode}
                onChange={(e) => void updateSettings({ sandboxMode: e.target.value as "none" | "docker" })}
              >
                <option value="none">{t("settings.sandboxNone")}</option>
                <option value="docker" disabled>{t("settings.sandboxDocker")}</option>
              </select>
            </div>
            <div className="field">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.autoApproveReadOnly}
                  onChange={(e) => void updateSettings({ autoApproveReadOnly: e.target.checked })}
                />
                {t("settings.autoApprove")}
              </label>
            </div>
            <p className="desc">{t("settings.permDesc")}</p>
          </SectionCard>
        )}

        {section === "runtime" && <RuntimeSection />}

        {section === "about" && (
          <SectionCard title={t("settings.about")}>
            <p className="desc" style={{ marginBottom: 0 }}>
              {t("settings.aboutDesc")}
            </p>
          </SectionCard>
        )}
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="settings-section">
      <h2 className="settings-section-title">{title}</h2>
      <div className="section-card">{children}</div>
    </div>
  );
}

function RuntimeSection() {
  const t = useT();
  const [config, setConfig] = useState<RuntimeConfig>(() => loadRuntimeConfig());
  const [url, setUrl] = useState(config.remoteUrl);
  const [token, setToken] = useState(config.remoteToken);
  const [savedField, setSavedField] = useState<"url" | "token" | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);

  useEffect(
    () =>
      subscribeRuntimeConfig((next) => {
        setConfig(next);
        setUrl(next.remoteUrl);
        setToken(next.remoteToken);
      }),
    [],
  );

  const saveField = (key: "remoteUrl" | "remoteToken", value: string) => {
    saveRuntimeConfigField(key, value);
    setSavedField(key === "remoteUrl" ? "url" : "token");
  };

  const testConnection = async () => {
    if (!url.trim()) return;
    setTesting(true);
    setTestResult(null);
    const remote = createLatticeRemote({
      url: url.trim(),
      token: token.trim() || undefined,
    });
    try {
      await Promise.race([
        remote.getProviders(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
      ]);
      setTestResult("ok");
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
    }
  };

  return (
    <SectionCard title={t("settings.runtime")}>
      <div className="field">
        <label>{t("settings.runtimeMode")}</label>
        <select
          value={config.mode}
          onChange={(e) => saveRuntimeConfigField("mode", e.target.value as RuntimeMode)}
        >
          <option value="local">{t("settings.runtimeLocal")}</option>
          <option value="remote">{t("settings.runtimeRemote")}</option>
        </select>
      </div>
      <p className="desc">
        {config.mode === "remote"
          ? t("settings.runtimeRemoteNote")
          : t("settings.runtimeLocalNote")}
      </p>

      {config.mode === "remote" && (
        <>
          <div className="field">
            <label>{t("settings.runtimeUrl")}</label>
            <input
              value={url}
              placeholder="wss://host:8787"
              onChange={(e) => setUrl(e.target.value)}
            />
            <span className="hint">{t("settings.runtimeUrlHint")}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <button className="btn btn-sm" onClick={() => saveField("remoteUrl", url)}>
                {t("settings.save")}
              </button>
              {savedField === "url" && <span className="hint">{t("settings.runtimeSaved")}</span>}
            </div>
          </div>

          <div className="field">
            <label>{t("settings.runtimeToken")}</label>
            <input
              type="password"
              value={token}
              placeholder="token"
              onChange={(e) => setToken(e.target.value)}
            />
            <span className="hint">{t("settings.runtimeTokenHint")}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <button className="btn btn-sm" onClick={() => saveField("remoteToken", token)}>
                {t("settings.save")}
              </button>
              {savedField === "token" && <span className="hint">{t("settings.runtimeSaved")}</span>}
            </div>
          </div>

          <div className="field">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                className="btn btn-sm"
                disabled={testing || !url.trim()}
                onClick={() => void testConnection()}
              >
                {testing ? t("settings.runtimeTesting") : t("settings.runtimeTest")}
              </button>
              {testResult === "ok" && (
                <span className="hint" style={{ color: "var(--success, #3fb950)" }}>
                  {t("settings.runtimeOk")}
                </span>
              )}
              {testResult === "fail" && (
                <span className="hint" style={{ color: "var(--danger, #f85149)" }}>
                  {t("settings.runtimeFail")}
                </span>
              )}
            </div>
          </div>
        </>
      )}

      <div className="field">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn btn-sm btn-primary" onClick={() => window.location.reload()}>
            {t("settings.runtimeReconnect")}
          </button>
          <span className="hint">{t("settings.runtimeReconnectHint")}</span>
        </div>
      </div>
    </SectionCard>
  );
}
