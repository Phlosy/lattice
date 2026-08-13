// Runtime adapter — the agent-agnostic seam between the desktop shell and a
// coding-agent runtime. PiRuntimeAdapter is the only concrete implementation for
// v1; a future runtime only needs to implement this interface.

import type {
  AgentMessage,
  ModelInfo,
  ProviderInfo,
  SessionState,
} from "@shared/types";

export interface SessionCreateOptions {
  projectId: string;
  cwd: string;
  /** Optional session file to open instead of creating a new one. */
  file?: string;
  /** Optional display name for a new session. */
  name?: string;
}

export interface SessionHandle {
  readonly sessionId: string;
  readonly projectId: string;
  readonly cwd: string;
  readonly file?: string;

  getState(): SessionState;
  getMessages(): AgentMessage[];
  getSessionName(): string | undefined;

  subscribe(listener: (event: Record<string, unknown>) => void): () => void;

  prompt(text: string, images?: unknown[]): Promise<void>;
  steer(text: string): Promise<void>;
  followUp(text: string): Promise<void>;
  abort(): Promise<void>;
  /** Continue after an error (retry from current context). */
  continueAfterError(): Promise<void>;

  setModel(providerId: string, modelId: string): Promise<ModelInfo | undefined>;
  setThinkingLevel(level: string): void;
  setName(name: string): Promise<void>;

  /** All registered tools (built-in + extension + custom). */
  getToolNames(): string[];

  dispose(): void;
}

export interface RuntimeAdapter {
  init(): Promise<void>;

  getProviders(): Promise<ProviderInfo[]>;
  getModels(providerId?: string): Promise<ModelInfo[]>;
  /** Persist (or set in-memory) an API key for a provider. */
  setApiKey(providerId: string, apiKey: string): Promise<void>;

  createSession(opts: SessionCreateOptions): Promise<SessionHandle>;
  openSession(opts: SessionCreateOptions): Promise<SessionHandle>;

  dispose(): Promise<void>;
}
