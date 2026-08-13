// Terminal manager — PTY sessions via node-pty, bridged to the renderer's
// xterm.js over IPC.

import * as nodePty from "node-pty";
import { homedir } from "node:os";
import type { TerminalMeta } from "@shared/types";
import { EVT } from "@shared/types";
import type { DialogSender } from "./runtime/dialog-bridge";

function defaultShell(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC ?? "cmd.exe";
  }
  return process.env.SHELL ?? "/bin/bash";
}

export class TerminalManager {
  private terminals = new Map<string, nodePty.IPty>();
  private counter = 0;

  constructor(private readonly send: DialogSender) {}

  create(cwd: string, shell?: string): TerminalMeta {
    const id = `term-${++this.counter}`;
    const pty = nodePty.spawn(shell ?? defaultShell(), [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: cwd || homedir(),
      env: process.env as Record<string, string>,
    });

    pty.onData((data) => {
      this.send(EVT.TerminalData, { id, data });
    });
    pty.onExit(({ exitCode }) => {
      this.send(EVT.TerminalExit, { id, exitCode });
      this.terminals.delete(id);
    });

    this.terminals.set(id, pty);
    return { id, cwd, title: "Terminal" };
  }

  write(id: string, data: string): void {
    this.terminals.get(id)?.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    try {
      this.terminals.get(id)?.resize(cols, rows);
    } catch {
      // Ignore resize races.
    }
  }

  kill(id: string): void {
    const t = this.terminals.get(id);
    if (!t) return;
    try {
      t.kill();
    } catch {
      // Already dead.
    }
    this.terminals.delete(id);
  }

  disposeAll(): void {
    for (const id of [...this.terminals.keys()]) {
      this.kill(id);
    }
  }
}
