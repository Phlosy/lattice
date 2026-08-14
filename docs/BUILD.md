# Build & packaging

Lattice production builds use **Tauri 2 + React + a bundled Bun-compiled Pi RPC
sidecar**. Electron is retained only under `legacy/electron/` as reference code.

## Prerequisites

- Node.js 22
- Rust stable with the target architecture installed
- Bun 1.3.14
- Platform-native Tauri prerequisites (Xcode tools, MSVC/WebView2, or
  WebKitGTK 4.1)

## Local development

```bash
npm ci --ignore-scripts
npm run dev
```

The React renderer is built by Vite from `src/renderer/src`. Rust Desktop Core
lives in `poc/tauri-app/src-tauri`.

## Production build

```bash
npm run build
```

This runs, in order:

1. `npm run build:ui` → `poc/tauri-app/dist`
2. `scripts/build-pi-sidecar.sh` → platform-specific standalone Pi binary and resources
3. `tauri build` → native application and installers

Outputs are written under:

```text
poc/tauri-app/src-tauri/target/<target>/release/bundle/
```

Typical artifacts:

- macOS: `.app` + `.dmg`
- Windows: NSIS `.exe`
- Linux: `.AppImage` + `.deb`

The installed application does not require user-installed Node, npm, Bun, or Pi.

## Validation

```bash
npm run typecheck
npm test
cd poc/tauri-app/src-tauri
cargo fmt -- --check
cargo clippy --all-targets -- -D warnings
cargo test --all-targets
```

Before tagging, run the full release gate:

```bash
scripts/release-check.sh --full
```

## macOS signing

Tauri defaults to ad-hoc identity `-` for development/GitHub internal releases.
The build script signs the nested Pi Mach-O first; Tauri then signs the app and
packages the branded DMG. Verify the build-directory app and the app inside the
final DMG with:

```bash
MACOS_SIGNING_MODE=adhoc scripts/verify-macos-signing.sh \
  poc/tauri-app/src-tauri/target/release/bundle/macos/Lattice.app \
  poc/tauri-app/src-tauri/target/release/bundle/dmg/Lattice_*.dmg
```

Ad-hoc builds are not Apple Developer ID signed or notarized. Future production
distribution can set `MACOS_SIGNING_MODE=developer-id` and configure the Apple
credentials documented in [`RELEASE.md`](RELEASE.md); no workflow redesign is
required.

## CI/CD

- `.github/workflows/ci.yml` validates normal pushes and pull requests.
- `.github/workflows/release.yml` builds installers from `v*` tags.
- `.github/workflows/mobile-ci.yml` contains mobile compile checks.

See [`PLATFORM_SUPPORT.md`](PLATFORM_SUPPORT.md) for the distinction between
build, runtime, device, and signing verification.
