// PiRuntimeAdapter — the only concrete RuntimeAdapter for v1. Wraps the
// @earendil-works/pi-coding-agent SDK (AgentSession, ModelRuntime,
// SessionManager, SettingsManager, DefaultResourceLoader) in-process.

import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import type { Model, Provider } from "@earendil-works/pi-ai";
import type {
  AgentMessage,
  ModelInfo,
  ProviderInfo,
  SessionState,
} from "@shared/types";
import { createPermissionGateFactory, createUIContext, type DialogBridge } from "./dialog-bridge";
import type { RuntimeAdapter, SessionCreateOptions, SessionHandle } from "./types";

function toModelInfo(model: Model<any>): ModelInfo {
  return {
    id: model.id,
    name: model.name ?? model.id,
    provider: model.provider,
    reasoning: model.reasoning ?? false,
    contextWindow: model.contextWindow ?? 0,
    maxTokens: model.maxTokens ?? 0,
    input: (model.input ?? []) as string[],
  };
}

function toProviderInfo(provider: Provider, hasAuth: boolean): ProviderInfo {
  const authKind = (provider.auth as { apiKey?: unknown; oauth?: unknown })?.oauth
    ? "oauth"
    : (provider.auth as { apiKey?: unknown })?.apiKey
      ? "api_key"
      : undefined;
  return { id: provider.id, name: provider.name, hasAuth, authKind };
}

class PiSessionHandle implements SessionHandle {
  readonly sessionId: string;
  readonly projectId: string;
  readonly cwd: string;
  readonly file?: string;

  constructor(
    private readonly session: AgentSession,
    projectId: string,
  ) {
    this.sessionId = session.sessionId;
    this.cwd = session.sessionManager.getCwd();
    this.file = session.sessionFile;
    this.projectId = projectId;
  }

  getState(): SessionState {
    const s = this.session;
    const model = s.model;
    return {
      sessionId: this.sessionId,
      cwd: this.cwd,
      file: this.file,
      name: s.sessionName,
      model: model ? toModelInfo(model) : undefined,
      thinkingLevel: s.thinkingLevel,
      isStreaming: s.isStreaming,
      isCompacting: s.isCompacting,
      messageCount: s.messages.length,
      pendingSteering: 0,
      pendingFollowUp: 0,
    };
  }

  getMessages(): AgentMessage[] {
    return this.session.messages as AgentMessage[];
  }

  getSessionName(): string | undefined {
    return this.session.sessionName;
  }

  subscribe(listener: (event: Record<string, unknown>) => void): () => void {
    return this.session.subscribe((event) => listener(event as unknown as Record<string, unknown>));
  }

  async prompt(text: string, images?: unknown[]): Promise<void> {
    await this.session.prompt(text, {
      images: images as Array<{ type: "image"; data: string; mimeType: string }>,
    });
  }

  async steer(text: string): Promise<void> {
    await this.session.steer(text);
  }

  async followUp(text: string): Promise<void> {
    await this.session.followUp(text);
  }

  async abort(): Promise<void> {
    await this.session.abort();
  }

  async continueAfterError(): Promise<void> {
    // Best-effort retry: resume the underlying agent loop from current context.
    // Pi's AgentSession already auto-retries transient errors; this covers a
    // manual "retry" from a failed/aborted state.
    try {
      await this.session.agent.continue();
    } catch {
      // Surface as a normal error is handled by the agent event stream.
    }
  }

  async setModel(providerId: string, modelId: string): Promise<ModelInfo | undefined> {
    const runtime = this.session.modelRuntime;
    const model = runtime.getModel(providerId, modelId);
    if (!model) return undefined;
    await this.session.setModel(model);
    return toModelInfo(model);
  }

  setThinkingLevel(level: string): void {
    this.session.setThinkingLevel(level as never);
  }

  async setName(name: string): Promise<void> {
    this.session.setSessionName(name);
  }

  getToolNames(): string[] {
    return this.session.getActiveToolNames();
  }

  dispose(): void {
    try {
      this.session.dispose();
    } catch {
      // Ignore disposal errors.
    }
  }
}

export class PiRuntimeAdapter implements RuntimeAdapter {
  private modelRuntime!: ModelRuntime;
  private agentDir!: string;
  private settingsManagers = new Map<string, SettingsManager>();
  private initialized = false;

  constructor(private readonly bridge: DialogBridge) {}

  async init(): Promise<void> {
    this.agentDir = getAgentDir();
    this.modelRuntime = await ModelRuntime.create({
      authPath: join(this.agentDir, "auth.json"),
      modelsPath: join(this.agentDir, "models.json"),
    });
    this.initialized = true;
  }

  getSettingsManager(cwd: string): SettingsManager {
    if (!this.settingsManagers.has(cwd)) {
      this.settingsManagers.set(cwd, SettingsManager.create(cwd, this.agentDir));
    }
    return this.settingsManagers.get(cwd)!;
  }

  async getProviders(): Promise<ProviderInfo[]> {
    const providers = this.modelRuntime.getProviders();
    const out: ProviderInfo[] = [];
    for (const p of providers) {
      const auth = await this.modelRuntime.checkAuth(p.id);
      out.push(toProviderInfo(p, auth !== undefined));
    }
    return out;
  }

  async getModels(providerId?: string): Promise<ModelInfo[]> {
    // Return every model from every provider (not just authenticated ones), so
    // users can see and configure models even before adding a key. `available`
    // marks which ones are currently usable.
    const available = await this.modelRuntime.getAvailable(providerId);
    const availableIds = new Set(available.map((m) => `${m.provider}/${m.id}`));

    const out: ModelInfo[] = [];
    for (const p of this.modelRuntime.getProviders()) {
      if (providerId && p.id !== providerId) continue;
      for (const m of p.getModels()) {
        out.push({ ...toModelInfo(m), available: availableIds.has(`${m.provider}/${m.id}`) });
      }
    }
    out.sort(
      (a, b) =>
        Number(!!b.available) - Number(!!a.available) ||
        a.provider.localeCompare(b.provider) ||
        a.name.localeCompare(b.name),
    );
    return out;
  }

  async setApiKey(providerId: string, apiKey: string): Promise<void> {
    const provider = this.modelRuntime.getProvider(providerId);
    if (provider?.auth && "apiKey" in provider.auth && provider.auth.apiKey?.login) {
      await this.modelRuntime.login(providerId, "api_key", {
        signal: undefined,
        prompt: async () => apiKey,
        notify: () => {},
      });
    } else {
      await this.modelRuntime.setRuntimeApiKey(providerId, apiKey);
    }
  }

  private async buildSession(opts: SessionCreateOptions): Promise<SessionHandle> {
    const { projectId, cwd } = opts;
    const settingsManager = this.getSettingsManager(cwd);

    const loader = new DefaultResourceLoader({
      cwd,
      agentDir: this.agentDir,
      settingsManager,
      extensionFactories: [createPermissionGateFactory(this.bridge, projectId)],
    });
    await loader.reload();

    const sessionManager = opts.file
      ? SessionManager.open(opts.file)
      : SessionManager.create(cwd);

    if (opts.name && !opts.file) {
      sessionManager.appendSessionInfo(opts.name);
    }

    const { session, extensionsResult } = await createAgentSession({
      cwd,
      agentDir: this.agentDir,
      modelRuntime: this.modelRuntime,
      resourceLoader: loader,
      sessionManager,
      settingsManager,
    });

    // Bind the desktop UI bridge to the extension runtime (select/confirm/notify).
    await session.bindExtensions({
      mode: "rpc",
      uiContext: createUIContext(this.bridge) as never,
      onError: (err) => {
        console.error("[extension error]", err);
      },
    });

    return new PiSessionHandle(session, projectId);
  }

  async createSession(opts: SessionCreateOptions): Promise<SessionHandle> {
    return this.buildSession(opts);
  }

  async openSession(opts: SessionCreateOptions): Promise<SessionHandle> {
    return this.buildSession(opts);
  }

  async dispose(): Promise<void> {
    // SessionHandles own their AgentSession disposal; nothing global to tear down.
    this.initialized = false;
  }
}
