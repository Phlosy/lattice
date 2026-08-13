// Session registry — holds active SessionHandles, forwards their events to the
// renderer, and provides the operations the IPC layer calls.

import type { AgentMessage, SessionState } from "@shared/types";
import { EVT } from "@shared/types";
import type { DialogSender } from "./runtime/dialog-bridge";
import type { RuntimeAdapter, SessionHandle } from "./runtime/types";

export class SessionRegistry {
  private sessions = new Map<string, SessionHandle>();
  private unsubscribers = new Map<string, () => void>();

  constructor(
    private readonly runtime: RuntimeAdapter,
    private readonly send: DialogSender,
  ) {}

  async create(opts: { projectId: string; cwd: string; name?: string }): Promise<SessionHandle> {
    const handle = await this.runtime.createSession(opts);
    this.track(handle);
    this.send(EVT.SessionCreated, { sessionId: handle.sessionId, projectId: opts.projectId });
    return handle;
  }

  async open(opts: { projectId: string; cwd: string; file: string }): Promise<SessionHandle> {
    const handle = await this.runtime.openSession(opts);
    this.track(handle);
    this.send(EVT.SessionCreated, { sessionId: handle.sessionId, projectId: opts.projectId });
    return handle;
  }

  private track(handle: SessionHandle): void {
    this.sessions.set(handle.sessionId, handle);
    const unsub = handle.subscribe((event) => {
      this.send(EVT.SessionEvent, {
        sessionId: handle.sessionId,
        event,
      });
      this.send(EVT.SessionState, handle.getState());
    });
    this.unsubscribers.set(handle.sessionId, unsub);
  }

  get(sessionId: string): SessionHandle | undefined {
    return this.sessions.get(sessionId);
  }

  getState(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId)?.getState();
  }

  getMessages(sessionId: string): AgentMessage[] {
    return this.sessions.get(sessionId)?.getMessages() ?? [];
  }

  async close(sessionId: string): Promise<void> {
    const handle = this.sessions.get(sessionId);
    if (!handle) return;
    this.unsubscribers.get(sessionId)?.();
    this.unsubscribers.delete(sessionId);
    this.sessions.delete(sessionId);
    handle.dispose();
  }

  disposeAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.unsubscribers.get(id)?.();
      this.sessions.get(id)?.dispose();
    }
    this.sessions.clear();
    this.unsubscribers.clear();
  }
}
