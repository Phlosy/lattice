// Model bridge verification: Pi RPC get_available_models / set_model /
// set_thinking_level request/response roundtrip (the primitives Rust model.rs
// wraps).

import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PI_ENTRY = join(root, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js");

const cwd = mkdtempSync(join(tmpdir(), "pi-model-"));
const child = spawn(process.execPath, [PI_ENTRY, "--mode", "rpc", "--session-dir", join(cwd, "sessions"), "--approve"], {
  cwd,
  env: process.env,
  stdio: ["pipe", "pipe", "inherit"],
});

let buffer = "";
let pending = new Map();
let counter = 0;

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
    }
  }
});

setTimeout(async () => {
  try {
    const models = await request({ type: "get_available_models" });
    const list = models.models ?? [];
    console.log(`✅ get_available_models: ${list.length} models`);
    console.log(`   first: ${list[0]?.provider}/${list[0]?.id}`);

    if (list.length > 0) {
      const m = list[0];
      await request({ type: "set_model", provider: m.provider, modelId: m.id });
      console.log(`✅ set_model: ${m.provider}/${m.id}`);
    }

    await request({ type: "set_thinking_level", level: "medium" });
    console.log("✅ set_thinking_level: medium");

    console.log("\n=== model bridge works ===");
    child.kill();
    process.exit(0);
  } catch (e) {
    console.error("❌ model bridge failed:", e);
    child.kill();
    process.exit(1);
  }
}, 4000);
