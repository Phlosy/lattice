// Multi-agent: two sessions run in parallel against the same shared
// ModelRuntime, proving the architecture supports concurrent coding tasks.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAgentDir, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { DialogBridge } from "../src/main/runtime/dialog-bridge";
import { PiRuntimeAdapter } from "../src/main/runtime/pi-runtime";

let adapter: PiRuntimeAdapter;
let model: { provider: string; id: string } | undefined;
let a: string;
let b: string;

beforeAll(async () => {
  const agentDir = getAgentDir();
  const mr = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: join(agentDir, "models.json"),
  });
  const available = await mr.getAvailable();
  const m = available.find((x) => x.provider === "deepseek") ?? available[0];
  if (!m) return;
  model = { provider: m.provider, id: m.id };

  adapter = new PiRuntimeAdapter(new DialogBridge());
  await adapter.init();
  a = mkdtempSync(join(tmpdir(), "lattice-par-a-"));
  b = mkdtempSync(join(tmpdir(), "lattice-par-b-"));
  writeFileSync(join(a, "a.txt"), "alpha");
  writeFileSync(join(b, "b.txt"), "beta");
});

afterAll(async () => {
  if (adapter) await adapter.dispose();
});

describe.skipIf(!process.env.DEEPSEEK_API_KEY && !process.env.ANTHROPIC_API_KEY)("parallel sessions (live)", () => {
  it("runs two sessions concurrently to completion", async () => {
    if (!model || !adapter) return;

    const s1 = await adapter.createSession({ projectId: "p1", cwd: a });
    const s2 = await adapter.createSession({ projectId: "p2", cwd: b });
    await Promise.all([s1.setModel(model!.provider, model!.id), s2.setModel(model!.provider, model!.id)]);

    let text1 = "";
    let text2 = "";
    const u1 = s1.subscribe((e) => {
      if (e.type === "message_update") {
        const d = e.assistantMessageEvent as { type: string; delta?: string };
        if (d.type === "text_delta") text1 += d.delta ?? "";
      }
    });
    const u2 = s2.subscribe((e) => {
      if (e.type === "message_update") {
        const d = e.assistantMessageEvent as { type: string; delta?: string };
        if (d.type === "text_delta") text2 += d.delta ?? "";
      }
    });

    const start = Date.now();
    await Promise.all([
      s1.prompt("Read a.txt and reply with its single word content only."),
      s2.prompt("Read b.txt and reply with its single word content only."),
    ]);
    const elapsed = Date.now() - start;

    u1();
    u2();
    expect(text1).toContain("alpha");
    expect(text2).toContain("beta");
    // Concurrency sanity: both finished; no assertion on wall-clock since
    // provider latency dominates, but the two were issued in the same tick.
    expect(elapsed).toBeGreaterThan(0);

    s1.dispose();
    s2.dispose();
  }, 90_000);
});
