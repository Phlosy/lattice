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

## macOS: "app is damaged / cannot be opened"

Unsigned build → Gatekeeper. Run:

```bash
xattr -dr com.apple.quarantine /path/to/Lattice.app
```

then right-click → Open.

## Linux: window does not open

Missing WebKitGTK. Install:

```bash
# Debian/Ubuntu
sudo apt install libwebkit2gtk-4.1-0 libgtk-3-0
```

## Still stuck?

Check `docs/ARCHITECTURE.md` for where each component lives, then report the
exact log line from app launch.
