import { useEffect } from "react";
import { useApp } from "./store/useApp";
import { Sidebar } from "./components/Sidebar";
import { ThreadView } from "./components/ThreadView";
import { Composer } from "./components/Composer";
import { TopBar } from "./components/TopBar";
import { PanelStack } from "./components/PanelStack";
import { PermissionDialog } from "./components/PermissionDialog";
import { SettingsView } from "./views/SettingsView";
import { ExtensionsView } from "./views/ExtensionsView";
import { WelcomeView } from "./components/WelcomeView";
import "./styles/app.css";

export default function App() {
  const ready = useApp((s) => s.ready);
  const view = useApp((s) => s.view);
  const currentProject = useApp((s) => s.currentProject);
  const init = useApp((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const s = useApp.getState();
      if (e.key === "Escape") {
        if (s.permissions.length > 0) {
          s.dismissPermission(s.permissions[0].requestId);
        } else if (s.activePanel) {
          s.closePanel();
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
        <main className="workspace">
          {view === "chat" && (
            <>
              <TopBar />
              <div className="conversation-wrap">
                {currentProject ? <ThreadView /> : <WelcomeView />}
              </div>
              {currentProject && <PanelStack />}
              {currentProject && <Composer />}
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
