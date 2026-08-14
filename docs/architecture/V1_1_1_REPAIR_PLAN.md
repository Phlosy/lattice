# Lattice v1.1.1 Repair Plan

Status: implemented; signing policy updated for GitHub/internal distribution

> Update: v1.1.1 uses verified ad-hoc signing because the project is not yet in
> the Apple Developer Program. Developer ID/notarization remains an opt-in
> future production mode rather than a blocker for this internal release.

## Scope

Repair the macOS installer experience, prevent unsigned macOS application
bundles, restore production Tauri controls that currently fall through to the stub, and
make Pi provider/model credentials visible to Finder-launched builds.

The frozen architecture remains unchanged:

- React is the product UI.
- Rust/Tauri is Desktop Core.
- Pi remains the bundled RPC sidecar.
- Electron remains reference-only.

## Root causes

1. The DMG has no version-controlled background or Finder layout.
2. Released macOS apps are ad-hoc signed, not Developer ID signed, not
   notarized, and have no stapled ticket. Browser quarantine therefore causes
   Gatekeeper to report the app as damaged.
3. `lattice-tauri.ts` spreads the benign stub into the production adapter;
   fourteen API methods still silently return fake success or empty data.
4. React sends partial settings patches, while Rust requires a complete
   two-field settings value. Locale/theme updates fail, and five expected
   settings fields are missing from Rust responses.
5. Finder-launched apps do not inherit API keys exported only by an interactive
   shell. Provider discovery/login are also production stubs, so DeepSeek cannot
   be repaired from the UI.
6. Session metadata, IDs, and file paths are mixed. Live Pi events are hardcoded
   to session `main`, so valid events can be dropped.

## Design

### 1. Branded DMG

- Commit a generated 720x440 dark branded PNG background.
- Pin window size, application position, and Applications link position under
  `bundle.macOS.dmg`. Tauri 2.11 does not expose a DMG icon-size field, so the
  icon size remains the bundler default and is verified visually.
- Keep the source generator so the artwork is reproducible.

### 2. Fail-closed macOS signing

- Default `MACOS_SIGNING_MODE=adhoc` for GitHub/internal distribution. Sign the
  nested Pi Mach-O first, then let Tauri sign the app and package the DMG.
- Verify `Signature=adhoc`, strict/deep app validity, every nested Mach-O, and
  the app extracted from the final DMG. Do not notarize or staple in this mode.
- Retain `MACOS_SIGNING_MODE=developer-id` for future ordinary-user production
  distribution. Only that mode requires Apple credentials, imports a temporary
  keychain, notarizes, runs `spctl`, and validates stapled tickets.
- Release notes must state the actual mode and never imply ad-hoc artifacts are
  Apple Developer ID signed or notarized.

### 3. Production adapter completeness

- Keep the stub only for browser/mobile fallback; do not spread it into the
  desktop Tauri adapter.
- Implement every `LatticeApi` method explicitly or return an explicit error for
  unsupported behavior.
- Add proper Tauri unlisten handling and local event multiplexing for session,
  model, git, and deletion events.
- Add an adapter contract regression test so production methods cannot silently
  fall back to a stub again.

### 4. Settings and controls

- Persist the complete `AppSettings` shape in Rust using camelCase serde names.
- Accept partial JSON patches, merge with persisted/default settings, validate
  values, and return the complete settings object.
- Add the Tauri dialog plugin for pathless Open Folder.
- Normalize Git and session payloads at the adapter boundary.
- Implement session switch/rename/delete, Git checkout, extension registry
  loading, image forwarding, and bundled-Pi extension commands.

### 5. Pi provider/model discovery

- On macOS/Linux, import a strict whitelist of provider credential environment
  variables from the user's login shell when the GUI process lacks them. Keys
  are passed only to the Pi child process and never to the renderer.
- Read Pi's existing `~/.pi/agent/auth.json` only for provider metadata.
- Implement provider listing and API-key storage with mode `0600`, preserving
  existing OAuth credentials and unrelated provider entries.
- Restart the sidecar after credential changes and restore the active session
  when possible so Pi refreshes its available-model snapshot.
- Ensure DeepSeek and OpenAI models are grouped by provider without UI filtering.

## Validation contract

The repair is complete only when:

1. TypeScript typecheck and Vitest pass.
2. Rust formatting, Clippy/check, and all Rust tests pass.
3. A local production `.app` launches and visible controls produce real invokes
   or state changes; language switching rerenders immediately.
4. Direct Pi RPC and bundled Pi report the configured DeepSeek provider/models
   as well as OpenAI where credentials exist.
5. The generated DMG opens with the branded background and drag-to-Applications
   layout.
6. The ad-hoc release candidate and final DMG pass deep/strict `codesign` plus
   nested Mach-O validation. Developer ID mode additionally requires `spctl`
   and `stapler validate` before upload.
7. Versions are unified at `1.1.1`, CI passes, tag `v1.1.1` is created, and the
   published release artifacts/checksums are verified.

## Future production distribution

Ordinary-user distribution without manual Gatekeeper approval still requires
Apple Developer Program membership, a Developer ID Application certificate,
hardened runtime signing, notarization, and stapling. That work is intentionally
separate from the verified ad-hoc GitHub/internal v1.1.1 release.
