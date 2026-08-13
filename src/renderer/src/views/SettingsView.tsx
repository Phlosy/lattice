import { useEffect, useState } from "react";
import { useApp } from "../store/useApp";
import { useT } from "../i18n";

export function SettingsView() {
  const t = useT();
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
        <h1>{t("settings.title")}</h1>

        <h2>{t("settings.appearance")}</h2>
        <div className="section-card">
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
        </div>

        <h2>{t("settings.model")}</h2>
        <div className="section-card">
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
                  <button className="btn btn-sm btn-primary" onClick={() => void setApiKey(p.id, keyInputs[p.id] ?? "")}>
                    {t("settings.save")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <h2>{t("settings.agent")}</h2>
        <div className="section-card">
          <div className="field">
            <label>{t("settings.sandbox")}</label>
            <select
              value={settings.sandboxMode}
              onChange={(e) => void updateSettings({ sandboxMode: e.target.value as "none" | "docker" })}
            >
              <option value="none">{t("settings.sandboxNone")}</option>
              <option value="docker">{t("settings.sandboxDocker")}</option>
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
        </div>

        <h2>{t("settings.about")}</h2>
        <div className="section-card">
          <p className="desc" style={{ marginBottom: 0 }}>
            {t("settings.aboutDesc")}
          </p>
        </div>
      </div>
    </div>
  );
}
