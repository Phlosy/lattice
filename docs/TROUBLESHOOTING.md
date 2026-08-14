# Troubleshooting

## App launches but Pi does not work

1. Check the log for `[pi] spawned pid=…`.
2. If `[pi] failed to spawn`:
   - The bundled sidecar may be missing. Run `bash scripts/build-pi-sidecar.sh`.
   - The sidecar must be at `poc/tauri-app/src-tauri/pi-sidecar/<platform>/pi`.
3. If `[pi] crashed — attempting restart` repeatedly:
   - Run the sidecar directly to see the error:
     `poc/tauri-app/src-tauri/pi-sidecar/<platform>/pi --mode rpc --session-dir /tmp/x --approve`
   - Common cause: missing `theme/` next to the binary (resource copy failed).

## "runtime failed (restart limit reached)"

The sidecar crashed 3 times in a row. The real error is in stderr of the last
crash. Reproduce manually (see above) to see the underlying failure.

## No models / model list empty

Models come from `~/.pi/agent/models.json` + `auth.json`. Verify:

```bash
ls -la ~/.pi/agent/
```

If empty, configure a model (API key) once — see the app Settings → model.

## Missing API key error

The provider needs a key. Set it in `~/.pi/agent/auth.json` (or via the
model picker). The sidecar reads auth at startup.

## Permission dialog never appears

The permission-gate extension must load. Verify the log line:

```text
[pi] spawned pid=… ext=…/extensions/permission-gate.ts
```

If the path is wrong, rebuild the sidecar (`scripts/build-pi-sidecar.sh`) so the
extension is bundled next to the binary.

## Terminal / PTY broken

PTY uses the Rust `portable-pty` crate. On Linux it needs a real shell
(`/bin/bash` or `/bin/sh`); on Windows it uses `conpty` (PowerShell).

## App exits but a `pi` process remains (zombie)

This should not happen (Drop kills the child). If it does, kill it:

```bash
pkill -f "pi .*mode rpc"
```

## Git commands fail

Lattice shells out to the system `git` binary. Ensure `git` is on `PATH`.

## macOS: first launch is blocked

The v1.1.1 GitHub/internal builds are ad-hoc signed, but are not Apple Developer
ID signed or notarized. Gatekeeper may therefore block the first launch even
though CI verified the app signature and release checksum.

First verify the DMG against `SHA256SUMS`, then use one of Apple's GUI paths:

1. In Finder, right-click **Lattice.app** and choose **Open**, then confirm.
2. Or attempt to launch once, then open **System Settings → Privacy & Security**
   and choose **Open Anyway** for Lattice.

Do not disable Gatekeeper globally (`spctl --master-disable`).

Advanced/developer fallback for a build downloaded from this repository whose
checksum you have verified:

```bash
xattr -dr com.apple.quarantine "/Applications/Lattice.app"
```

Only use that command for a Lattice build whose source and checksum you trust.
Future `developer-id` releases will use Apple notarization and stapling instead
of requiring this manual first-launch approval.

## Linux: window does not open

Missing WebKitGTK. Install:

```bash
# Debian/Ubuntu
sudo apt install libwebkit2gtk-4.1-0 libgtk-3-0
```

## Still stuck?

Check `docs/ARCHITECTURE.md` for where each component lives, then report the
exact log line from app launch.
