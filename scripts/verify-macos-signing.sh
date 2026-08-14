#!/usr/bin/env bash
# Verify the signature of both the build-directory app and the app embedded in
# the final DMG. Tauri performs signing during bundle creation; this script is a
# fail-closed verifier and never changes an artifact after packaging.

set -euo pipefail

MODE="${MACOS_SIGNING_MODE:-adhoc}"
APP_PATH="${1:-}"
DMG_PATH="${2:-}"

usage() {
  echo "Usage: MACOS_SIGNING_MODE=adhoc|developer-id $0 <Lattice.app> <Lattice.dmg>" >&2
  exit 2
}

[[ -n "$APP_PATH" && -d "$APP_PATH" ]] || usage
[[ -n "$DMG_PATH" && -f "$DMG_PATH" ]] || usage

case "$MODE" in
  adhoc|developer-id) ;;
  *)
    echo "Unknown MACOS_SIGNING_MODE: $MODE" >&2
    exit 2
    ;;
esac

signature_details() {
  codesign -dv --verbose=4 "$1" 2>&1
}

verify_macho_files() {
  local app="$1"
  local count=0
  while IFS= read -r -d '' candidate; do
    if file -b "$candidate" | grep -q 'Mach-O'; then
      count=$((count + 1))
      echo "Verifying nested Mach-O: ${candidate#"$app"/}"
      codesign --verify --strict --verbose=2 "$candidate"
      local nested_details
      nested_details="$(signature_details "$candidate")"
      case "$MODE" in
        adhoc)
          grep -q '^Signature=adhoc$' <<<"$nested_details"
          ;;
        developer-id)
          grep -q '^Authority=Developer ID Application:' <<<"$nested_details"
          ;;
      esac
    fi
  done < <(find "$app/Contents" -type f -print0)

  if [[ $count -eq 0 ]]; then
    echo "No Mach-O files found in $app" >&2
    return 1
  fi
  echo "Verified $count signed Mach-O files"
}

verify_code_containers() {
  local app="$1"
  while IFS= read -r -d '' container; do
    echo "Verifying nested code container: ${container#"$app"/}"
    codesign --verify --deep --strict --verbose=2 "$container"
  done < <(
    find "$app/Contents" -depth -type d \
      \( -name '*.framework' -o -name '*.app' -o -name '*.appex' \
         -o -name '*.xpc' -o -name '*.plugin' \) -print0
  )
}

verify_app() {
  local app="$1"
  echo "Verifying app bundle ($MODE): $app"
  codesign --verify --deep --strict --verbose=2 "$app"

  local details
  details="$(signature_details "$app")"
  printf '%s\n' "$details"

  case "$MODE" in
    adhoc)
      grep -q '^Signature=adhoc$' <<<"$details"
      if grep -q '^Authority=' <<<"$details"; then
        echo "Ad-hoc app unexpectedly contains a certificate authority" >&2
        return 1
      fi
      ;;
    developer-id)
      : "${APPLE_TEAM_ID:?APPLE_TEAM_ID is required in developer-id mode}"
      grep -q '^Authority=Developer ID Application:' <<<"$details"
      grep -q "^TeamIdentifier=${APPLE_TEAM_ID}$" <<<"$details"
      spctl --assess --type execute --verbose=4 "$app"
      xcrun stapler validate "$app"
      ;;
  esac

  verify_macho_files "$app"
  verify_code_containers "$app"
}

verify_app "$APP_PATH"

MOUNT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lattice-dmg.XXXXXX")"
mounted=false
cleanup() {
  if $mounted; then
    hdiutil detach "$MOUNT_DIR" -quiet || true
  fi
  rmdir "$MOUNT_DIR" 2>/dev/null || true
}
trap cleanup EXIT

hdiutil attach "$DMG_PATH" -readonly -nobrowse -mountpoint "$MOUNT_DIR" -quiet
mounted=true
PACKAGED_APP="$(find "$MOUNT_DIR" -maxdepth 2 -type d -name 'Lattice.app' -print -quit)"
if [[ -z "$PACKAGED_APP" ]]; then
  echo "Lattice.app not found in final DMG: $DMG_PATH" >&2
  exit 1
fi
verify_app "$PACKAGED_APP"

if [[ "$MODE" == "developer-id" ]]; then
  xcrun stapler validate "$DMG_PATH"
fi

echo "macOS $MODE signature verification passed for app and final DMG"
