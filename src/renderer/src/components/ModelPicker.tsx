// ModelPicker — the single model selector (header). Capability-driven via
// the model list; selecting requires an active session (guarded in the store).

import { useEffect, useRef, useState } from "react";
import { useApp } from "../store/useApp";
import { useT } from "../i18n";
import type { ModelInfo } from "@shared/types";

function groupModels(models: ModelInfo[]): Array<{ provider: string; models: ModelInfo[] }> {
  const map = new Map<string, ModelInfo[]>();
  for (const m of models) {
    const list = map.get(m.provider) ?? [];
    list.push(m);
    map.set(m.provider, list);
  }
  return [...map.entries()].map(([provider, models]) => ({ provider, models }));
}

export function ModelPicker({ align = "right" }: { align?: "left" | "right" }) {
  const t = useT();
  const models = useApp((s) => s.models);
  const sessionState = useApp((s) => s.sessionState);
  const loadModels = useApp((s) => s.loadModels);
  const setModel = useApp((s) => s.setModel);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const model = sessionState?.model;
  // Keep the picker clickable whenever models are available. Setting a model
  // still requires an active session (guarded in the store), but browsing the
  // list should never be blocked.
  const disabled = models.length === 0;
  const filtered = query.trim()
    ? models.filter(
        (m) =>
          m.name.toLowerCase().includes(query.toLowerCase()) ||
          m.provider.toLowerCase().includes(query.toLowerCase()) ||
          m.id.toLowerCase().includes(query.toLowerCase()),
      )
    : models;

  return (
    <div ref={ref} className="model-picker" style={{ position: "relative" }}>
      <button className="picker-btn" disabled={disabled} onClick={() => setOpen((v) => !v)}>
        {model ? model.name : t("topbar.selectModel")}
        <span className="chev">▾</span>
      </button>
      {open && (
        <div
          className="popover"
          style={{ top: "100%", [align]: 0, marginTop: 4, width: 340 }}
        >
          <div className="popover-header">{t("topbar.model")}</div>
          <div className="popover-search">
            <input
              placeholder="Search models…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className="popover-list">
            {filtered.length === 0 && (
              <div className="empty-state" style={{ padding: 16 }}>No models found.</div>
            )}
            {groupModels(filtered).map((group) => (
              <div key={group.provider}>
                <div className="popover-group">{group.provider}</div>
                {group.models.map((m) => {
                  const selected = model?.id === m.id && model?.provider === m.provider;
                  return (
                    <button
                      key={`${m.provider}/${m.id}`}
                      className={`popover-item ${selected ? "selected" : ""}`}
                      onClick={() => {
                        void setModel(m.provider, m.id);
                        setOpen(false);
                      }}
                    >
                      <span className={m.available === false ? "dimmed" : ""}>{m.name}</span>
                      {m.available === false && <span className="sub">{t("settings.apiKey")}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
