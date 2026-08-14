# Release

How Lattice is built, verified, signed, and published.

## Version

Single source of truth: **`package.json`** (`version`), mirrored by
`Cargo.toml` and `tauri.conf.json`. `scripts/check-version.mjs` enforces
consistency; the release pipeline fails if the git tag does not match.

## Release gate

Before tagging, run:

```bash
scripts/release-check.sh --full
```

Any failure means **DO NOT RELEASE**.

## Local build

```bash
npm ci --ignore-scripts
npm run build:ui
bash scripts/build-pi-sidecar.sh
npx tauri build --config poc/tauri-app/src-tauri/tauri.conf.json
```

Outputs are under `poc/tauri-app/src-tauri/target/release/bundle/`.

## macOS signing modes

The release workflow supports two explicit modes, controlled by the repository
variable `MACOS_SIGNING_MODE`:

| Mode | Intended use | Signing | Notarization / stapling |
|---|---|---|---|
| `adhoc` (default) | GitHub Release, development, internal testing | Tauri native signing with identity `-` | Not performed |
| `developer-id` | Future production distribution to ordinary macOS users | Developer ID Application + hardened runtime | Required |

### Ad-hoc mode (current v1.1.1 release)

No Apple credentials are required or consumed. The Pi sidecar is signed first,
then Tauri signs the app inside-out and packages the branded DMG. CI requires:

```text
codesign --verify --deep --strict --verbose=2 Lattice.app
codesign -dv --verbose=4 Lattice.app  # must report Signature=adhoc
strict codesign verification of every nested Mach-O
mount final DMG and repeat all app/nested-code verification
```

Ad-hoc signing is real code signing, but it does not establish Apple Developer
ID trust. The app is not notarized or stapled, and Gatekeeper may require manual
approval on first launch.

### Developer ID mode (future)

Set repository variable `MACOS_SIGNING_MODE=developer-id` and configure:

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | Base64-encoded Developer ID Application `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` |
| `APPLE_SIGNING_IDENTITY` | Full `Developer ID Application: … (TEAMID)` identity |
| `APPLE_ID` | Apple account email used for notarization |
| `APPLE_PASSWORD` | Apple app-specific password, not the account password |
| `APPLE_TEAM_ID` | Ten-character Apple Developer Team ID |
| `KEYCHAIN_PASSWORD` | Random password for the temporary CI keychain |

Only this mode imports a temporary keychain, supplies notarization credentials,
and requires Developer ID authority, Team ID, `spctl`, and stapler validation.

## GitHub Release

A `v*` tag triggers `.github/workflows/release.yml`:

```text
Tag → version check → platform build → selected signing mode → verification
    → packaging → final-asset checksum → GitHub Release
```

Blocking artifacts:

```text
Lattice-v<version>-macOS-Apple-Silicon.dmg
Lattice-v<version>-macOS-Intel.dmg
Lattice-v<version>-Windows-x64.exe
Lattice-v<version>-Linux-x86_64.AppImage
Lattice-v<version>-Linux-x86_64.deb
SHA256SUMS
```

Windows ARM64 and Linux aarch64 remain experimental until native ARM64 runners
can produce runtime-verified artifacts. They do not weaken the blocking release
gates.

## Smoke test

Before publishing:

1. Mount the DMG and verify its branded drag-to-Applications presentation.
2. Drag Lattice to Applications and launch it normally.
3. In ad-hoc mode, verify Finder → right-click → Open or System Settings →
   Privacy & Security → Open Anyway permits the trusted download. In
   `developer-id` mode, confirm Gatekeeper accepts it without manual approval.
4. Confirm Pi sidecar spawns (`[pi] spawned pid=…`).
5. Open a git project, create a session, and send a prompt with and without an image.
6. Switch English/Chinese, theme, and font size; restart and verify persistence.
7. Confirm DeepSeek and OpenAI appear when their Pi credentials are configured.
8. Exercise model/thinking selectors, terminal, git diff/commit/worktree, session
   rename/delete/reopen, permissions, and extension install/registry browsing.
9. Close the app and confirm no Pi process remains.

## Troubleshooting

See `TROUBLESHOOTING.md`.
