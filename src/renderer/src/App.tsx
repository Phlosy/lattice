import { useEffect } from "react";
import { useApp } from "./store/useApp";
import { Sidebar } from "./components/Sidebar";
import { ThreadView } from "./components/ThreadView";
import { Composer } from "./components/Composer";
import { TopBar } from "./components/TopBar";
import { TerminalPanel } from "./components/TerminalPanel";
import { GitPanel } from "./components/GitPanel";
import { PermissionDialog } from "./components/PermissionDialog";
import { SettingsView } from "./views/SettingsView";
import { ExtensionsView } from "./views/ExtensionsView";
import { WelcomeView } from "./components/WelcomeView";
import "./styles/app.css";

export default function App() {
  const ready = useApp((s) => s.ready);
  const view = useApp((s) => s.view);
  const currentProject = useApp((s) => s.currentProject);
  const activeSessionId = useApp((s) => s.activeSessionId);
  const terminals = useApp((s) => s.terminals);
  const showGit = useApp((s) => s.showGit);
  const init = useApp((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (!ready) {
    return <div className="boot">Lattice</div>;
  }

  return (
    <div className="app">
      <Sidebar />
      <main className="app-main">
        {view === "chat" && (
          <>
            <TopBar />
            <div className="app-body">
              {!currentProject ? (
                <WelcomeView />
              ) : (
                <>
                  <ThreadView />
                  {showGit && <GitPanel />}
                  {terminals.length > 0 && <TerminalPanel />}
                </>
              )}
            </div>
            {currentProject && <Composer />}
          </>
        )}
        {view === "settings" && <SettingsView />}
        {view === "extensions" && <ExtensionsView />}
      </main>
      <PermissionDialog />
    </div>
  );
}
