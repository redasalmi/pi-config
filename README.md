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

Lint and format the repository with the [oxc toolchain](https://oxc.rs)
(`oxlint` and `oxfmt`):

```bash
npm run lint          # oxlint
npm run format        # oxfmt --write
npm run format:check  # verify formatting without writing
```

Run type-checking, linting, formatting verification, and every isolated test
suite, stopping on the first failure:

```bash
npm run check
```

`npm run check` needs no network access or native notifications. The Browser
smoke tests are opt-in because they require `playwright-cli`, `chrome-devtools`,
and Chrome to be installed:

```bash
npm run check:smoke
```

Run an individual suite with `npm run test:browser`, `test:codex`,
`test:presets`, `test:opencode`, `test:web-access`, or `test:notify`.

The Browser extension separately requires `playwright-cli` (`@playwright/cli`),
`chrome-devtools` (`chrome-devtools-mcp`), and `lighthouse` (`lighthouse`) on
`PATH` for the corresponding backends. These external CLIs are not installed by
this package.

## Presets

The [Presets extension](extensions/presets/README.md) owns `/preset`, `--preset`,
and Ctrl+Shift+U for model/thinking/tools/instructions presets. Selecting a preset
remembers it as the startup default for new sessions. It works
independently of Codex; enabling both preserves service-tier and statusline
integration. Existing definitions and session records remain compatible.
Use `/preset status` for configuration sources. Run `npm run test:presets`.

## Codex workflow

The [Codex extension](extensions/codex/README.md) adds service tiers, quota
reporting, planning/checklists, and local diff/review commands.
Use `/status` for current state; preset selection belongs to Presets.
Run its isolated regression tests with `npm run test:codex`.

## OpenCode Go

The [OpenCode extension](extensions/opencode/README.md) adds remaining-quota
reporting, reset times, low-quota warnings, branch-local usage statistics, and a
configurable Go footer. It reuses Pi's Go provider and authentication; model
selection stays with Pi. Start with `/opencode status` or `/opencode usage`.
Run its isolated regression tests with `npm run test:opencode`.

## Notifications

The Notify extension sends terminal notifications when an interactive run fully
settles. Notifications include the session name, or the project folder name when
unnamed. It supports iTerm2, Ghostty, WezTerm, rxvt-unicode, Kitty, and Windows
Terminal (using PowerShell for Windows toasts).

Notifications for blocking extension UI prompts are enabled by default. Prompt
contents are not included in notifications. To disable them, set `notifyPrompts`
to `false` in `~/.pi/agent/notify.json` (or `notify.json` inside your
`PI_CODING_AGENT_DIR` override):

```json
{
  "notifyPrompts": false
}
```

Use `/reload` after editing the setting. Missing settings default to `true`;
invalid settings also fall back to `true` with a UI warning.

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
