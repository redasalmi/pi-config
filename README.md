# pi-config

My personal extensions, skills, and themes for [Pi](https://pi.dev).

## Contents

- `extensions/` — custom tools and integrations.
- `skills/` — reusable workflows and reference material.
- `themes/` — terminal UI themes.
- `AGENTS.md` — shared instructions and working conventions.

## Installation

Requires the [Pi CLI](https://pi.dev). Clone this repository to `~/Dev/pi-config`
(or use your existing checkout).

If the same extensions, skills, or themes already exist in `~/.pi/agent/`,
back up the matching copies outside Pi's discovery directories before enabling
this checkout. Keep unrelated customizations in place. This avoids duplicate
loading.

Register the checkout as a local Pi package:

```bash
pi install ~/Dev/pi-config
```

`package.json` declares the `extensions/`, `skills/`, and `themes/` resources.
The command records the local path in `~/.pi/agent/settings.json`; it does not
copy the files. Restart Pi after installation and use `pi config` to manage
which resources are enabled. Use `/reload` after subsequent source edits.

## Development

Requires Node.js 22.19.0 or newer and npm. Install the locked development
dependencies and type-check all extensions:

```bash
npm ci
npm run typecheck
```

Pi supplies the packages listed in `peerDependencies` at runtime. Pinned
`devDependencies` provide their types locally, without depending on a global
Pi installation or machine-specific paths. No compilation step is needed.

The Browser extension separately requires `playwright-cli` (`@playwright/cli`),
`chrome-devtools` (`chrome-devtools-mcp`), and `lighthouse` (`lighthouse`) on
`PATH` for the corresponding backends. These external CLIs are not installed by
this package.

## Optional: shared agent instructions

`AGENTS.md` is not installed as a package resource. To use it globally, first
back up any existing `~/.pi/agent/AGENTS.md`, then create a symlink:

```bash
ln -s ~/Dev/pi-config/AGENTS.md ~/.pi/agent/AGENTS.md
```

### Uninstall

```bash
pi remove ~/Dev/pi-config
```

This unregisters the package without deleting the checkout. If you created the
optional `AGENTS.md` symlink, remove it separately and restore your backup.
