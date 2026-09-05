---
name: browser
description: Coordinates Playwright, Chrome DevTools, and Lighthouse for browser automation, runtime debugging, performance investigation, audits, and current-runtime evidence. Use when a browser task needs backend selection, a safe handoff, or Browser artifact management.
---

# Browser coordination

Use the official backend skill discovered for its matching CLI:

- **Playwright** owns interaction, workflows, locators, and accessibility snapshots.
- **Chrome DevTools CLI** owns console, network, DOM/runtime, memory, and performance-trace inspection.
- **Lighthouse** owns repeatable scored audits, medians, device comparisons, thresholds, and report regressions.

Call `browser` with `action: "prepare"` and the relevant backend before calling that backend tool. Prepare once per backend/connection mode, not before every action. Do not activate or run all three for a generic browser request.

Browser manages one fresh runtime for the currently loaded Pi session. Backend session identities are internal, state is not restored, and only current-runtime artifacts are listed, reported, closed, or cleared. `browser clear` runs immediately and deletes only the reported current runtime root.

Artifacts, full output, reports, profiles, and traces belong below the reported root (`~/.pi/artifacts/browser/<project>/<pi-session>/<runtime>/`). Pass repository files as inputs where supported, but never pass repository paths as output destinations. Reuse fresh Playwright snapshots returned by actions; request another only when absent, stale, or a different scope/depth is needed. Use `find` or scoped/depth-limited snapshots instead of repeatedly loading large trees. Refresh Chrome page lists when page identities may have changed, including handoffs.

URL/artifact-only handoff is the default. Shared CDP requires a credential-free local HTTP(S)/WS(S) endpoint passed to `browser prepare` or `browser handoff`; backend tools do not accept alternate endpoints. Preparing without one disables shared mode. Never transfer cookies, storage state, headers, or secrets between backends.

## Fast, trustworthy workflows

- For a known Playwright workflow, batch related actions and checks into one `run_code` call using stable role/test-ID locators. Keep ref-based exploration stepwise when the next action depends on the returned snapshot.
- Wait for observable conditions (a visible result, a URL, or a specific response), not fixed sleeps or blanket network-idle waits. Throw when a check fails; do not catch failures and return a success-shaped result. A successful command alone is not proof that a user workflow passed.
- Reuse the runtime/browser process, but isolate independent test cases with fresh browser contexts and deterministic fixture state. Do not run concurrent mutations against the same page or shared CDP browser.
- During Lighthouse iteration, request only the relevant categories with one run. Use repeated sequential runs for final performance conclusions; never parallelize performance audits on the same machine to save time. Keep device, throttling, Lighthouse version, and cache conditions comparable. Re-auditing gathered artifacts can save computation, but is not a fresh performance measurement.

Use `browser report` after collecting evidence when the user needs a combined Markdown, JSON, or HTML summary with backend and artifact provenance.
