# OpenCode Go companion

A lightweight Pi extension for Go subscription limits, quota warnings, and local
usage statistics. It reuses Pi's `opencode-go` provider and authentication: no
OpenCode CLI, SDK, additional dependency, browser scraping, or second model picker.
This extension is not built by or affiliated with the OpenCode team.

## Commands

| Command                                        | Behavior                                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `/opencode` / `/opencode status`               | Refresh subscription limits and show connection/configuration diagnostics.                                                      |
| `/opencode usage`                              | Refresh all three subscription windows, remaining/used percentages, reset times, and the most constrained or exhausted windows. |
| `/opencode warnings on\|off`                   | Enable/disable quota warnings globally. With no argument, show the setting.                                                     |
| `/opencode stats`                              | Show local Go assistant tokens, cache usage, and recorded estimated costs on the current session branch. No account request.    |
| `/opencode console`                            | Display the official console sign-in link. Does not open a browser or change billing settings.                                  |
| `/opencode statusline`                         | Show footer configuration and available fields.                                                                                 |
| `/opencode statusline set\|add\|remove FIELDS` | Configure ordered, comma-separated footer fields globally. An empty `set` hides the footer.                                     |
| `/opencode statusline reset`                   | Restore the compact quota-only footer.                                                                                          |

Use Pi's existing model selection commands for models and `/login` for OpenCode
Go authentication. Pi can also resolve `OPENCODE_API_KEY`. Pi 0.85.1 includes native
OpenCode session-identification headers; keep Pi current rather than spoofing
OpenCode CLI headers. The extension neither replaces the provider nor modifies
inference requests.

Example footer (illustrative, not actual account data):

```text
Go · 5h 72% left · week 48% left · month 81% left
```

Available fields: `usage,resets,model,thinking,context,freshness`. The footer is a
separate Pi extension status, not a replacement for Pi's native footer. It is
hidden for Zen (`opencode`), other providers, and when no model is selected.
Commands can explicitly inspect Go even when another provider is selected.

## Subscription semantics

Limits come from `GET https://opencode.ai/zen/go/v1/usage`, using Pi's resolved Go
API key. The key must belong to the subscribed workspace member. The upstream
response has `usage.rolling`, `usage.weekly`, and `usage.monthly`, each containing
`status`, `percent` **used**, and an ISO `resetsAt` timestamp. The extension displays
`100 - percent` **remaining**, preserving upstream rounding and status.

These are shared subscription counters across Go models and clients, not Pi
session totals or separate allowances for each model. Model-specific cost
multipliers affect quota consumption. Switching models does not refill quota.
The server's reset timestamps are authoritative; an expired cached observation is
marked stale, never locally reset to 100% remaining.

The endpoint does **not** expose wallet balance, exact remaining dollars/tokens/
requests, invoice/renewal dates, reset credits, per-model history, or whether
console **Use balance** is enabled. When that setting is enabled, inference may
spend Zen credits after Go quota is exhausted. Warnings are **not a spending cap**.
No setting, model, billing preference, or subscription is changed by monitoring.

Upstream contract inspected at OpenCode commit
[`b3f1a96`](https://github.com/anomalyco/opencode/blob/b3f1a96c6dd7adeb28b36dd11add1998fc84d67b/packages/console/app/src/routes/zen/go/v1/usage.ts).
This is a best-effort integration; live endpoint behavior can change.

## Refreshing, safety, and persistence

- Automatic account reads run only with a UI and Go selected, when warnings or an
  account footer field (`usage`, `resets`, `freshness`) are enabled.
- Startup, model selection, settled agent runs, and an idle 30-second timer
  schedule refreshes, throttled to once per minute. Requests are single-flight.
- `/opencode usage` and `/opencode status` explicitly bypass that throttle, but
  join an already-running request. Cached data is shown before refreshing.
- A 10-second deadline bounds waiting for auth, HTTP, and response parsing.
  Responses are limited to 16 KiB; redirects are disabled. Requests use a fixed
  official URL and never forward arbitrary provider headers. Custom Go endpoint
  overrides are rejected rather than forwarding their credentials.
- Failed refreshes preserve same-account observations as stale, except auth or
  entitlement failures, which clear them. Credential changes clear old account
  data and warning history. Observations also become stale after 15 minutes or
  when a reset timestamp passes. Endpoint 429s defer automatic refresh according
  to `Retry-After`; a monitoring 429 is not treated as proof of quota exhaustion.
- Switching models preserves the minute throttle, server backoff, cached quota,
  and same-account warning history. Leaving Go cancels pending reads and hides
  the footer; returning to Go resumes reads when eligible.
- Warnings fire once at 30% and 10% remaining per window, rearming after a refill.
  Shutdown, reload, and session replacement cancel pending work and remove timers.
- Only preferences are saved, in `opencode.json` under Pi's agent directory
  (respecting `PI_CODING_AGENT_DIR`). Credentials, quota snapshots, and account
  identifiers are never persisted or injected into model context. Network/auth
  error bodies are not logged or displayed.

Defaults:

```json
{
  "warnings": true,
  "statusline": ["usage"]
}
```

Disable warnings **and** remove all account fields to stop automatic account
requests. Explicit usage/status commands still refresh. Malformed settings fall
back to defaults with a UI warning; saving refuses to overwrite a malformed file.
Changes in another Pi process take effect after `/reload`.

## Local statistics and UI modes

`/opencode stats` totals stored Go assistant usage on the active branch, including
messages before compaction and reported partial usage from failed/aborted replies.
It does not double-count retained compaction tails. Other branches/sessions,
summary-generation usage, and unattributed tool/subagent usage are excluded.
Cache share is `cacheRead / (input + cacheRead + cacheWrite)`. Recorded costs are
catalog estimates, not invoices or model-multiplier-adjusted subscription usage;
missing data is labelled incomplete. Statistics are calculated on demand, not on
every token event.

Commands and statuses use Pi's TUI/RPC UI helpers. No inference request, new tool,
or model-context message is created. In print/JSON mode there is no automatic
account polling; informational commands report their UI requirement to stderr
without writing protocol-corrupting output to stdout.

## Verification

```bash
npm run test:opencode
npm run typecheck
```

Tests use mocked network/auth/UI boundaries and isolated temporary agent
directories, never real credentials or paid inference. Coverage includes schema
validation, errors, caching, cancellation, deadlines, warnings, lifecycle cleanup,
footer configuration, RPC/noninteractive modes, and branch-local statistics.
Authenticated account behavior and real terminal presentation require a separate
manual check. Do not paste API keys into chat or logs.
