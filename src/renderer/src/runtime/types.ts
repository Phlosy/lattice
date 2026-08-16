// Unified Pi Runtime type model. The UI only ever sees `PiRuntime`; the
// provider (installed / bundled / remote) and the binary source are details
// owned by the RuntimeManager.

export type RuntimeProviderKind = "installed" | "bundled" | "remote";
export type RuntimeLocation = "local" | "remote";

export interface InstalledRuntimeConfig {
  type: "installed";
  /** "auto" means discover via PATH + common install locations. */
  executable?: string;
}

export interface BundledRuntimeConfig {
  type: "bundled";
}

export interface RemoteRuntimeConfig {
  type: "remote";
  url: string;
  token?: string;
}

export type RuntimeProviderConfig =
  | InstalledRuntimeConfig
  | BundledRuntimeConfig
  | RemoteRuntimeConfig;

/** Where the runtime's persistent state lives. Defaults to `~/.pi`. */
export interface RuntimeStateConfig {
  piHome?: string;
}

export interface RuntimeProfile {
  id: string;
  name: string;
  provider: RuntimeProviderConfig;
  state?: RuntimeStateConfig;
  autoConnect?: boolean;
  lastUsedAt?: number;
}

export type RuntimeConnectionState =
  | "idle"
  | "discovering"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "incompatible"
  | "unavailable"
  | "crashed"
  | "disconnected";

export interface RuntimeInfo {
  name: string;
  version?: string;
  protocolVersion?: number;
  piHome?: string;
  provider: RuntimeProviderKind;
  location: RuntimeLocation;
  executablePath?: string;
  /** Client platform — decides whether a local Pi can be spawned. */
  platform?: "desktop" | "mobile" | "browser";
}

export interface RuntimeCapabilities {
  chat: boolean;
  sessions: boolean;
  sessionResume: boolean;
  filesystem: boolean;
  git: boolean;
  shell: boolean;
  pty: boolean;
  skills: boolean;
  extensions: boolean;
  subagents: boolean;
  remoteFilesystem: boolean;
}

export type RuntimeCompatibility = "compatible" | "incompatible" | "unknown";

export interface DiscoveryResult {
  executablePath: string;
  version?: string;
  protocolVersion?: number;
  piHome?: string;
  compatibility: RuntimeCompatibility;
}

/** The abstract surface the React UI depends on. */
export interface PiRuntime {
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  getRuntimeInfo(): Promise<RuntimeInfo>;
  getCapabilities(): Promise<RuntimeCapabilities>;

  listSessions(): Promise<unknown[]>;
  createSession(options: unknown): Promise<unknown>;
  getModels(): Promise<unknown[]>;

  subscribeEvents(handler: (event: RuntimeEvent) => void): () => void;
}

export type RuntimeEvent =
  | { type: "connected"; info: RuntimeInfo; capabilities: RuntimeCapabilities }
  | { type: "disconnected" }
  | { type: "error"; reason: "incompatible" | "unavailable" | "auth" | "network" | "crash" }
  | { type: "assistant.delta"; sessionId: string; delta: string }
  | { type: "assistant.completed"; sessionId: string }
  | { type: "session.created"; sessionId: string }
  | { type: "session.updated"; sessionId: string }
  | { type: "session.deleted"; sessionId: string }
  | { type: "terminal.output"; terminalId: string; data: string }
  | { type: "workspace.changed" };
