// Workbench view model — the single abstraction every dockable panel shares.
// The Dock Engine renders whatever a WorkbenchViewType resolves to; it never
// knows about xterm.js, Monaco, or the conversation internals.

export type WorkbenchViewType =
  | "conversation"
  | "terminal"
  | "git"
  | "editor"
  | "preview"
  | "agent"
  | "problems"
  | "search";

export interface WorkbenchView {
  id: string;
  type: WorkbenchViewType;
  title: string;
  icon?: string;
  closable?: boolean;
  movable?: boolean;
  /** Only one instance of this view may exist in the layout. */
  singleton?: boolean;
  state?: unknown;
}
