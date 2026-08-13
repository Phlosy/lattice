// Pi RPC Sidecar PoC — validates that Pi can run as a separate process
// (sidecar) over JSONL RPC, instead of in-process SDK. This is the core
// acceptance test for the Tauri migration.
//
// Verifies: Start / Session / Prompt / Streaming / Tool / Cancel / Crash+Restart
//
// Usage: node poc/pi-sidecar/sidecar.mjs

import { spawn } from "node:child_process";
import { readFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PI_ENTRY = join(root, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js");

class PiSidecar {
  constructor(cwd, sessionDir) {
    this.cwd = cwd;
    this.sessionDir = sessionDir;
    this.child = null;
    this.buffer = "";
    this.events = [];
    this.reqCounter = 0;
    this.pending = new Map();
  }

  async start() {
    this.child = spawn(
      process.execPath,
      [PI_ENTRY, "--mode", "rpc", "--session-dir", this.sessionDir, "--approve"],
      { cwd: this.cwd, env: process.env, stdio: ["pipe", "pipe", "pipe"] },
    );
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.ingest(chunk));
    this.child.stderr.on("data", (chunk) => process.stderr.write("[pi-stderr] " + chunk));
    this.child.on("exit", (code) => this.onExit(code));

    // Wait for spawn
    await new Promise((r) => this.child.once("spawn", r));
    return this;
  }

  ingest(chunk) {
    this.buffer += chunk;
    while (true) {
      const nl = this.buffer.indexOf("\n");
      if (nl === -1) return;
      const line = this.buffer.slice(0, nl).replace(/\r$/, "");
      this.buffer = this.buffer.slice(nl + 1);
      if (!line.trim()) continue;
      let data;
      try { data = JSON.parse(line); } catch { continue; }
      if (data.type === "response" && data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id);
        this.pending.delete(data.id);
        data.success === false ? reject(new Error(data.error)) : resolve(data.data);
      } else {
        this.events.push(data);
      }
    }
  }

  onExit(code) {
    this.exited = true;
    this.exitCode = code;
  }

  send(cmd) {
    const id = `req_${++this.reqCounter}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(JSON.stringify({ ...cmd, id }) + "\n");
    });
  }

  async prompt(message) {
    await this.send({ type: "prompt", message });
  }

  async abort() {
    await this.send({ type: "abort" });
  }

  async getState() {
    return this.send({ type: "get_state" });
  }

  async getMessages() {
    return this.send({ type: "get_messages" });
  }

  async stop() {
    if (this.child && !this.exited) {
      this.child.kill("SIGKILL");
    }
  }

  // Wait until an event matching predicate arrives (timeout in ms)
  async waitFor(predicate, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const idx = this.events.findIndex(predicate);
      if (idx !== -1) {
        const ev = this.events[idx];
        return ev;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("timeout waiting for event");
  }

  clearEvents() {
    this.events = [];
  }
}

// --- Test driver ---
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

async function main() {
  const cwd = mkdtempSync(join(tmpdir(), "pi-sidecar-"));
  mkdirSync(join(cwd, "src"), { recursive: true });
  const sessionDir = join(cwd, "sessions");

  // 1. START
  let sidecar;
  try {
    sidecar = await new PiSidecar(cwd, sessionDir).start();
    check("Start (spawn Pi RPC sidecar)", true);
  } catch (e) {
    check("Start (spawn Pi RPC sidecar)", false, String(e));
    return;
  }

  // 2. SESSION
  try {
    const state = await sidecar.getState();
    check("Session (get_state)", !!state?.sessionId, `sessionId=${state?.sessionId?.slice(0, 8)}…`);
  } catch (e) {
    check("Session (get_state)", false, String(e));
  }

  // 3. PROMPT + STREAMING + TOOL
  try {
    sidecar.clearEvents();
    const promptPromise = sidecar.prompt("Read src/README.md if it exists, else list files. Reply with a one-line summary.");
    // Wait for agent_start
    await sidecar.waitFor((e) => e.type === "agent_start", 20000);
    check("Prompt submitted (agent_start)", true);

    // Collect text deltas
    let text = "";
    let toolSeen = false;
    const collectUntil = Date.now() + 45000;
    while (Date.now() < collectUntil) {
      const idx = sidecar.events.findIndex((e) => e.type === "agent_settled");
      if (idx !== -1) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    for (const e of sidecar.events) {
      if (e.type === "message_update" && e.assistantMessageEvent?.type === "text_delta") {
        text += e.assistantMessageEvent.delta;
      }
      if (e.type === "tool_execution_start") toolSeen = true;
    }
    await promptPromise;
    check("Streaming (text deltas)", text.length > 0, `got ${text.length} chars`);
    check("Tool call", toolSeen, toolSeen ? "tool executed" : "no tool (simple reply)");
  } catch (e) {
    check("Prompt/Streaming/Tool", false, String(e));
  }

  // 4. CANCEL
  try {
    sidecar.clearEvents();
    const p = sidecar.prompt("Write a long essay about the history of computing").catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));
    await sidecar.abort();
    await new Promise((r) => setTimeout(r, 500));
    check("Cancel (abort)", true);
  } catch (e) {
    check("Cancel (abort)", false, String(e));
  }

  // 5. CRASH + RESTART
  try {
    sidecar.stop(); // SIGKILL
    await new Promise((r) => setTimeout(r, 500));
    check("Crash detection (process exited)", sidecar.exited === true, `exitCode=${sidecar.exitCode}`);

    // Restart a fresh sidecar, same session dir, verify it works again
    const sidecar2 = await new PiSidecar(cwd, sessionDir).start();
    const state2 = await sidecar2.getState();
    check("Restart (new sidecar works)", !!state2?.sessionId);
    await sidecar2.stop();
  } catch (e) {
    check("Crash/Restart", false, String(e));
  }

  await sidecar?.stop();
  console.log("\n=== SUMMARY ===");
  const ok = results.filter((r) => r.ok).length;
  console.log(`${ok}/${results.length} passed`);
  process.exit(ok === results.length ? 0 : 1);
}

main();
