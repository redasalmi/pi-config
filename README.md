# pi-config

My personal extensions, skills, and themes for [Pi](https://pi.dev).

## Contents

- `extensions/` — custom tools and integrations.
- `skills/` — reusable workflows and reference material.
- `themes/` — terminal UI themes.
- `agent/WORKING_AGREEMENT.md` — shared instructions and working conventions,
  installed globally through a symlink (see
  [Optional: shared agent instructions](#optional-shared-agent-instructions)).

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

`npm run check` needs no network access or native notifications.

Run an individual suite with `npm run test:presets`, `test:review`, or
`test:workflow`.

## Presets

The [Presets extension](extensions/presets/README.md) owns `/preset`, `--preset`,
and Ctrl+Shift+U for model/thinking/tools/instructions presets. Selecting a preset
remembers it as the startup default for new sessions. Existing definitions and
session records remain compatible. Use `/preset status` for configuration
sources. Run `npm run test:presets`.

## Multi-role workflow

The [Workflow extension](extensions/workflow/README.md) adds `/flow` for an
architect → builder → optional reviewer workflow with bounded review corrections. `/workflow-models` assigns
any available Pi model to each role and saves the review policy. It uses isolated
model-visible phase contexts while retaining existing Pi tools and permission
hooks. Run `npm run test:workflow`.

## Code review

The [Code review extension](extensions/review/README.md) adds `/review`, a scope
picker over the [code-review skill](skills/code-review/SKILL.md). Choose a base
branch, uncommitted changes, a single commit, or custom instructions; the skill's
procedure is injected into the current thread with the active model. Reviews are
read-only and refuse to start while the agent is busy. Run `npm run test:review`.

## Optional: shared agent instructions

`agent/WORKING_AGREEMENT.md` is not installed as a package resource. To use it
globally, first back up any existing `~/.pi/agent/AGENTS.md`, then create a
symlink:

```bash
ln -s ~/Dev/pi-config/agent/WORKING_AGREEMENT.md ~/.pi/agent/AGENTS.md
```

The file keeps a non-magic name on purpose. Pi loads any `AGENTS.md` or
`CLAUDE.md` found in the working directory and its parents, and deduplicates
context files by path, so a symlinked `AGENTS.md` in this checkout would be
injected twice while working here.

### Uninstall

```bash
pi remove ~/Dev/pi-config
```

This unregisters the package without deleting the checkout. If you created the
optional `~/.pi/agent/AGENTS.md` symlink, remove it separately and restore your
backup.
