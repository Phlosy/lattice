#!/usr/bin/env bash
# Build a local release candidate and aggregate the final artifacts into
# testing/artifacts/release/ with checksums + signature verification.
# Run from anywhere; it resolves the repo root relative to this script.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

OUT="$ROOT/testing/artifacts/release"
BUNDLE="poc/tauri-app/src-tauri/target/release/bundle"

echo "==> Building (frontend + Pi sidecar + Tauri bundle)"
npm run build

APP="$BUNDLE/macos/Lattice.app"
DMG="$(find "$BUNDLE/dmg" -maxdepth 1 -name '*.dmg' -print -quit)"
[[ -d "$APP" ]] || { echo "error: $APP not found" >&2; exit 1; }
[[ -n "$DMG" && -f "$DMG" ]] || { echo "error: no .dmg found under $BUNDLE/dmg" >&2; exit 1; }

echo "==> Aggregating final artifacts into $OUT"
rm -rf "$OUT"
mkdir -p "$OUT"
cp -R "$APP" "$OUT/Lattice.app"
cp "$DMG" "$OUT/$(basename "$DMG")"

echo "==> Verifying ad-hoc signature (app + final DMG)"
MACOS_SIGNING_MODE=adhoc bash scripts/verify-macos-signing.sh \
  "$OUT/Lattice.app" "$OUT/$(basename "$DMG")" | tee "$OUT/verify.log"

echo "==> Checksums"
(
  cd "$OUT"
  shasum -a 256 "$(basename "$DMG")" Lattice.app/Contents/MacOS/poctauri-app > SHA256SUMS
  cat SHA256SUMS
)

echo ""
echo "==> Done. Local release candidate:"
ls -la "$OUT"
