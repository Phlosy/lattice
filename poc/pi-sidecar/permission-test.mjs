// Permission gate verification: spawns the Pi RPC sidecar with the
// permission-gate extension, sends a prompt that triggers the bash tool, and
// verifies the extension_ui_request → response → tool-execution roundtrip.

import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PI_ENTRY = join(root, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js");
const EXT = join(root, "poc/tauri-app/extensions/permission-gate.ts");

const cwd = mkdtempSync(join(tmpdir(), "pi-perm-"));
const sessionDir = join(cwd, "sessions");

const child = spawn(
  process.execPath,
  [PI_ENTRY, "--mode", "rpc", "--session-dir", sessionDir, "--approve", "--extension", EXT],
  { cwd, env: process.env, stdio: ["pipe", "pipe", "inherit"] },
);

let buffer = "";
let uiRequests = [];
let toolCalls = [];
let settled = false;

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  while (true) {
    const nl = buffer.indexOf("\n");
    if (nl === -1) break;
    const line = buffer.slice(0, nl).replace(/\r$/, "");
    buffer = buffer.slice(nl + 1);
    if (!line.trim()) continue;
    let data;
    try { data = JSON.parse(line); } catch { continue; }
    if (data.type === "extension_ui_request") {
      uiRequests.push(data);
      // auto-approve (confirm) so the roundtrip continues
      if (data.method === "confirm") {
        child.stdin.write(JSON.stringify({ type: "extension_ui_response", id: data.id, confirmed: true }) + "\n");
      }
    } else if (data.type === "tool_execution_start") {
      toolCalls.push(data.toolName);
    } else if (data.type === "agent_settled") {
      settled = true;
    }
  }
});

// Wait for spawn, then send a prompt that triggers the bash tool.
setTimeout(() => {
  child.stdin.write(JSON.stringify({ type: "prompt", message: "Run the shell command: echo hello-permission-gate" }) + "\n");
}, 3000);

setTimeout(() => {
  console.log("=== Permission gate verification ===");
  console.log(`extension_ui_request count: ${uiRequests.length}`);
  console.log(`confirm requests: ${uiRequests.filter((r) => r.method === "confirm").length}`);
  console.log(`tool calls: ${toolCalls.join(", ") || "(none)"}`);
  console.log(`agent settled: ${settled}`);
  const ok = uiRequests.some((r) => r.method === "confirm") && toolCalls.includes("bash");
  console.log(ok ? "✅ permission gate roundtrip works" : "❌ failed");
  child.kill();
  process.exit(ok ? 0 : 1);
}, 40000);
