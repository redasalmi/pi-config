# Presets extension

Provider-independent session presets for model selection, thinking levels, tool
sets, and trusted instructions. This extension owns `/preset`, `--preset`, and
Ctrl+Shift+U. It works without the Codex extension; service-tier presets require
Codex's optional integration.

## Commands

| Command                                         | Behavior                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `/preset NAME`                                  | Apply a preset and remember it as the startup default.                                            |
| `/preset`                                       | Choose a session preset. Ctrl+Shift+U cycles presets and none.                                    |
| `/preset none`                                  | Restore the saved pre-preset configuration, clear the selection, and disable the startup default. |
| `/preset default NAME` / `/preset default none` | Save/clear the startup default without changing this session.                                     |
| `/preset status`                                | Show configuration sources, current values, and baseline availability.                            |
| `pi --preset NAME` / `pi --preset none`         | Override selection at process startup, not on reload.                                             |

Dialogs and notifications work in TUI and compatible RPC clients. Named flags
also work in print/JSON mode; informational output does not pollute protocol stdout.

## Configuration

Definitions come from these layers, in increasing precedence:

1. Built-in `astra`, `quick`, `work`, `deep`, and `deepseek-flash` presets (the existing defaults).
   `deepseek-flash` uses `opencode-go` / `deepseek-flash` (DeepSeek V4.1 Flash) at high reasoning.
2. `presets.json` in Pi's agent directory.
3. `<cwd>/.pi/presets.json`, only when Pi trusts the project.

A same-named definition replaces the whole earlier preset, not individual fields.
The agent directory respects `PI_CODING_AGENT_DIR`; rebranded distributions use
Pi's configured directory name instead of `.pi`.

Example `presets.json` (use a model available to your account):

```json
{
  "focused": {
    "provider": "openai-codex",
    "model": "gpt-5.6-luna",
    "thinkingLevel": "high",
    "tools": ["read", "bash", "edit", "write"],
    "instructions": "Keep changes focused and report verification evidence.",
    "description": "Focused implementation"
  }
}
```

`provider` and `model` must appear together. Omitted fields keep their current
values. `tools: []` intentionally disables all tools. Unknown tools or unsupported
explicit service tiers reject the entire preset before model/thinking/tools change.
Presets do not grant permission to bypass planning guards or repository policies.

## Defaults and session compatibility

Explicit CLI selection wins at startup and is not saved. Otherwise a saved
session selection (including explicit none) wins over the global default.
Selecting a preset during a session (`/preset NAME`, `/preset none`, or
Ctrl+Shift+U) also updates the global default, so the next new session reuses it.
`/preset default ...` sets the default without changing the current session.

New default selections are saved in `presets-state.json` in Pi's agent directory:

```json
{ "preset": "focused" }
```

Missing or malformed state disables the startup default rather than falling back to
another source. Applying a preset or using `/preset default ...` writes only the
new file; neither rewrites Codex settings. An explicit `null` disables the
default.
Existing `presets.json` definitions and `preset-state` session records need no
migration, and existing sessions are not rewritten during this extraction.

Session baselines store model identifiers, thinking levels, tool names, and optional
tiers—not credentials, model objects, or instructions. Instructions remain in trusted
configuration files. Reload/resume restore instructions and tools without reapplying
model/thinking over Pi's restored manual overrides. Tree navigation restores
branch-local state; Pi owns model/thinking navigation.

Missing definitions/tools retain the unresolved record and original baseline.
Restore the missing configuration, apply a valid preset, or use `/preset none`
when the baseline is available. Name-only legacy records have no recoverable
baseline: clearing them retains current model/tools and explains the limitation.
Unknown baseline tools or unavailable models are reported rather than silently dropped.

## Optional Codex integration

With both extensions enabled, Codex's existing `preset` footer field and `/status`
reflect the selection. Codex continues to own `/tier`, tier validation, provider
request routing, and tier persistence. Either extension can load first.

A preset may specify `serviceTier` as an advertised ID or display name; `null`
clears it. No model-family guesses or hardcoded Fast routing values are sent.
Without Codex, explicit non-null tiers are rejected and saved selections needing
a tier remain unresolved rather than silently losing their routing configuration.

The integration uses Pi's event bus (`presets:service-tier`, `presets:changed`,
`presets:persist`). Presets has no runtime imports from Codex and never registers
Codex commands, performs account requests, or modifies provider payloads.

## Verification

```bash
npm run test:presets
npm run test:codex
npm run typecheck
```

Tests use isolated agent directories and mocked Pi/provider boundaries, without
real credentials or network requests. They cover standalone use, both extension
load orders, defaults and session records, manual tiers, restoration,
validation, and command ownership.
