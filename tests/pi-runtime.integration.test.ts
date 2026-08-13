// Integration test: Lattice's PiRuntimeAdapter → Pi SDK → real model → tool →
// workspace. Skips when no authenticated model is available (offline CI), and
// otherwise exercises the full chain the desktop app uses.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAgentDir, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { DialogBridge } from "../src/main/runtime/dialog-bridge";
import { PiRuntimeAdapter } from "../src/main/runtime/pi-runtime";

let adapter: PiRuntimeAdapter;
let model: { provider: string; id: string } | undefined;
let cwd: string;

beforeAll(async () => {
  const agentDir = getAgentDir();
  const mr = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: join(agentDir, "models.json"),
  });
  const available = await mr.getAvailable();
  const m = available.find((x) => x.provider === "deepseek") ?? available[0];
  if (!m) {
    model = undefined;
    return;
  }
  model = { provider: m.provider, id: m.id };
  adapter = new PiRuntimeAdapter(new DialogBridge());
  await adapter.init();
  cwd = mkdtempSync(join(tmpdir(), "lattice-it-"));
  writeFileSync(join(cwd, "hello.txt"), "hello from lattice\n");
});

afterAll(async () => {
  if (adapter) await adapter.dispose();
});

describe.skipIf(!process.env.DEEPSEEK_API_KEY && !process.env.ANTHROPIC_API_KEY)("PiRuntimeAdapter (live)", () => {
  it("creates a session, prompts, executes the read tool, and streams a response", async () => {
    if (!model || !adapter) return;

    const session = await adapter.createSession({ projectId: "test-proj", cwd });

    let toolCalls: string[] = [];
    let text = "";
    const unsub = session.subscribe((event) => {
      if (event.type === "tool_execution_start") toolCalls.push(event.toolName as string);
      if (event.type === "message_update") {
        const d = event.assistantMessageEvent as { type: string; delta?: string };
        if (d.type === "text_delta") text += d.delta ?? "";
      }
    });

    await session.setModel(model!.provider, model!.id);
    await session.prompt("Read hello.txt and output ONLY its exact contents.");

    unsub();
    expect(toolCalls).toContain("read");
    expect(text).toContain("hello from lattice");

    session.dispose();
  }, 60_000);
});
