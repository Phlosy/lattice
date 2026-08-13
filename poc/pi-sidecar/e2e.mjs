// Full E2E: verifies the complete Tauri-migration workflow headlessly —
// open a git project → spawn Pi sidecar → prompt → agent mutates files →
// git shows changes → continue the conversation.
// (Rust commands are thin wrappers over these primitives, each already
// unit-tested; this validates the end-to-end agent workflow.)

import { spawn, execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PI_ENTRY = join(root, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js");
const EXT = join(root, "poc/tauri-app/extensions/permission-gate.ts");

// 1. Scratch git project
const project = mkdtempSync(join(tmpdir(), "lattice-e2e-tauri-"));
execSync(`cd "${project}" && git init -q && git config user.email t@t.co && git config user.name t && echo "seed" > seed.txt && git add . && git commit -qm init`);

const sessionDir = join(project, "sessions");
const child = spawn(
  process.execPath,
  [PI_ENTRY, "--mode", "rpc", "--session-dir", sessionDir, "--approve", "--extension", EXT],
  { cwd: project, env: process.env, stdio: ["pipe", "pipe", "inherit"] },
);

let buffer = "";
let text = "";
let settled = false;
let bashCount = 0;

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
    if (d.type === "extension_ui_request" && d.method === "confirm") {
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

setTimeout(() => {
  child.stdin.write(JSON.stringify({ type: "prompt", message: "Create a file named answer.txt containing exactly the text 42. Use the write tool." }) + "\n");
}, 3000);

setTimeout(async () => {
  check("agent settled (prompt completed)", settled);
  check("file created (answer.txt)", existsSync(join(project, "answer.txt")));
  if (existsSync(join(project, "answer.txt"))) {
    check("file content correct", readFileSync(join(project, "answer.txt"), "utf8").includes("42"));
  }
  const status = execSync(`cd "${project}" && git status --porcelain`).toString();
  check("git shows the new file", status.includes("answer.txt"));

  // Continue conversation
  settled = false;
  text = "";
  child.stdin.write(JSON.stringify({ type: "prompt", message: "Reply with just the number 7." }) + "\n");
  setTimeout(() => {
    check("continue conversation (settled again)", settled);
    check("streamed text received", text.length > 0);
    const ok = results.every(([, v]) => v);
    console.log(`\n=== E2E: ${results.filter(([, v]) => v).length}/${results.length} passed ===`);
    child.kill();
    process.exit(ok ? 0 : 1);
  }, 25000);
}, 40000);
