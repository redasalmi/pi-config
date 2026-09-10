# Codex workflow extension

A small Pi workflow layer inspired by Codex CLI: service tiers, account limits,
and quota reporting. It reuses Pi's models, authentication, sessions, and provider
transport. No Codex CLI installation or additional dependency is required.

## Commands

All Codex features live behind the single `/codex` command; the subcommand selects
behavior and any parameters follow it.

| Command                                          | Behavior                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `/codex` / `/codex status`                       | Show local/cached information immediately, then refresh limits and Git concurrently. |
| `/codex status tokens`                           | Also load account token activity, cached for five minutes.                           |
| `/codex usage limits`                            | Refresh and show detailed account limits, reset times, and saved reset count.        |
| `/codex usage daily\|weekly\|cumulative`         | Show account-wide token activity, not just this Pi session.                          |
| `/codex usage reset`                             | Choose and explicitly confirm consumption of a saved usage reset.                    |
| `/codex usage warnings on\|off`                  | Enable/disable quota warnings globally.                                              |
| `/codex statusline set\|add\|remove ITEMS`       | Configure ordered, comma-separated footer fields.                                    |
| `/codex statusline reset`                        | Use the compact preset/tier/quota/credits footer.                                    |
| `/codex tier NAME` / `/codex tier off`           | Set/clear the session's model-advertised service tier.                               |
| `/codex tier save NAME` / `/codex tier save off` | Save/clear the startup tier without changing this session.                           |
| `/codex tier`                                    | Refresh tier metadata and list the active model's supported tiers.                   |

Dialogs and informational output work in the TUI and compatible RPC clients.
Informational slash-command output is not written to non-interactive stdout,
to avoid corrupting Pi's protocol.

## Presets and service-tier persistence

`/preset`, `--preset`, Ctrl+Shift+U, preset definitions, and baseline restoration
now belong to the standalone [Presets extension](../presets/README.md). Enable
that extension to retain those commands. Codex alone does not apply preset defaults
or change models/tools from saved presets.

With both enabled, Codex's `preset` footer field and `/codex status` reflect Presets'
selection through Pi's event bus. Presets can use Codex's optional service-tier
integration; validation and provider request routing remain owned by Codex.

Codex settings remain in `codex.json` in Pi's agent directory. `/codex tier NAME`
changes only the session; `/codex tier save NAME` changes only the startup default.
Manual session tiers persist as `codex-service-tier` records and follow tree
navigation, even without Presets. Existing tiers in `preset-state` records remain
readable; the newest applicable tier record on the active branch wins.

Preset selection defaults live in `presets-state.json` and are owned by the
Presets extension. Codex ignores any `preset` field in `codex.json`; no
automatic configuration rewrite or session migration is needed.

## Usage and performance

The compact footer prioritizes information not already in Pi's native footer.
It is shown only for models from the `openai` and `openai-codex` providers and
hides automatically when another provider (or no model) is selected.
Quota percentages are **remaining**, not used. Available fields:
`preset,model,thinking,fast,service-tier,context,usage,credits,git`.
Ordering is respected, including `usage` and reset credits. Saved footer layouts
are retained; `/codex statusline reset` opts into the compact default.

Tier catalogs are loaded asynchronously at startup, model selection, and `/codex tier`.
Normalized positive/negative lookups are cached, so rendering and request hooks
do no filesystem I/O. Optional tier metadata is read from the current model,
`models-store.json`, and `models.json`; explicit catalog overrides take precedence
when the model itself lacks that metadata. Missing metadata means unsupported.
Use `/codex tier` or `/reload` after changing catalog files without changing models.

Full account reads are single-flight and throttled to once per minute unless
explicitly requested. Header updates do not postpone full account reads. An idle
30-second lifecycle timer updates freshness and schedules eligible refreshes; it
is removed at shutdown. Disable quota warnings and remove `usage`/`credits` from
the footer to stop automatic account refreshes. Git runs only when requested or
when its footer field is enabled, not on every startup by default.

Observations older than 15 minutes are marked stale; a failed full-account refresh
remains visible even when partial response headers arrive. Relative reset durations
are anchored to observation time. Warnings fire once at the 30% and 10% remaining
thresholds per window. No reset is redeemed and no preset/model is changed by a
warning. Header-less transports retain the account-endpoint fallback.

Account token activity has its own five-minute cache and cancellation scope.
Reset redemptions require a selection and confirmation; an explicitly confirmed
retry reuses the same idempotency key and validates the business outcome again.
Account endpoints are best-effort integrations and can change upstream.

## Verification

```bash
npm run test:codex
npm run typecheck
```

Tests use Node's built-in test runner, mocked provider/UI boundaries, and isolated
agent directories. They do not access real
credentials, contact account endpoints, create commits, or mutate the source
working tree. Live account and terminal behavior still require manual verification.
