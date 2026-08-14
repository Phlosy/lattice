// Workbench view implementations — thin wrappers over the existing feature
// components. Each view reads runtime state from the Zustand store (or Rust),
// so moving the view between panes never destroys the underlying PTY,
// transcript, or Git state.

import { useApp } from "../store/useApp";
import { ThreadView } from "../components/ThreadView";
import { WelcomeView } from "../components/WelcomeView";
import { Composer } from "../components/Composer";
import { TerminalPanel } from "../components/TerminalPanel";
import { GitPanel } from "../components/GitPanel";
import { registerWorkbenchView } from "./registry";

export function ConversationView() {
  const currentProject = useApp((s) => s.currentProject);
  return (
    <div className="conversation-view">
      <div className="conversation-wrap">
        {currentProject ? <ThreadView /> : <WelcomeView />}
      </div>
      {currentProject && <Composer />}
    </div>
  );
}

export function TerminalView() {
  return <TerminalPanel />;
}

export function GitView() {
  return <GitPanel />;
}

registerWorkbenchView({
  type: "conversation",
  title: "Conversation",
  component: ConversationView,
  singleton: true,
  closable: false,
});
registerWorkbenchView({
  type: "terminal",
  title: "Terminal",
  component: TerminalView,
  singleton: true,
});
registerWorkbenchView({
  type: "git",
  title: "Git",
  component: GitView,
  singleton: true,
});
