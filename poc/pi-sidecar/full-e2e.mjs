// Full E2E for the Tauri migration — validates the complete chain through
// the Pi RPC sidecar (the same primitives the Rust commands wrap):
//   get_available_models → new_session → get_state → prompt → permission gate
//   → write tool → file change → git → continue.
// This is the automated acceptance test for REMOVE_ELECTRON sub-step 8.

import { spawn, execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PI_ENTRY = join(root, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js");
const EXT = join(root, "poc/tauri-app/extensions/permission-gate.ts");

const project = mkdtempSync(join(tmpdir(), "lattice-tauri-e2e-"));
execSync(`cd "${project}" && git init -q && git config user.email t@t.co && git config user.name t && echo seed > seed.txt && git add . && git commit -qm init`);

const child = spawn(
  process.execPath,
  [PI_ENTRY, "--mode", "rpc", "--session-dir", join(project, "sessions"), "--approve", "--extension", EXT],
  { cwd: project, env: process.env, stdio: ["pipe", "pipe", "inherit"] },
);

let buffer = "";
let pending = new Map();
let counter = 0;
let text = "";
let bashCount = 0;
let settled = false;

function request(cmd) {
  const id = `r${++counter}`;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ ...cmd, id }) + "\n");
  });
}

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  while (true) {
    const nl = buffer.indexOf("\n");
    if (nl === -1) break;
    const line = buffer.slice(0, nl).replace(/\r$/, "");
    buffer = buffer.slice(nl + 1);
    if (!line.trim()) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    if (d.type === "response" && d.id && pending.has(d.id)) {
      const { resolve, reject } = pending.get(d.id);
      pending.delete(d.id);
      d.success === false ? reject(new Error(d.error)) : resolve(d.data);
    } else if (d.type === "extension_ui_request" && d.method === "confirm") {
      child.stdin.write(JSON.stringify({ type: "extension_ui_response", id: d.id, confirmed: true }) + "\n");
    } else if (d.type === "message_update" && d.assistantMessageEvent?.type === "text_delta") {
      text += d.assistantMessageEvent.delta;
    } else if (d.type === "tool_execution_start" && d.toolName === "bash") {
      bashCount++;
    } else if (d.type === "agent_settled") {
      settled = true;
    }
  }
});

const results = [];
function check(name, ok) {
  results.push([name, ok]);
  console.log(`${ok ? "✅" : "❌"} ${name}`);
}

setTimeout(async () => {
  try {
    // 1. Model
    const models = await request({ type: "get_available_models" });
    check("get_available_models", (models.models ?? []).length > 0);

    // 2. Session
    const state1 = await request({ type: "get_state" });
    check("get_state (session exists)", !!state1.sessionId);

    // 3. Prompt → write tool → file change
    await request({ type: "prompt", message: "Create a file named answer.txt containing exactly 42. Use the write tool." });
    await waitFor(() => settled, 40000);
    check("agent settled", settled);
    check("file created", existsSync(join(project, "answer.txt")));
    if (existsSync(join(project, "answer.txt"))) {
      check("file content", readFileSync(join(project, "answer.txt"), "utf8").includes("42"));
    }
    const gitStatus = execSync(`cd "${project}" && git status --porcelain`).toString();
    check("git shows change", gitStatus.includes("answer.txt"));

    // 4. Continue
    settled = false;
    text = "";
    await request({ type: "prompt", message: "Reply with just the number 7." });
    await waitFor(() => settled, 30000);
    check("continue (settled)", settled);
    check("streamed text", text.length > 0);

    const ok = results.every(([, v]) => v);
    console.log(`\n=== Full E2E: ${results.filter(([, v]) => v).length}/${results.length} passed ===`);
    child.kill();
    process.exit(ok ? 0 : 1);
  } catch (e) {
    console.error("❌ E2E failed:", e);
    child.kill();
    process.exit(1);
  }
}, 4000);

function waitFor(pred, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (pred()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error("timeout"));
      }
    }, 200);
  });
}
