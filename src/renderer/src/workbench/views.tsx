// Workbench view implementations — thin wrappers over the existing feature
// components. Each view reads runtime state from the Zustand store (or Rust),
// so moving the view between panes never destroys the underlying PTY,
// transcript, or Git state.

import { useEffect } from "react";
import { useApp } from "../store/useApp";
import { ThreadView } from "../components/ThreadView";
import { WelcomeView } from "../components/WelcomeView";
import { Composer } from "../components/Composer";
import { TerminalPanel } from "../components/TerminalPanel";
import { GitPanel } from "../components/GitPanel";
import { registerWorkbenchView } from "./registry";
import { workbenchCommands } from "./commands";

export function ConversationView() {
  const currentProject = useApp((s) => s.currentProject);
  const title = useApp((s) => {
    const c = s.conversations.find((c) => c.id === s.activeSessionId);
    return c?.title || s.sessionState?.name;
  });

  useEffect(() => {
    workbenchCommands.updateViewTitle("view-conversation", title || "Conversation");
  }, [title]);

  return (
    <div className="conversation-view">
      <div className="conversation-wrap">
        {currentProject ? <ThreadView /> : <WelcomeView />}
      </div>
      {currentProject && <Composer />}
    </div>
  );
}

export function TerminalView({ componentId }: { componentId?: string }) {
  const terminalId = componentId?.startsWith("terminal:")
    ? componentId.slice("terminal:".length)
    : undefined;

  useEffect(() => {
    const tabId = terminalId ? `view-terminal-${terminalId}` : "view-terminal";
    workbenchCommands.updateViewTitle(tabId, "Terminal");
  }, [terminalId]);

  return <TerminalPanel terminalId={terminalId} />;
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
});
registerWorkbenchView({
  type: "git",
  title: "Git",
  component: GitView,
  singleton: true,
});
