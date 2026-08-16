import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useApp } from "../store/useApp";
import { useT } from "../i18n";
import {
  loadProfiles,
  addProfile,
  removeProfile,
  getActiveProfileId,
  setActiveProfileId,
  subscribeProfiles,
} from "../runtime/profiles-store";
import type { RuntimeProfile } from "../runtime/types";
import { RuntimeDiagnostics } from "../runtime/RuntimeDiagnostics";
import { useRuntime } from "../runtime/store";
import {
  loadTestResults,
  saveTestResult,
  testProfile,
  type RuntimeTestStatus,
} from "../runtime/test";
import { workbenchCommands } from "../workbench/commands";

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
            <div className="field" style={{ marginTop: 12 }}>
              <button
                className="btn btn-sm"
                onClick={() => workbenchCommands.resetLayout()}
              >
                {t("settings.resetLayout")}
              </button>
            </div>
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
  const [profiles, setProfiles] = useState<RuntimeProfile[]>(() => loadProfiles());
  const [activeId, setActiveId] = useState<string | null>(() => getActiveProfileId());
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [tests, setTests] = useState<Record<string, RuntimeTestStatus>>(() => {
    const results = loadTestResults();
    const map: Record<string, RuntimeTestStatus> = {};
    for (const [id, r] of Object.entries(results)) map[id] = r.ok ? "ok" : "fail";
    return map;
  });
  const [testing, setTesting] = useState<Set<string>>(new Set());
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeProfiles(() => {
        setProfiles(loadProfiles());
        setActiveId(getActiveProfileId());
      }),
    [],
  );

  const activate = (id: string) => {
    setActiveProfileId(id);
    void useRuntime.getState().selectProfile(id);
  };

  const runTest = async (profile: RuntimeProfile) => {
    setTesting((prev) => new Set(prev).add(profile.id));
    setTestError(null);
    const result = await testProfile(profile);
    saveTestResult(profile.id, result);
    setTests((prev) => ({ ...prev, [profile.id]: result.ok ? "ok" : "fail" }));
    setTesting((prev) => {
      const next = new Set(prev);
      next.delete(profile.id);
      return next;
    });
    if (!result.ok) setTestError(result.error ?? "connection failed");
  };

  const testPendingRemote = async () => {
    if (!url.trim()) return;
    await runTest({ id: "pending", name: name.trim() || url, provider: { type: "remote", url: url.trim(), token: token.trim() || undefined } });
  };

  const addRemote = () => {
    if (!name.trim() || !url.trim()) return;
    addProfile({
      id: `remote-${Date.now()}`,
      name: name.trim(),
      provider: { type: "remote", url: url.trim(), token: token.trim() || undefined },
    });
    setName("");
    setUrl("");
    setToken("");
    setTestError(null);
  };

  return (
    <SectionCard title={t("settings.runtime")}>
      <p className="desc">{t("settings.runtimeRemoteNote")}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {profiles.map((p) => {
          const kind =
            p.provider.type === "remote" ? t("settings.runtimeRemote") : t("settings.runtimeLocal");
          const status = testing.has(p.id) ? "testing" : (tests[p.id] ?? "untested");
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
              <TestDot status={status} />
              <label className="checkbox-label" style={{ flex: 1, cursor: "pointer", margin: 0 }}>
                <input
                  type="radio"
                  name="runtime-profile"
                  checked={activeId === p.id}
                  onChange={() => activate(p.id)}
                />
                <span style={{ fontWeight: activeId === p.id ? 600 : 400 }}>{p.name}</span>
                <span className="hint"> · {kind}</span>
                {p.provider.type === "remote" && (
                  <span className="hint" style={{ marginLeft: 6 }}>
                    {(p.provider as { url?: string }).url}
                  </span>
                )}
              </label>
              <button className="btn btn-sm" onClick={() => void runTest(p)} disabled={testing.has(p.id)}>
                {t("settings.runtimeTest")}
              </button>
              {p.provider.type === "remote" && (
                <button
                  className="icon-btn"
                  data-tooltip={t("sidebar.delete")}
                  onClick={() => removeProfile(p.id)}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label>{t("settings.runtimeAdd")}</label>
        <input value={name} placeholder={t("settings.runtimeName")} onChange={(e) => setName(e.target.value)} />
        <input value={url} placeholder="wss://host:8787" onChange={(e) => setUrl(e.target.value)} />
        <input
          type="password"
          value={token}
          placeholder={t("settings.runtimeToken")}
          onChange={(e) => setToken(e.target.value)}
        />
        {testError && <span className="hint" style={{ color: "var(--danger)" }}>{testError}</span>}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <button className="btn btn-sm" disabled={!name.trim() || !url.trim()} onClick={addRemote}>
            {t("settings.save")}
          </button>
          <button className="btn btn-sm" disabled={!url.trim()} onClick={() => void testPendingRemote()}>
            {t("settings.runtimeTest")}
          </button>
        </div>
      </div>

      <RuntimeDiagnostics />
    </SectionCard>
  );
}

function TestDot({ status }: { status: RuntimeTestStatus }) {
  const color =
    status === "ok"
      ? "var(--success)"
      : status === "fail"
        ? "var(--danger)"
        : status === "testing"
          ? "var(--warning)"
          : "var(--text-faint)";
  return <span className="status-dot" style={{ background: color, flexShrink: 0 }} />;
}

