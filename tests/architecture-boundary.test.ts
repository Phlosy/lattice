import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Architecture boundary: React UI (components/views/store/lib/App) must reach
// the runtime only through `window.lattice`, never by importing an adapter or
// Tauri internals. Only the runtime/ layer, main.tsx, and the adapters
// themselves may reference the transport.

const ROOT = "src/renderer/src";

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTsFiles(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function relative(path: string): string {
  return path.replace(ROOT + "/", "");
}

describe("runtime architecture boundary", () => {
  it("UI code never imports adapters or Tauri internals directly", () => {
    const forbidden = ["lattice-tauri", "lattice-remote", "__TAURI__"];
    const boundaryFiles = new Set([
      "lattice-tauri.ts",
      "lattice-remote.ts",
      "main.tsx",
    ]);

    const violations: string[] = [];
    for (const file of collectTsFiles(ROOT)) {
      const rel = relative(file);
      if (rel.startsWith("runtime/") || boundaryFiles.has(rel)) continue;
      const text = readFileSync(file, "utf8");
      const hits = forbidden.filter((token) => text.includes(token));
      if (hits.length) violations.push(`${rel}: ${hits.join(", ")}`);
    }
    expect(violations).toEqual([]);
  });

  it("adapters are only wired through the runtime provider layer", () => {
    const provider = readFileSync(join(ROOT, "runtime/provider.ts"), "utf8");
    expect(provider).toContain("createLatticeTauri");
    expect(provider).toContain("createLatticeRemote");
  });
});
