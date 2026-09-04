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

Pi discovers `extensions/`, `skills/`, and `themes/` without a package manifest.
The command records the local path in `~/.pi/agent/settings.json`; it does not
copy the files. Restart Pi after installation and use `pi config` to manage
which resources are enabled. Use `/reload` after subsequent source edits.

### Optional: shared agent instructions

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
