# Extension marketplace

Lattice ships a VS Code-style extension marketplace layered on **Pi's package
system**. There is no mandatory central server: the first version uses a
**registry protocol** (a JSON manifest served from any URL or local path), and
installs delegate to Pi's own package manager.

## What can be installed

A "package" is a **Pi package** — it can bundle any of:

| Kind      | What it provides                                   |
|-----------|----------------------------------------------------|
| Extension | TypeScript modules (tools, commands, event hooks)  |
| Skill     | `SKILL.md` capability packages (Agents Skills spec)|
| Theme     | JSON themes                                        |
| Prompt    | Reusable `/name` prompt templates                  |

Provider/tool/agent-capability kinds are reserved for a future version.

## Sources

Identical to Pi's package sources:

- `npm:pkg` / `npm:@scope/pkg@1.2.3` — npm (version pinned when specified)
- `git:github.com/user/repo@v1` / `https://github.com/user/repo@v1` — git (ref pinned)
- `/absolute/path` / `./relative/path` — local directory

Install scope: user (`~/.pi/agent/`) or project (`.pi/`), managed through
`~/.pi/agent/settings.json` / `.pi/settings.json` — the same files Pi uses, so
Lattice and the Pi CLI never have conflicting extension config.

## Registry protocol (v1)

A registry is a JSON document — either a bare array or `{ "packages": [...] }`:

```json
{
  "packages": [
    {
      "id": "pi-tools",
      "name": "pi-tools",
      "displayName": "Pi Tools",
      "version": "1.0.0",
      "author": "someone",
      "description": "Extra coding tools",
      "kinds": ["extension"],
      "source": "npm:@scope/pi-tools",
      "permissions": { "files": true, "network": false, "shell": true, "workspace": true }
    }
  ]
}
```

Set the registry URL/path in the Extensions view to browse it. Future versions
add signed manifests and a hosted registry.

## Security model

Pi packages run with **full user permissions** — an extension executes arbitrary
code, and a skill can instruct the model to run anything. Lattice therefore:

1. Shows the package's declared permissions before install.
2. Requires the source to be reviewed (trust), mirroring Pi's own guidance.
3. Runs project-local packages only after the project is trusted (Pi's trust flow).
4. Enforces its own tool-approval gate at runtime (see ARCHITECTURE.md §7), which
   is independent of extension permissions.

The permission manifest is advisory today (Pi executes extensions unboxed); a
hardened sandbox (Docker / Gondolin) is the documented next step.

## API surface

Main-process `ExtensionRegistry` (`src/main/extensions.ts`) wraps Pi's
`DefaultPackageManager`:

- `listInstalled(cwd, settingsManager)` → installed packages
- `install(cwd, settingsManager, source)` → `installAndPersist`
- `uninstall(cwd, settingsManager, source)` → `removeAndPersist`
- `setEnabled(cwd, settingsManager, source, enabled)` → add/remove source in settings
- `loadRegistry(urlOrPath)` → parse a registry manifest
