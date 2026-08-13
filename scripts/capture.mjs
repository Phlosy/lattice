#!/usr/bin/env node
// Visual-regression capture driver. Creates a scratch git project, launches
// Lattice under the LATTICE_DRIVE protocol, drives it through key states
// (real actions where possible, injected transcript state for deterministic
// screens), and saves PNGs to captureDir (default /tmp/lattice-captures).

import { execSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const captureDir = process.env.LATTICE_CAPTURE_DIR || "/tmp/lattice-captures";
const project = mkdtempSync(join(tmpdir(), "lattice-shot-"));
execSync(
  `cd "${project}" && git init -q && git config user.email t@t.co && git config user.name t && ` +
    `printf 'export function login() {\\n  return "ok";\\n}\\n' > auth.ts && ` +
    `printf 'console.log("hello")\\n' > main.ts && git add . && git commit -qm init`,
);
mkdirSync(captureDir, { recursive: true });

// Reusable transcript fixtures, stringified for the driver.
const userMsg = { role: "user", content: "Fix the login bug and run the tests", timestamp: Date.now() };
const assistantThinking = {
  role: "assistant",
  content: [
    { type: "text", text: "I'll investigate the login flow and fix the bug." },
    { type: "thinking", thinking: "The login function in auth.ts returns a hardcoded value. I should add proper validation and check the callers in main.ts." },
    { type: "toolCall", id: "c1", name: "read", arguments: { path: "auth.ts" } },
  ],
  timestamp: Date.now(),
};

const transcriptFixture = (extra = {}) => ({
  messages: [userMsg, assistantThinking],
  toolExecutions: {
    c1: { toolName: "read", args: { path: "auth.ts" }, startTime: Date.now() - 120, endTime: Date.now(), result: { content: [{ type: "text", text: 'export function login() {\n  return "ok";\n}\n' }] }, isError: false },
  },
  streaming: null,
  running: false,
  steering: [],
  followUp: [],
  ...extra,
});

const thinkingFixture = {
  messages: [userMsg],
  toolExecutions: {},
  streaming: {
    role: "assistant",
    content: [{ type: "thinking", thinking: "Analyzing the auth module… tracing call sites…" }],
    timestamp: Date.now(),
  },
  running: true,
  steering: [],
  followUp: [],
};

const permissionFixture = {
  requestId: "dlg-1",
  id: "req-1",
  sessionId: "s1",
  toolName: "bash",
  label: "bash",
  kind: "bash",
  summary: "rm -rf node_modules && npm install",
  command: "rm -rf node_modules && npm install",
};

const commands = [
  { wait: 1500 },
  { capture: "01-empty-project.png" },

  // Open the scratch project (real action).
  { exec: `window.__latticeStore.getState().openProject(${JSON.stringify(project)}).then(() => "opened")` },
  { wait: 1200 },
  { capture: "02-new-session.png" },

  // Create a session (real action).
  { exec: `window.__latticeStore.getState().createSession("Login fix").then(() => "created")` },
  { wait: 1200 },

  // Inject a completed conversation with a tool call.
  { exec: `window.__latticeStore.setState({ transcript: ${JSON.stringify(transcriptFixture())} }); "set"` },
  { wait: 600 },
  { capture: "05-tool-call.png" },

  // Thinking (running).
  { exec: `window.__latticeStore.setState({ transcript: ${JSON.stringify(thinkingFixture)} }); "set"` },
  { wait: 400 },
  { capture: "04-thinking.png" },

  // Reset + permission dialog.
  { exec: `window.__latticeStore.setState({ transcript: ${JSON.stringify(transcriptFixture())}, permissions: [${JSON.stringify(permissionFixture)}] }); "set"` },
  { wait: 400 },
  { capture: "09-permission.png" },

  // Clear permission, open git panel.
  { exec: `window.__latticeStore.setState({ permissions: [] }); "set"` },
  { wait: 200 },
  { exec: `window.__latticeStore.getState().togglePanel("git"); "git"` },
  { wait: 600 },
  { capture: "08-git-panel.png" },

  // Settings view.
  { exec: `window.__latticeStore.getState().setView("settings"); "settings"` },
  { wait: 600 },
  { capture: "12-settings.png" },

  { quit: true },
];

const driveFile = join(tmpdir(), "lattice-drive.json");
writeFileSync(driveFile, JSON.stringify(commands));

const child = spawn("npx", ["electron", "."], {
  cwd: process.cwd(),
  env: { ...process.env, LATTICE_DRIVE: driveFile, LATTICE_CAPTURE_DIR: captureDir },
  stdio: ["ignore", "inherit", "inherit"],
});

child.on("exit", (code) => {
  console.log("captures written to", captureDir);
  process.exit(code ?? 0);
});
