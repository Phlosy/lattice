# Pre-release local build (build + run + verify)

Before pushing / tagging for CI, build a local release candidate, run the app,
and verify its signature + runtime. Final artifacts are aggregated into a clean
git-ignored directory instead of scattering across `target/`.

## One command

```bash
bash testing/release-candidate/build.sh
```

This runs `npm run build`, copies the final `Lattice.app` + `.dmg` into
`testing/artifacts/release/`, verifies the ad-hoc signature on both the build
app and the app mounted from the final DMG, and writes `SHA256SUMS` +
`verify.log`.

## Run the built app

```bash
bash testing/release-candidate/run.sh            # launch + spawn smoke
bash testing/release-candidate/run.sh --quit     # also auto-quit + no-zombie check
```

Or manually:

```bash
open -n testing/artifacts/release/Lattice.app
```

## Outputs (git-ignored)

```text
testing/artifacts/release/
├── Lattice.app      # final packaged app
├── Lattice_*.dmg    # final installer
├── SHA256SUMS       # checksums of the distributables
└── verify.log       # signature verification output
```
