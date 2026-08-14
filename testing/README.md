# Local testing

Two local test workflows live here. Only the scripts and checklists are tracked
by git; everything they produce (logs, screenshots, built apps, DMGs, checksums)
goes into `testing/artifacts/`, which is git-ignored.

| Workflow | Directory | What it does |
|---|---|---|
| Interactive (dev + manual) | [`interactive/`](interactive/README.md) | Run the app locally and click through it by hand |
| Pre-release local build | [`release-candidate/`](release-candidate/README.md) | Build, run, and verify a local release candidate before tagging |

## Artifact layout (git-ignored)

```text
testing/artifacts/
├── dev/        # interactive-test logs + screenshots (dump here)
└── release/    # build.sh output: Lattice.app + .dmg + SHA256SUMS + verify.log
```

The actual toolchain build outputs (`dist/`, `src-tauri/target/`,
`src-tauri/pi-sidecar/`, `node_modules/`) stay where the tools require them and
are all covered by `.gitignore` (root + `src-tauri/.gitignore`).

## Cleanup

Every test run leaves residue (throwaway recent-projects, session files, temp
dirs). `run.sh` cleans up automatically; you can also run it manually:

```bash
bash scripts/clean-test-residue.sh
```

It prunes temp/test projects from `~/.lattice/state.json`, removes leftover
session files, and clears `testing/artifacts/dev/` — while keeping key results
(`testing/artifacts/release/` and your user settings).
