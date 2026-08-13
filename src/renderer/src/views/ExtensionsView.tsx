import { useEffect, useState } from "react";
import { useApp } from "../store/useApp";
import type { InstalledPackage, RegistryPackage } from "@shared/types";

export function ExtensionsView() {
  const currentProject = useApp((s) => s.currentProject);
  const [installed, setInstalled] = useState<InstalledPackage[]>([]);
  const [registry, setRegistry] = useState<RegistryPackage[]>([]);
  const [source, setSource] = useState("");
  const [registryUrl, setRegistryUrl] = useState("");
  const [status, setStatus] = useState("");

  const cwd = currentProject?.path ?? "";

  const refresh = async () => {
    if (!cwd) return;
    const list = (await window.lattice.extList(cwd)) as InstalledPackage[];
    setInstalled(list);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd]);

  const install = async (src: string) => {
    setStatus(`Installing ${src}…`);
    try {
      await window.lattice.extInstall(cwd, src);
      setStatus("Installed.");
      setSource("");
      void refresh();
    } catch (e) {
      setStatus(`Failed: ${String(e)}`);
    }
  };

  const uninstall = async (src: string) => {
    await window.lattice.extUninstall(cwd, src);
    void refresh();
  };

  const loadRegistry = async () => {
    if (!registryUrl) return;
    setStatus(`Loading registry ${registryUrl}…`);
    try {
      const pkgs = (await window.lattice.extSearch(registryUrl)) as RegistryPackage[];
      setRegistry(pkgs);
      setStatus(`Loaded ${pkgs.length} packages.`);
    } catch (e) {
      setStatus(`Failed: ${String(e)}`);
    }
  };

  return (
    <div className="view">
      <div className="view-inner">
        <h1>Extensions</h1>
        <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
          Install Pi packages (extensions, skills, themes, prompts) from npm, git, or a local path.
        </p>

        <h2>Install</h2>
        <div className="card">
          <div className="field">
            <label>Source (npm:pkg · git:host/repo · /local/path)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="npm:@scope/pi-tools  ·  git:github.com/user/repo"
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary" onClick={() => void install(source)} disabled={!source || !cwd}>
                Install
              </button>
            </div>
          </div>
          <div className="field">
            <label>Registry (JSON manifest URL or path)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={registryUrl}
                onChange={(e) => setRegistryUrl(e.target.value)}
                placeholder="https://example.com/lattice-registry.json"
                style={{ flex: 1 }}
              />
              <button className="btn" onClick={() => void loadRegistry()}>
                Browse
              </button>
            </div>
          </div>
          {status && <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>{status}</p>}
        </div>

        {registry.length > 0 && (
          <>
            <h2>Registry</h2>
            <div className="card-list">
              {registry.map((p) => (
                <div className="card" key={p.id}>
                  <div className="card-row">
                    <div className="grow">
                      <div style={{ fontWeight: 500 }}>{p.displayName ?? p.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {p.author} · v{p.version} · {p.kinds.join(", ")}
                      </div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>{p.description}</div>
                    </div>
                    <button className="btn btn-sm btn-primary" onClick={() => void install(p.source)}>
                      Install
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <h2>Installed</h2>
        <div className="card-list">
          {installed.length === 0 && <div className="empty">Nothing installed yet</div>}
          {installed.map((p) => (
            <div className="card" key={p.source}>
              <div className="card-row">
                <div className="grow">
                  <div style={{ fontWeight: 500, fontFamily: "var(--font-mono)", fontSize: 13 }}>{p.source}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{p.location}</div>
                </div>
                <button className="btn btn-sm" onClick={() => void uninstall(p.source)}>
                  Uninstall
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
