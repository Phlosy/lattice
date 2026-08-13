// Version consistency check for the v1.0 release gate.
// Ensures package.json / Cargo.toml / tauri.conf.json agree on the version.
// Usage: node scripts/check-version.mjs [expected-version]

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const expected = process.argv[2];

const sources = {
  "package.json": JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version,
  "Cargo.toml": /version\s*=\s*"([^"]+)"/.exec(
    readFileSync(join(root, "poc/tauri-app/src-tauri/Cargo.toml"), "utf8"),
  )?.[1],
  "tauri.conf.json": JSON.parse(
    readFileSync(join(root, "poc/tauri-app/src-tauri/tauri.conf.json"), "utf8"),
  ).version,
};

const versions = Object.values(sources);
const consistent = versions.every((v) => v === versions[0]);
const matchesTag = expected ? versions[0] === expected : true;

console.log("version sources:");
for (const [name, v] of Object.entries(sources)) {
  console.log(`  ${name}: ${v}`);
}

if (!consistent) {
  console.error("❌ version mismatch across sources");
  process.exit(1);
}
if (expected && !matchesTag) {
  console.error(`❌ version ${versions[0]} != git tag ${expected}`);
  process.exit(1);
}
console.log(`✅ version consistent: ${versions[0]}`);
