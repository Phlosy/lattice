#!/usr/bin/env bash
# Clean up test residue: throwaway recent-projects, leftover session files, and
# local temp dirs. Key results (testing/artifacts/release, user settings) are
# deliberately preserved.
set -euo pipefail

echo "==> Pruning throwaway projects from ~/.lattice/state.json"
STATE="$HOME/.lattice/state.json"
if [[ -f "$STATE" ]]; then
  node - "$STATE" <<'NODE'
const fs = require("fs");
const os = require("os");
const path = process.argv[2];
const state = JSON.parse(fs.readFileSync(path, "utf8"));
const temp = os.tmpdir();
const keep = (state.recentProjects || []).filter((p) => {
  const pp = String(p?.path ?? "");
  if (pp.startsWith(temp) || pp.startsWith("/tmp") || pp.startsWith("/var/folders")) return false;
  if (/lattice-ws-test/.test(pp)) return false;
  return true;
});
state.recentProjects = keep;
fs.writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
console.log(`  kept ${keep.length} project(s)`);
NODE
fi

echo "==> Removing leftover session files (~/.lattice/sessions/*.jsonl)"
find "$HOME/.lattice/sessions" -maxdepth 1 -name '*.jsonl' -delete 2>/dev/null || true

echo "==> Removing local test temp dirs"
rm -rf /tmp/lattice-* /tmp/pi-* /tmp/lattice-tauri-e2e-* 2>/dev/null || true

echo "==> Clearing interactive-test artifacts (keeps release candidates)"
rm -rf testing/artifacts/dev 2>/dev/null || true

echo "==> Done"
