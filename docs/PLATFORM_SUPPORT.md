# Platform Support

Honest build/runtime status. **BUILD VERIFIED** ≠ **RUNTIME VERIFIED** ≠
**DEVICE VERIFIED** ≠ **STORE VERIFIED**: a CI build succeeding does not mean
the app has been run on that platform/device.

## Desktop

| Platform | Architecture | Build | Runtime | Signed | Installer |
|---|---|---|---|---|---|
| macOS — Apple Silicon | arm64 (`aarch64-apple-darwin`) | ✅ VERIFIED | ✅ VERIFIED (local) | v1.1.1+: Developer ID + notarization required by CI | DMG |
| macOS — Intel | x64 (`x86_64-apple-darwin`) | ✅ VERIFIED (cross) | ❌ not run | v1.1.1+: Developer ID + notarization required by CI | DMG |
| Windows x64 | x64 | ✅ VERIFIED | ❌ not run | ❌ unsigned | NSIS .exe |
| Windows ARM64 | aarch64 (`aarch64-pc-windows-msvc`) | ⚠️ CI cross-compile | ❌ not run | ❌ unsigned | NSIS .exe |
| Linux x86_64 | x64 | ✅ VERIFIED | ❌ not run | ❌ | AppImage / deb |
| Linux aarch64 | aarch64 | ⚠️ CI cross-compile | ❌ not run | ❌ | AppImage / deb |

## Mobile

| Platform | Device | Build | Runtime | Signing | Distribution |
|---|---|---|---|---|---|
| Android | Phone / Tablet | ⚠️ CI compile check | ❌ not run | ❌ | APK / AAB (planned) |
| iOS / iPadOS | iPhone / iPad | ⚠️ CI compile check (simulator) | ❌ not run | ❌ | TestFlight / App Store (planned) |

Mobile is a **Remote Runtime Client**: it does not run Pi locally. It connects
over WSS to a **Lattice Runtime Host** (see `docs/architecture/REMOTE_RUNTIME.md`).

## Verification matrix

| Check | macOS arm64 | Other targets |
|---|---|---|
| App launch | ✅ local | ❌ not run |
| Pi sidecar spawn (bundled) | ✅ local | ❌ not run |
| Pi RPC handshake | ✅ local | ❌ not run |
| Prompt → tool → permission → file change | ✅ local | ❌ not run |
| Crash detection + restart | ✅ local | ❌ not run |
| Clean exit (no zombie) | ✅ local | ❌ not run |
| Runtime Host (WSS) | ✅ local (127.0.0.1) | ❌ not run |

## Honest gaps (as of v1.1)

- Only **macOS Apple Silicon** is RUNTIME VERIFIED locally.
- macOS Intel / Windows x64 / Linux x86_64 are **BUILD VERIFIED** via CI.
- Windows ARM64 / Linux aarch64 are **cross-compiled** in CI; they have not
  been run on real ARM hardware (**BUILD VERIFIED at best**).
- **Mobile has no local build environment** (no full Xcode, no Android SDK/JDK
  on this machine). Mobile CI runs compile checks on GitHub runners, but no
  device/simulator RUNTIME VERIFICATION has been performed.
- v1.1.0 and earlier macOS artifacts were unsigned. The v1.1.1 workflow is
  fail-closed on Developer ID signing, notarization, Gatekeeper assessment, and
  stapling; final signed-artifact attestation requires the credentialed release
  job to complete successfully.

## Native dependency notes

- **macOS**: WKWebView (system), Bun runtime bundled in Pi sidecar.
- **Windows**: WebView2 (preinstalled on Win10/11). ARM64 uses WebView2 ARM64.
- **Linux**: requires WebKitGTK 4.1, GTK 3, libappindicator, librsvg.
- **Android**: WebView (system), requires JDK 17 + Android SDK/NDK to build.
- **iOS**: WKWebView (system), requires full Xcode to build.
