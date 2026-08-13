# Build & packaging

## Local build

```bash
npm install            # installs deps; electron-builder rebuilds node-pty
npm run build          # typecheck + electron-vite build → out/{main,preload,renderer}
npm run dev            # electron-vite dev (HMR)
```

Output layout:

- `out/main/index.js` — ESM main process bundle (package.json `"type": "module"`).
- `out/preload/index.mjs` — ESM preload (sandbox disabled, contextIsolation on).
- `out/renderer/` — static renderer assets.

## Native modules

`node-pty` is the only native module. It is rebuilt for Electron's ABI either by
`npm install` (electron-builder `install-app-deps`) or explicitly:

```bash
npm run rebuild        # electron-rebuild -f -w node-pty
```

## Packaging

```bash
npm run package:mac    # .dmg + .zip  (arm64 by default; universal via --universal)
npm run package:win    # NSIS .exe
npm run package:linux  # .AppImage + .deb
```

Per-platform output is written to `release/`:

- macOS: `release/Lattice-<ver>-<arch>.dmg`
- Windows: `release/Lattice-<ver>-<arch>.exe`
- Linux: `release/Lattice-<ver>-<arch>.AppImage` + `.deb`

**asarUnpack** covers `node-pty`, `@earendil-works/*` (Pi's dist, loaded at
runtime, incl. jiti/extension + photon WASM assets), and `@silvia-odwyer/*`.

**Code signing** — unsigned by default (no Developer ID / signing certs
configured). For distribution, set `CSC_LINK` / `CSC_KEY_PASSWORD` (mac) or the
Windows/Linux equivalents; see [electron-builder code signing](https://www.electron.build/code-signing).

## CI

`.github/workflows/build.yml` builds all three platforms in a matrix using
`npm ci`, `npm run build`, and `electron-builder` per-OS, uploading installers as
artifacts. Native modules are rebuilt via `electron-builder install-app-deps`
(or `--ignore-scripts` + explicit `electron-rebuild` when the toolchain is
available).

## Notes

- `engines.node >= 22.19.0` comes from Pi. Electron 43 bundles a compatible
  Node; the in-process Pi SDK is validated under it.
- First launch without any provider credentials shows an empty model list —
  add an API key in Settings, or reuse `~/.pi/agent/auth.json` / env vars.
