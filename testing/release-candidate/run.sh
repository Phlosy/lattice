#!/usr/bin/env bash
# Launch the locally-built app and smoke-check the bundled Pi sidecar.
# Usage: run.sh [--quit]
#   (default)  launch + verify sidecar spawned + print UI tree, leave app open
#   --quit     additionally send Cmd+Q and verify no leftover Pi process
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

APP="poc/tauri-app/src-tauri/target/release/bundle/macos/Lattice.app"
[[ -d "$APP" ]] || APP="testing/artifacts/release/Lattice.app"
[[ -d "$APP" ]] || { echo "error: no Lattice.app found — run build.sh first" >&2; exit 1; }

echo "==> Launching $APP"
open -n "$APP"
sleep 8

echo "==> Bundled Pi sidecar"
if ! ps -axo pid,ppid,command | grep 'pi-sidecar/.*pi --mode rpc' | grep -v grep; then
  echo "error: Pi sidecar is not running" >&2
  exit 1
fi

echo "==> UI (accessibility tree, first lines)"
swift scripts/axdump.swift Lattice 2>/dev/null | head -25 || echo "(axdump unavailable)"

if [[ "${1:-}" == "--quit" ]]; then
  echo "==> Quitting via Cmd+Q"
  osascript -e 'tell application "System Events" to tell process "poctauri-app" to set frontmost to true' 2>/dev/null || true
  sleep 1
  osascript -e 'tell application "System Events" to tell process "poctauri-app" to keystroke "q" using command down' 2>/dev/null || true
  sleep 4
  if ps -axo command | grep 'pi --mode rpc' | grep -v grep; then
    echo "error: Pi sidecar still running after quit" >&2
    exit 1
  fi
  echo "==> Clean shutdown: no leftover Pi process"
else
  echo ""
  echo "App is running — interact manually, then Cmd+Q."
  echo "After quitting, verify no leftover sidecar:"
  echo "  ps -axo command | grep 'pi --mode rpc' | grep -v grep   # empty = OK"
fi
