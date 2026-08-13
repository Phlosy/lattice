// Service-level E2E: exercises the full desktop workflow without the GUI —
// open a git project → create a session → prompt the live agent → it calls a
// mutating tool → the file changes → git shows a diff → user continues.
//
// Runs against a real model when credentials are available (skips otherwise).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAgentDir, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { DialogBridge } from "../src/main/runtime/dialog-bridge";
import { PiRuntimeAdapter } from "../src/main/runtime/pi-runtime";
import { SessionRegistry } from "../src/main/session-registry";
import { WorkspaceManager } from "../src/main/workspace";
import { GitManager } from "../src/main/git";
import { AppState } from "../src/main/state";

let adapter: PiRuntimeAdapter;
let model: { provider: string; id: string } | undefined;
let projectDir: string;
let cwd: string;

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

  // Set up a git repo workspace.
  projectDir = mkdtempSync(join(tmpdir(), "lattice-e2e-"));
  cwd = join(projectDir, "repo");
  execSync(`mkdir -p "${cwd}" && cd "${cwd}" && git init -q && git config user.email t@t.co && git config user.name test && echo "seed" > seed.txt && git add . && git commit -qm init`);

  const bridge = new DialogBridge();
  bridge.autoApprove = true;
  adapter = new PiRuntimeAdapter(bridge);
  await adapter.init();
});

afterAll(async () => {
  if (adapter) await adapter.dispose();
});

describe.skipIf(!process.env.DEEPSEEK_API_KEY && !process.env.ANTHROPIC_API_KEY)("desktop workflow (live)", () => {
  it("open → session → prompt → tool → diff → continue", async () => {
    if (!model || !adapter) return;

    const events: unknown[] = [];
    const send = (_ch: string, ..._args: unknown[]) => {};
    const workspace = new WorkspaceManager(new AppState());
    const project = await workspace.openProject(cwd);
    const git = new GitManager();
    const registry = new SessionRegistry(adapter, send);

    const session = await registry.create({ projectId: project.id, cwd, name: "e2e" });
    let settled = false;
    session.subscribe((e) => {
      events.push(e.type);
      if (e.type === "agent_settled") settled = true;
    });

    await session.setModel(model!.provider, model!.id);

    // Step 1: ask the agent to create a file (exercises a mutating tool).
    await session.prompt("Create a file named answer.txt containing exactly the text `42`. Use the write tool.");
    expect(settled).toBe(true);
    expect(events).toContain("tool_execution_start");

    // Step 2: the file must exist with the expected content.
    const { readFileSync, existsSync } = await import("node:fs");
    expect(existsSync(join(cwd, "answer.txt"))).toBe(true);
    expect(readFileSync(join(cwd, "answer.txt"), "utf8").trim()).toContain("42");

    // Step 3: git status shows the change.
    const status = await git.status(cwd);
    expect(status.files.some((f) => f.path === "answer.txt")).toBe(true);
    const diff = await git.diff(cwd, ["answer.txt"]);
    expect(diff).toContain("42");

    // Step 4: continue the conversation.
    settled = false;
    let text = "";
    session.subscribe((e) => {
      if (e.type === "message_update") {
        const d = e.assistantMessageEvent as { type: string; delta?: string };
        if (d.type === "text_delta") text += d.delta ?? "";
      }
    });
    await session.prompt("Reply with just the number 7.");
    expect(text).toContain("7");

    session.dispose();
  }, 90_000);
});
