// Standalone smoke test: exercises the Pi SDK in-process (createAgentSession +
// ModelRuntime + a real DeepSeek model) to validate the core integration path
// that PiRuntimeAdapter relies on. Run with: node tests/sdk-smoke.mjs

import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

async function main() {
  const agentDir = getAgentDir();
  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: join(agentDir, "models.json"),
  });

  // Find a deepseek model with configured auth.
  const available = await modelRuntime.getAvailable();
  const deepseekModels = available.filter((m) => m.provider === "deepseek");
  console.log(`[smoke] ${available.length} available models, ${deepseekModels.length} deepseek`);
  const model = deepseekModels[0] ?? available[0];
  if (!model) {
    console.log("[smoke] NO AUTHENTICATED MODEL AVAILABLE — cannot run live prompt");
    console.log("[smoke] providers:", modelRuntime.getProviders().map((p) => p.id).join(", "));
    return;
  }
  console.log(`[smoke] using model ${model.provider}/${model.id}`);

  // Temp workspace with a file to read.
  const cwd = mkdtempSync(join(tmpdir(), "lattice-smoke-"));
  writeFileSync(join(cwd, "hello.txt"), "hello from pi\n");

  const { session } = await createAgentSession({
    cwd,
    agentDir,
    modelRuntime,
    model,
    tools: ["read", "bash"],
    sessionManager: SessionManager.inMemory(cwd),
  });

  let text = "";
  const toolCalls = [];
  session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      text += event.assistantMessageEvent.delta;
    }
    if (event.type === "tool_execution_start") {
      toolCalls.push(event.toolName);
      console.log(`[smoke] tool start: ${event.toolName}`);
    }
    if (event.type === "tool_execution_end") {
      console.log(`[smoke] tool end: ${event.toolName} (error=${event.isError})`);
    }
  });

  await session.prompt("Read the file hello.txt and tell me its exact contents in one line.");

  console.log("[smoke] tool calls:", toolCalls.join(", ") || "(none)");
  console.log("[smoke] assistant text:", text.slice(0, 200));
  console.log("[smoke] OK");
  session.dispose();
}

main().catch((err) => {
  console.error("[smoke] FAILED:", err);
  process.exit(1);
});
