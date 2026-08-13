#!/bin/bash
# Capture + OCR helper for Codex UI reverse engineering.
# Usage: ./scripts/shot.sh <name>  →  saves research/codex-ui/<name>.png and prints OCR
#        ./scripts/shot.sh <name> nocrop  →  no OCR (just screenshot)
set -e
cd "$(dirname "$0")/.."
NAME="${1:-shot}"
WINDOW_ID="${CODEX_WINDOW_ID:-4330}"
osascript -e 'tell application "ChatGPT" to activate' >/dev/null 2>&1 || true
sleep 1
screencapture -x -o -l "$WINDOW_ID" "research/codex-ui/${NAME}.png" 2>/dev/null || screencapture -x "research/codex-ui/${NAME}.png"
if [ "${2:-}" != "nocrop" ]; then
  swift scripts/ocr.swift "research/codex-ui/${NAME}.png" 2>/dev/null
fi
echo "--- saved research/codex-ui/${NAME}.png ---"
