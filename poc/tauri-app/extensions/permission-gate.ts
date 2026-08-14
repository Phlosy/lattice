// Permission gate extension for the Pi RPC sidecar.
// Intercepts mutating tool calls (bash/write/edit) and asks the desktop UI
// for approval via ctx.ui.confirm (which maps to the RPC extension_ui_request
// sub-protocol handled by the Tauri Rust core).

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MUTATING_TOOLS = new Set(["bash", "write", "edit"]);
const SETTINGS_PATH = join(homedir(), ".lattice", "tauri-settings.json");

function autoApproveReadOnly(): boolean {
  try {
    const settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) as { autoApproveReadOnly?: unknown };
    return settings.autoApproveReadOnly !== false;
  } catch {
    return true;
  }
}

function summarize(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "bash") {
    return typeof input.command === "string" ? input.command : "";
  }
  if (typeof input.path === "string") {
    return `${toolName}: ${input.path}`;
  }
  return toolName;
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const tool = event.toolName;
    if (!MUTATING_TOOLS.has(tool) && autoApproveReadOnly()) return;

    const input = (event.input ?? {}) as Record<string, unknown>;
    const summary = summarize(tool, input);
    const allowed = await ctx.ui.confirm(`Allow ${tool}?`, summary);

    if (!allowed) {
      return { block: true, reason: "Blocked by user" };
    }
  });
}
