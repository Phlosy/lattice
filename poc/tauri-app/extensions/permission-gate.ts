// Permission gate extension for the Pi RPC sidecar.
// Intercepts mutating tool calls (bash/write/edit) and asks the desktop UI
// for approval via ctx.ui.confirm (which maps to the RPC extension_ui_request
// sub-protocol handled by the Tauri Rust core).

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const APPROVAL_TOOLS = new Set(["bash", "write", "edit"]);

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
    if (!APPROVAL_TOOLS.has(tool)) return;

    const input = (event.input ?? {}) as Record<string, unknown>;
    const summary = summarize(tool, input);
    const allowed = await ctx.ui.confirm(`Allow ${tool}?`, summary);

    if (!allowed) {
      return { block: true, reason: "Blocked by user" };
    }
  });
}
