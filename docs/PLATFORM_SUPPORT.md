# Platform Support

Honest build/runtime status. **BUILD VERIFIED** ≠ **RUNTIME VERIFIED**:
a CI build succeeding does not mean the app has been run on that platform.

| Platform | Architecture | Build | Runtime | Signed | Installer |
|---|---|---|---|---|---|
| macOS | arm64 | ✅ VERIFIED | ✅ VERIFIED | ❌ unsigned | DMG |
| macOS | x64 | ⚠️ CI build only | ❌ not run | ❌ unsigned | DMG |
| Windows | x64 | ⚠️ CI build only | ❌ not run | ❌ unsigned | NSIS .exe |
| Windows | arm64 | ❌ not built | ❌ not run | ❌ | — |
| Linux | x64 | ⚠️ CI build only | ❌ not run | ❌ | AppImage / deb |
| Linux | aarch64 | ❌ not built | ❌ not run | ❌ | — |

## Verification matrix

| Check | macOS arm64 | Other targets |
|---|---|---|
| App launch | ✅ local | ❌ not run |
| Pi sidecar spawn (bundled) | ✅ local | ❌ not run |
| Pi RPC handshake | ✅ local | ❌ not run |
| Open project / list files | ✅ local | ❌ not run |
| Create session / get state | ✅ local | ❌ not run |
| Prompt → tool → permission → file change | ✅ local | ❌ not run |
| Git / worktree | ✅ local | ❌ not run |
| PTY / terminal | ✅ local | ❌ not run |
| Crash detection + restart | ✅ local | ❌ not run |
| Clean exit (no zombie) | ✅ local | ❌ not run |

## Native dependency notes

- **macOS**: WKWebView (system), Bun runtime bundled in Pi sidecar. No extra install.
- **Windows**: WebView2 (usually preinstalled on Win10/11). Pi sidecar is a `.exe` (Bun-compiled). Node **not** required.
- **Linux**: requires WebKitGTK 4.1 (`libwebkit2gtk-4.1-dev`), GTK 3, libappindicator, librsvg. Install via the distro package manager. Pi sidecar is a Bun-compiled ELF binary.

## Honest gaps (as of v1.0)

- Only **macOS arm64** is RUNTIME VERIFIED locally.
- macOS x64 / Windows x64 / Linux x64 are **BUILD VERIFIED** via GitHub Actions only — they have not been launched on real hardware in this repository's verification record.
- Windows/Linux ARM64 have no CI runner and no build; they are **not supported** in v1.0.
- No code signing / notarization on any platform yet (see `RELEASE.md`).
