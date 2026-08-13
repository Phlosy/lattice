// Dialog bridge + permission gate.
//
// Lattice implements a Codex-style approval flow on top of Pi's extension
// system. A built-in "permission gate" inline extension subscribes to Pi's
// `tool_call` event and blocks risky tools pending desktop approval. The same
// bridge also backs the ExtensionUIContext (select/confirm/input/notify) so
// third-party extensions can interact with the desktop UI.

import type {
  ApprovalAction,
  PermissionRequest,
} from "@shared/types";
import { EVT } from "@shared/types";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type DialogSender = (channel: string, ...args: unknown[]) => void;

interface Pending {
  resolve: (value: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
}

let dialogCounter = 0;

/** Tools that run freely without prompting (Codex-like defaults). */
const ALWAYS_ALLOWED = new Set(["read", "grep", "find", "ls"]);
/** Tools that require approval by default. */
const REQUIRE_APPROVAL = new Set(["bash", "write", "edit"]);

/** Pure permission policy: classify a tool by its default approval requirement. */
export function classifyTool(toolName: string): "always-allow" | "require-approval" | "allow-by-default" {
  if (ALWAYS_ALLOWED.has(toolName)) return "always-allow";
  if (REQUIRE_APPROVAL.has(toolName)) return "require-approval";
  return "allow-by-default";
}

export class DialogBridge {
  private sender: DialogSender | null = null;
  private pending = new Map<string, Pending>();
  private approvalDecisions = new Map<string, "allow-always" | "deny-always">();
  private decisionsPath: string | null = null;
  /** When true, gateToolCall approves everything without prompting (tests / auto-approve mode). */
  autoApprove = false;

  /** Set by the main process once the window is ready. */
  attach(sender: DialogSender, decisionsPath: string): void {
    this.sender = sender;
    this.decisionsPath = decisionsPath;
    this.loadDecisions();
  }

  private key(projectId: string, toolName: string): string {
    return `${projectId}\u0000${toolName}`;
  }

  private loadDecisions(): void {
    if (!this.decisionsPath) return;
    try {
      const raw = readFileSync(this.decisionsPath, "utf8");
      const data = JSON.parse(raw) as Record<string, "allow-always" | "deny-always">;
      this.approvalDecisions = new Map(Object.entries(data));
    } catch {
      this.approvalDecisions = new Map();
    }
  }

  private persistDecisions(): void {
    if (!this.decisionsPath) return;
    try {
      mkdirSync(dirname(this.decisionsPath), { recursive: true });
      writeFileSync(this.decisionsPath, JSON.stringify(Object.fromEntries(this.approvalDecisions), null, 2));
    } catch {
      // Non-fatal: decisions simply won't persist.
    }
  }

  /** Decide whether a tool call needs approval, and if so request it. */
  async gateToolCall(params: {
    sessionId: string;
    projectId: string;
    toolName: string;
    label: string;
    args: Record<string, unknown>;
  }): Promise<{ allowed: boolean; reason?: string }> {
    const { sessionId, projectId, toolName, args } = params;

    if (this.autoApprove) {
      return { allowed: true };
    }

    if (ALWAYS_ALLOWED.has(toolName)) {
      return { allowed: true };
    }

    const existing = this.approvalDecisions.get(this.key(projectId, toolName));
    if (existing === "allow-always") return { allowed: true };
    if (existing === "deny-always") return { allowed: false, reason: `Denied by policy for ${toolName}` };

    if (!REQUIRE_APPROVAL.has(toolName)) {
      // Unknown/custom tools default to allow unless they declare approval
      // requirements (handled by extensions individually).
      return { allowed: true };
    }

    const request = this.buildRequest(sessionId, params.toolName, params.label, args);
    const action = await this.request<ApprovalAction>(EVT.PermissionRequest, request);

    switch (action) {
      case "allow-always":
        this.approvalDecisions.set(this.key(projectId, toolName), "allow-always");
        this.persistDecisions();
        return { allowed: true };
      case "deny-always":
        this.approvalDecisions.set(this.key(projectId, toolName), "deny-always");
        this.persistDecisions();
        return { allowed: false, reason: `Denied by user for ${toolName}` };
      case "allow-session":
      case "allow-once":
        return { allowed: true };
      case "deny-once":
      default:
        return { allowed: false, reason: `Denied by user` };
    }
  }

  private buildRequest(
    sessionId: string,
    toolName: string,
    label: string,
    args: Record<string, unknown>,
  ): PermissionRequest {
    const command = typeof args.command === "string" ? args.command : undefined;
    const filePath = typeof args.path === "string" ? args.path : undefined;
    return {
      id: `req-${++dialogCounter}`,
      sessionId,
      toolName,
      label,
      args,
      summary: this.summarize(toolName, args),
      command,
      filePath,
      kind: toolName === "bash" ? "bash" : toolName === "edit" ? "edit" : toolName === "write" ? "write" : "other",
    };
  }

  private summarize(toolName: string, args: Record<string, unknown>): string {
    if (toolName === "bash" && typeof args.command === "string") return args.command;
    if (toolName === "write" || toolName === "edit") {
      const p = typeof args.path === "string" ? args.path : "?";
      return `${toolName} ${p}`;
    }
    return `${toolName}`;
  }

  /** Generic dialog request/response over IPC. */
  request<T>(channel: string, payload: unknown): Promise<T> {
    const id = `dlg-${++dialogCounter}`;
    if (!this.sender) {
      return Promise.reject(new Error("Dialog bridge not attached"));
    }
    return new Promise<T>((resolve) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void });
      this.sender!(channel, { ...(payload as object), requestId: id });
    });
  }

  /** Resolve a pending dialog from the renderer. */
  resolve(requestId: string, value: unknown): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    this.pending.delete(requestId);
    pending.resolve(value);
  }

  // --- ExtensionUIContext bridges (select/confirm/input/notify) ---
  select(title: string, options: string[]): Promise<string | undefined> {
    return this.request<string | undefined>("evt:dialog-select", { title, options });
  }
  confirm(title: string, message: string): Promise<boolean> {
    return this.request<boolean>("evt:dialog-confirm", { title, message });
  }
  input(title: string, placeholder?: string): Promise<string | undefined> {
    return this.request<string | undefined>("evt:dialog-input", { title, placeholder });
  }
  notify(message: string, type?: "info" | "warning" | "error"): void {
    this.sender?.("evt:dialog-notify", { message, type: type ?? "info" });
  }
}

// ---------------------------------------------------------------------------
// Permission-gate extension factory (per-session, derives sessionId from ctx)
// ---------------------------------------------------------------------------

import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";

export function createPermissionGateFactory(bridge: DialogBridge, projectId: string): ExtensionFactory {
  return (pi) => {
    pi.on("tool_call", async (event, ctx) => {
      const args = (event.input ?? {}) as Record<string, unknown>;
      const toolName = event.toolName;
      const sessionId = ctx.sessionManager.getSessionId();
      const label = toolName;

      const decision = await bridge.gateToolCall({ sessionId, projectId, toolName, label, args });
      if (!decision.allowed) {
        return { block: true, reason: decision.reason ?? "Blocked by user" };
      }
      return undefined;
    });
  };
}

// ---------------------------------------------------------------------------
// ExtensionUIContext factory (bridges select/confirm/input/notify to renderer)
// ---------------------------------------------------------------------------

export function createUIContext(bridge: DialogBridge): Record<string, unknown> {
  return {
    select: (title: string, options: string[]) => bridge.select(title, options),
    confirm: (title: string, message: string) => bridge.confirm(title, message),
    input: (title: string, placeholder?: string) => bridge.input(title, placeholder),
    notify: (message: string, type?: string) => bridge.notify(message, type as never),
    onTerminalInput: () => () => {},
    setStatus: () => {},
    setWorkingMessage: () => {},
    setWorkingVisible: () => {},
    setWorkingIndicator: () => {},
    setHiddenThinkingLabel: () => {},
    setWidget: () => {},
    setFooter: () => {},
    setHeader: () => {},
    setTitle: () => {},
    custom: async () => undefined,
  };
}
