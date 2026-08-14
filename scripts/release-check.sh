#!/usr/bin/env bash
# Release gate — machine-checkable pre-release validation.
# Run before tagging a release. Any FAIL → DO NOT RELEASE.
#
# Usage: scripts/release-check.sh [--full]
#   --full  also runs the (slower) frontend + Rust test suites.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FULL=false
[[ "${1:-}" == "--full" ]] && FULL=true

CARGO_BIN="$(command -v cargo 2>/dev/null || true)"
if [[ -z "$CARGO_BIN" && -x "$HOME/.cargo/bin/cargo" ]]; then
  CARGO_BIN="$HOME/.cargo/bin/cargo"
fi

PASS=0
FAIL=0

check() {
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "  ✅ $name"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $name"
    FAIL=$((FAIL + 1))
  fi
}

# Platform directory (matches scripts/build-pi-sidecar.sh).
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) PLAT=darwin-arm64 ;;
  Darwin-x86_64) PLAT=darwin-x64 ;;
  Linux-x86_64) PLAT=linux-x64 ;;
  Linux-aarch64|Linux-arm64) PLAT=linux-arm64 ;;
  MINGW*-x86_64|MSYS*-x86_64) PLAT=windows-x64 ;;
  *) PLAT=unknown ;;
esac

echo "== Lattice release gate =="
echo ""

echo "Architecture / version"
check "version consistent (package.json == Cargo.toml == tauri.conf)" \
  node scripts/check-version.mjs
check "Electron removed from production (no electron dep, no src/main)" \
  bash -c '! grep -q "\"electron\"" package.json && [ ! -d src/main ] && [ ! -f electron.vite.config.ts ]'

echo ""
echo "Bundled runtime"
if [[ "$PLAT" != "unknown" ]]; then
  check "bundled Pi runtime exists (pi-sidecar/$PLAT)" \
    test -f "poc/tauri-app/src-tauri/pi-sidecar/$PLAT/pi" -o -f "poc/tauri-app/src-tauri/pi-sidecar/$PLAT/pi.exe"
  check "bundled extension exists" \
    test -f "poc/tauri-app/src-tauri/pi-sidecar/$PLAT/extensions/permission-gate.ts"
else
  echo "  ⚠️  unknown host platform — skipping bundled runtime check"
fi

echo ""
echo "Build artifacts"
check "frontend built (poc/tauri-app/dist/index.html)" \
  test -f "poc/tauri-app/dist/index.html"
check "Rust release binary built" \
  test -f "poc/tauri-app/src-tauri/target/release/poctauri-app"
check "macOS signing verifier is valid shell" \
  bash -n scripts/verify-macos-signing.sh
check "macOS default signing identity is ad-hoc" \
  node -e 'const c=require("./poc/tauri-app/src-tauri/tauri.conf.json"); process.exit(c.bundle?.macOS?.signingIdentity === "-" ? 0 : 1)'

if [[ "$(uname -s)" == "Darwin" ]]; then
  APP="poc/tauri-app/src-tauri/target/release/bundle/macos/Lattice.app"
  DMG="$(find poc/tauri-app/src-tauri/target/release/bundle/dmg -maxdepth 1 -name '*.dmg' -print -quit 2>/dev/null || true)"
  check "macOS app and final DMG pass ad-hoc signature verification" \
    bash -c 'MACOS_SIGNING_MODE=adhoc bash scripts/verify-macos-signing.sh "$1" "$2"' _ "$APP" "$DMG"
fi

echo ""
echo "Docs"
check "required docs exist (ARCHITECTURE/BUILD/RELEASE/PLATFORM_SUPPORT/TROUBLESHOOTING)" \
  bash -c 'for f in docs/ARCHITECTURE.md docs/BUILD.md docs/RELEASE.md docs/PLATFORM_SUPPORT.md docs/TROUBLESHOOTING.md; do [ -f "$f" ] || exit 1; done'

if $FULL; then
  echo ""
  echo "Tests (--full)"
  check "frontend tests pass" npx vitest --run
  check "Rust tests pass" \
    bash -c 'cd poc/tauri-app/src-tauri && "$1" test --release' _ "$CARGO_BIN"
fi

echo ""
echo "== Result: $PASS passed, $FAIL failed =="
if [[ $FAIL -eq 0 ]]; then
  echo "✅ RELEASE GATE PASSED"
  exit 0
else
  echo "❌ RELEASE GATE FAILED — DO NOT RELEASE"
  exit 1
fi
