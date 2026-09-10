# Codex workflow extension

A small Pi workflow layer inspired by Codex CLI: service tiers, account limits,
planning/checklists, and local diff/review commands. It reuses Pi's
models, authentication, sessions, and provider transport. No Codex CLI installation
or additional dependency is required.

## Commands

| Command | Behavior |
| --- | --- |
| `/tier NAME` / `/tier off` | Set/clear the session's model-advertised service tier. |
| `/tier save NAME` / `/tier save off` | Save/clear the startup tier without changing this session. |
| `/tier` | Refresh tier metadata and list the active model's supported tiers. |
| `/status` | Show local/cached information immediately, then refresh limits and Git concurrently. |
| `/status tokens` | Also load account token activity, cached for five minutes. |
| `/usage limits` | Refresh and show detailed account limits, reset times, and saved reset count. |
| `/usage daily\|weekly\|cumulative` | Show account-wide token activity, not just this Pi session. |
| `/usage reset` | Choose and explicitly confirm consumption of a saved usage reset. |
| `/usage warnings on\|off` | Enable/disable quota warnings globally. |
| `/statusline set\|add\|remove ITEMS` | Configure ordered, comma-separated footer fields. |
| `/statusline reset` | Use the compact preset/tier/quota/credits footer. |
| `/plan on` / `/plan PROMPT` | Enter planning mode, optionally starting a planning request. |
| `/plan status` | Show the full checklist and planning state. |
| `/plan execute` | Confirm the proposed checklist and start implementation. |
| `/plan off` | Leave planning without starting a task; retain the checklist. |
| `/plan track` | Enable checklist tracking for ordinary work without starting a task. |
| `/plan clear` | Disable planning/tracking and clear the checklist. |
| `/diff [all\|staged\|unstaged\|untracked]` | Inspect local changes without an LLM request. |
| `/review base=REF [head=REF]` | Pin local commits and invoke the existing `code-review` skill. |
| `/review working` | Start a separately scoped, read-only working-tree review. |
| `/review` | Choose a review scope interactively. |

Dialogs and informational output work in the TUI and compatible RPC clients.
Informational slash-command output is not written to non-interactive stdout,
to avoid corrupting Pi's protocol.

## Presets and service-tier persistence

`/preset`, `--preset`, Ctrl+Shift+U, preset definitions, and baseline restoration
now belong to the standalone [Presets extension](../presets/README.md). Enable
that extension to retain those commands. Codex alone does not apply preset defaults
or change models/tools from saved presets.

With both enabled, Codex's `preset` footer field and `/status` reflect Presets'
selection through Pi's event bus. Presets can use Codex's optional service-tier
integration; validation and provider request routing remain owned by Codex.

Codex settings remain in `codex.json` in Pi's agent directory. `/tier NAME`
changes only the session; `/tier save NAME` changes only the startup default.
Manual session tiers persist as `codex-service-tier` records and follow tree
navigation, even without Presets. Existing tiers in `preset-state` records remain
readable; the newest applicable tier record on the active branch wins.

Preset selection defaults live in `presets-state.json` and are owned by the
Presets extension. Codex ignores any `preset` field in `codex.json`; no
automatic configuration rewrite or session migration is needed.

## Planning and review boundaries

Planning blocks agent calls to every tool except `read`, `grep`, `find`, `ls`,
`web_search`, `web_fetch`, and its own `update_plan` tool.
Shell, browser automation, and unknown/dynamically added tools are blocked even
if a preset enables them. Planning adds its own checklist tool when necessary;
it does not replace the rest of your active tool set.

**This is a tool-call guard, not an OS sandbox or a general permissions system.**
Manual `!` commands, extension commands, other extensions' direct side effects,
and the implementations of allowlisted tools are outside that boundary. Existing
repository instructions and separate approvals still apply. Planning does not
provide secret-file access controls.

The model can propose a structured checklist using `update_plan`: at most 20
single-line steps, with `pending`, `in_progress`, or `completed` status and at most
one in-progress step. In planning mode, all steps must remain pending. Checklists
are optional; no prose parsing, automatic task execution, or automatic model
switching occurs. The widget shows up to five unfinished steps; `/plan status`
shows all steps. State follows the active session branch and survives compaction,
reload, resume, and fork.

`/diff` shows tracked staged/unstaged content plus untracked names. Use
`/diff untracked` to explicitly choose an untracked file for preview; symlinks,
non-regular files, and files over 50 KiB are not opened by that preview. Ignored
files are excluded. Diff output is bounded to 50 KiB per section and marked when
truncated. External diff/textconv helpers and Git lazy fetching are disabled.
Diffs are displayed locally, not injected into model context. The working tree
can change while Git is reading it; this is a local viewer, not an atomic snapshot.

Committed reviews require your enabled `code-review` skill and Pi skill commands.
Refs are resolved once to commit IDs and checked for a merge base. If no base is
provided, the launcher uses local `origin/HEAD` or asks for one; it never assumes
`main` or fetches. Working-tree reviews use a separate prompt because the committed
review skill excludes that scope. Reviews start an LLM task, but do not themselves
edit files, commit, or fetch. Leave planning with `/plan off` first so the reviewer
can use Bash for read-only Git commands; the review request instructs it not to
mutate files or external services.

## Usage and performance

The compact footer prioritizes information not already in Pi's native footer.
It is shown only for models from the `openai` and `openai-codex` providers and
hides automatically when another provider (or no model) is selected.
Quota percentages are **remaining**, not used. Available fields:
`preset,model,thinking,fast,service-tier,context,usage,credits,git`.
Ordering is respected, including `usage` and reset credits. Saved footer layouts
are retained; `/statusline reset` opts into the compact default.

Tier catalogs are loaded asynchronously at startup, model selection, and `/tier`.
Normalized positive/negative lookups are cached, so rendering and request hooks
do no filesystem I/O. Optional tier metadata is read from the current model,
`models-store.json`, and `models.json`; explicit catalog overrides take precedence
when the model itself lacks that metadata. Missing metadata means unsupported.
Use `/tier` or `/reload` after changing catalog files without changing models.

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

Tests use Node's built-in test runner, mocked provider/UI boundaries, isolated
agent directories, and a disposable local Git clone. They do not access real
credentials, contact account endpoints, create commits, or mutate the source
working tree. Live account and terminal behavior still require manual verification.
