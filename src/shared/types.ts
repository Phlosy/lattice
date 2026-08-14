// Shared type contract between the Electron main and renderer processes.
// Pi message/event shapes are mirrored (they are already JSON-serializable),
// plus Lattice-specific types for projects, sessions, permissions, terminal, git.

// ---------------------------------------------------------------------------
// Pi message content blocks (mirrors @earendil-works/pi-ai)
// ---------------------------------------------------------------------------
export interface TextContent {
  type: "text";
  text: string;
}
export interface ImageContent {
  type: "image";
  data: string; // base64
  mimeType: string;
}
export interface ThinkingContent {
  type: "thinking";
  thinking: string;
}
export interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

// ---------------------------------------------------------------------------
// Pi messages
// ---------------------------------------------------------------------------
export type MessageContent = TextContent | ImageContent | ThinkingContent | ToolCall;

export interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
  attachments?: unknown[];
}
export interface AssistantMessage {
  role: "assistant";
  content: MessageContent[];
  api?: string;
  provider?: string;
  model?: string;
  usage?: Usage;
  stopReason?: "stop" | "length" | "toolUse" | "error" | "aborted" | "pending";
  errorMessage?: string;
  timestamp: number;
}
export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: unknown;
  usage?: Usage;
  isError: boolean;
  timestamp: number;
}
export interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
  excludeFromContext?: boolean;
  timestamp: number;
}
export interface CustomMessage {
  role: "custom";
  customType: string;
  content: string | (TextContent | ImageContent)[];
  display: boolean;
  details?: unknown;
  timestamp: number;
}
export interface BranchSummaryMessage {
  role: "branchSummary";
  summary: string;
  fromId: string;
  timestamp: number;
}
export interface CompactionSummaryMessage {
  role: "compactionSummary";
  summary: string;
  tokensBefore: number;
  timestamp: number;
}

export type AgentMessage =
  | UserMessage
  | AssistantMessage
  | ToolResultMessage
  | BashExecutionMessage
  | CustomMessage
  | BranchSummaryMessage
  | CompactionSummaryMessage;

// ---------------------------------------------------------------------------
// Pi streaming deltas (assistantMessageEvent)
// ---------------------------------------------------------------------------
export type AssistantMessageEvent =
  | { type: "text_start"; contentIndex: number }
  | { type: "text_delta"; contentIndex: number; delta: string }
  | { type: "text_end"; contentIndex: number; content: string }
  | { type: "thinking_start"; contentIndex: number }
  | { type: "thinking_delta"; contentIndex: number; delta: string }
  | { type: "thinking_end"; contentIndex: number; content: string }
  | { type: "toolcall_start"; contentIndex: number; toolCall: ToolCall }
  | { type: "toolcall_delta"; contentIndex: number; delta: string }
  | { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall };

// ---------------------------------------------------------------------------
// Session events (mirrors Pi AgentSessionEvent, streamed to renderer verbatim)
// ---------------------------------------------------------------------------
export interface SessionEventBase {
  type: string;
  sessionId: string;
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Lattice domain types
// ---------------------------------------------------------------------------
export type ProjectKind = "folder" | "repo";

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  kind: ProjectKind;
  lastOpenedAt: number;
}

export interface SessionMeta {
  id: string;
  name?: string;
  projectId: string;
  cwd: string;
  file?: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
  input: string[];
  /** Whether the provider has valid auth configured (key/OAuth available). */
  available?: boolean;
  /** Reasoning levels this model supports (derived from Pi's thinkingLevelMap). */
  thinkingLevels?: string[];
}

export interface ProviderInfo {
  id: string;
  name: string;
  hasAuth: boolean;
  authKind?: string;
}

export interface ThinkingLevelInfo {
  level: string;
  supported: string[];
}

export interface SessionState {
  sessionId: string;
  cwd: string;
  file?: string;
  name?: string;
  model?: ModelInfo;
  thinkingLevel: string;
  isStreaming: boolean;
  isCompacting: boolean;
  messageCount: number;
  pendingSteering: number;
  pendingFollowUp: number;
  contextUsage?: { tokens: number; contextWindow: number; percent: number };
}

// ---------------------------------------------------------------------------
// Permission / approval
// ---------------------------------------------------------------------------
export type ApprovalAction =
  | "allow-once"
  | "allow-session"
  | "allow-always"
  | "deny-once"
  | "deny-always";

export interface PermissionRequest {
  id: string;
  sessionId: string;
  toolName: string;
  label: string;
  args: Record<string, unknown>;
  summary: string;
  command?: string;
  filePath?: string;
  kind: "bash" | "write" | "edit" | "other";
}

// ---------------------------------------------------------------------------
// Terminal
// ---------------------------------------------------------------------------
export interface TerminalMeta {
  id: string;
  cwd: string;
  title: string;
}

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------
export interface GitFileStatus {
  path: string;
  index: string;
  workingDir: string;
  staged: boolean;
  added: number;
  removed: number;
}

export interface GitStatus {
  branch: string;
  files: GitFileStatus[];
  clean: boolean;
  ahead: number;
  behind: number;
  added: number;
  removed: number;
}

export interface GitCommitResult {
  hash: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Extension marketplace
// ---------------------------------------------------------------------------
export type PackageKind = "extension" | "skill" | "theme" | "prompt" | "tool" | "provider";

export interface ExtensionPermission {
  files: boolean;
  network: boolean;
  shell: boolean;
  workspace: boolean;
}

export interface RegistryPackage {
  id: string;
  name: string;
  displayName?: string;
  version: string;
  author: string;
  description: string;
  kinds: PackageKind[];
  source: string; // npm:... | git:... | local path
  readme?: string;
  permissions?: ExtensionPermission;
  dependencies?: string[];
  installed?: boolean;
  enabled?: boolean;
  location?: "user" | "project";
}

export interface InstalledPackage {
  source: string;
  name: string;
  location: "user" | "project";
  kinds: PackageKind[];
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Lattice app settings
// ---------------------------------------------------------------------------
export interface AppSettings {
  theme: "dark" | "light";
  locale: "en" | "zh";
  fontSize: number;
  accent: string;
  sandboxMode: "none" | "docker";
  autoApproveReadOnly: boolean;
}

// ---------------------------------------------------------------------------
// IPC channel names
// ---------------------------------------------------------------------------
export const IPC = {
  // project / session
  OpenProject: "project:open",
  GetProjects: "project:list",
  RemoveProject: "project:remove",
  GetSessions: "session:list",
  CreateSession: "session:create",
  RenameSession: "session:rename",
  DeleteSession: "session:delete",
  OpenSession: "session:open",
  GetSessionState: "session:state",
  GetSessionMessages: "session:messages",
  Prompt: "session:prompt",
  ListFiles: "fs:list",
  Steer: "session:steer",
  FollowUp: "session:followUp",
  Abort: "session:abort",
  Continue: "session:continue",

  // models
  GetProviders: "models:providers",
  GetModels: "models:list",
  SetModel: "models:set",
  SetThinkingLevel: "models:set-thinking",
  Login: "models:login",
  Logout: "models:logout",

  // permission
  PermissionRespond: "permission:respond",

  // terminal
  TerminalCreate: "terminal:create",
  TerminalInput: "terminal:input",
  TerminalResize: "terminal:resize",
  TerminalKill: "terminal:kill",

  // git
  GitStatus: "git:status",
  GitDiff: "git:diff",
  GitCommit: "git:commit",
  GitBranch: "git:branch",
  GitCheckout: "git:checkout",
  GitCreateWorktree: "git:worktree:create",
  GitListWorktrees: "git:worktree:list",

  // extension marketplace
  ExtList: "ext:list",
  ExtInstall: "ext:install",
  ExtUninstall: "ext:uninstall",
  ExtToggle: "ext:toggle",
  ExtSearch: "ext:search",

  // settings
  SettingsGet: "settings:get",
  SettingsSet: "settings:set",

  // app
  AppInfo: "app:info",
} as const;

// Events pushed from main → renderer (webContents.send)
export const EVT = {
  SessionEvent: "evt:session", // { sessionId, event }
  SessionState: "evt:session-state",
  SessionCreated: "evt:session-created",
  SessionDeleted: "evt:session-deleted",
  PermissionRequest: "evt:permission-request",
  TerminalData: "evt:terminal-data",
  TerminalExit: "evt:terminal-exit",
  GitChanged: "evt:git-changed",
  ModelsChanged: "evt:models-changed",
} as const;
