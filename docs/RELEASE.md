# Release

How Lattice v1.0 is built, verified, and published.

## Version

Single source of truth: **`package.json`** (`version`), mirrored by
`Cargo.toml` and `tauri.conf.json`. `scripts/check-version.mjs` enforces
consistency; the release pipeline fails if the git tag does not match.

Bump the version with:

```bash
# edit package.json version, then:
node scripts/check-version.mjs
```

## Release gate

Before tagging, run:

```bash
scripts/release-check.sh --full
```

Any ❌ → **DO NOT RELEASE**.

## Local build

```bash
npm ci --ignore-scripts
npm run build:ui            # React → poc/tauri-app/dist
bash scripts/build-pi-sidecar.sh   # Bun-compile Pi sidecar + resources
npx tauri build --config poc/tauri-app/src-tauri/tauri.conf.json
```

Outputs:

```text
poc/tauri-app/src-tauri/target/release/bundle/
├── macos/Lattice.app
└── dmg/Lattice_<version>_<arch>.dmg
```

## GitHub Release

Tag `v*` (e.g. `v1.0.0`) triggers `.github/workflows/release.yml`:

```text
Tag → validate version → build matrix → package → checksum → GitHub Release
```

Matrix: macOS arm64 (`macos-14`), macOS x64 (`macos-13`), Windows x64,
Linux x64. Artifacts are renamed to:

```text
Lattice-v1.0.0-macos-arm64.dmg
Lattice-v1.0.0-macos-x64.dmg
Lattice-v1.0.0-windows-x64.exe
Lattice-v1.0.0-linux-x64.AppImage
Lattice-v1.0.0-linux-x64.deb
SHA256SUMS
```

## Signing status

| Platform | Status |
|---|---|
| macOS | ❌ unsigned (Developer ID + notarization pipeline designed but no credentials) |
| Windows | ❌ unsigned (code signing interface reserved) |
| Linux | ❌ unsigned |

Unsigned builds are for internal distribution. `macOS` unsigned apps require
`xattr -dr com.apple.quarantine Lattice.app` after download, and users must
right-click → Open on first launch.

## Smoke test (manual)

After building an installer, before publishing:

1. Install / extract.
2. Launch — verify the window appears.
3. Confirm Pi sidecar spawns (log line `[pi] spawned pid=…`).
4. Open a git project, create a session, send a prompt.
5. Confirm tool call → permission dialog → file change → diff.
6. Close the app and confirm no leftover `pi` process.

## Troubleshooting

See `TROUBLESHOOTING.md`.
