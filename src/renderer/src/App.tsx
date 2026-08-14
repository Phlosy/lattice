import { useEffect, useState } from "react";
import { useApp } from "./store/useApp";
import { useLayoutClass } from "./lib/layout";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { SessionTabs } from "./components/SessionTabs";
import { PermissionDialog } from "./components/PermissionDialog";
import { SettingsView } from "./views/SettingsView";
import { ExtensionsView } from "./views/ExtensionsView";
import { DockWorkbench } from "./workbench/DockWorkbench";
import "./workbench/views";
import "./styles/app.css";

export default function App() {
  const ready = useApp((s) => s.ready);
  const view = useApp((s) => s.view);
  const init = useApp((s) => s.init);
  const layout = useLayoutClass();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  // Reflect the phone drawer state onto <body> for CSS.
  useEffect(() => {
    document.body.dataset.sidebarOpen = String(layout === "phone" && sidebarOpen);
  }, [layout, sidebarOpen]);

  const isPhone = layout === "phone";

  // Close the phone drawer when navigating to a view.
  useEffect(() => {
    if (layout !== "phone") setSidebarOpen(false);
  }, [layout, view]);

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const s = useApp.getState();
      if (e.key === "Escape") {
        if (s.permissions.length > 0) {
          s.dismissPermission(s.permissions[0].requestId);
        } else if (s.transcript.running) {
          void s.abort();
        }
        return;
      }
      if (mod && e.key === ",") {
        e.preventDefault();
        s.setView(s.view === "settings" ? "chat" : "settings");
        return;
      }
      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!ready) {
    return <div className="boot">Lattice</div>;
  }

  return (
    <div className="app">
      <div className="app-shell">
        <Sidebar />
        {isPhone && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
        <main className="workspace">
          {view === "chat" && (
            <>
              <SessionTabs />
              <TopBar onMenu={() => setSidebarOpen(true)} />
              <div className="dock-container">
                <DockWorkbench />
              </div>
            </>
          )}
          {view === "settings" && <SettingsView />}
          {view === "extensions" && <ExtensionsView />}
        </main>
      </div>
      <PermissionDialog />
    </div>
  );
}
