# Platform Map

Explicit mapping between user-facing names, artifact names, Rust targets,
Pi/Bun sidecar targets, and CI runners. Release artifact naming follows
platform conventions (users should never need to know Rust/Bun target triples
to download the right file).

## Desktop

| Display | Artifact name | Rust target | Bun/Pi target | Runner |
|---|---|---|---|---|
| macOS — Apple Silicon | `macOS-Apple-Silicon` | `aarch64-apple-darwin` | `bun-darwin-arm64` | `macos-14` (arm64, native) |
| macOS — Intel | `macOS-Intel` | `x86_64-apple-darwin` | `bun-darwin-x64-baseline` | `macos-14` (arm64, cross-compile) |
| Windows x64 | `Windows-x64` | `x86_64-pc-windows-msvc` | `bun` (native) | `windows-latest` |
| Windows ARM64 | `Windows-ARM64` | `aarch64-pc-windows-msvc` | `bun-windows-arm64` | `windows-latest` (cross-compile) |
| Linux x86_64 | `Linux-x86_64` | `x86_64-unknown-linux-gnu` | `bun-linux-x64-baseline` | `ubuntu-latest` |
| Linux aarch64 | `Linux-aarch64` | `aarch64-unknown-linux-gnu` | `bun-linux-arm64` | `ubuntu-latest` (cross-compile) |

## Mobile

| Display | Artifact name | Target | Runner |
|---|---|---|---|
| Android — Phone / Tablet | `Android-universal` (apk) / `Android` (aab) | `arm64-v8a` (+ `x86_64` for emulator) | `ubuntu-latest` |
| iOS / iPadOS — iPhone & iPad | `iOS-iPhone-iPad` (ipa) | `aarch64-apple-ios` (universal) | `macos-14` |

## Notes

- **Rust target ≠ artifact name.** The artifact name is a user-facing label;
  the Rust/Bun target is the actual build triple. They are kept in sync by the
  release matrix, never by naming convention alone.
- **`bun` (native)** for Windows x64 avoids the `bun-windows-x64-baseline`
  runtime download that failed on Windows runners (see `scripts/build-pi-sidecar.sh`).
- Cross-compiled targets (`macOS-Intel`, `Windows-ARM64`, `Linux-aarch64`) are
  **BUILD VERIFIED** until run on real hardware (see `docs/PLATFORM_SUPPORT.md`).
