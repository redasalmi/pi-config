---
name: browser
description: Coordinates Playwright, Chrome DevTools, and Lighthouse for browser automation, runtime debugging, performance investigation, audits, and current-runtime evidence. Use when a browser task needs backend selection, a safe handoff, or Browser artifact management.
---

# Browser coordination

Use the official backend skill discovered for its matching CLI:

- **Playwright** owns interaction, workflows, locators, and accessibility snapshots.
- **Chrome DevTools CLI** owns console, network, DOM/runtime, memory, and performance-trace inspection.
- **Lighthouse** owns repeatable scored audits, medians, device comparisons, thresholds, and report regressions.

Call `browser` with `action: "prepare"` and the relevant backend before calling that backend tool. Do not activate or run all three for a generic browser request.

Browser manages one fresh runtime for the currently loaded Pi session. Backend session identities are internal, state is not restored, and only current-runtime artifacts are listed, reported, closed, or cleared. `browser clear` runs immediately and deletes only the reported current runtime root.

Artifacts, full output, reports, profiles, and traces belong below the reported root (`~/.pi/artifacts/browser/<project>/<pi-session>/<runtime>/`). Pass repository files as inputs where supported, but never pass repository paths as output destinations. Refresh Playwright snapshots or Chrome page lists after page-changing actions and handoffs.

URL/artifact-only handoff is the default. Shared CDP requires a credential-free local HTTP(S)/WS(S) endpoint passed to `browser prepare` or `browser handoff`; backend tools do not accept alternate endpoints. Preparing without one disables shared mode. Never transfer cookies, storage state, headers, or secrets between backends.

Use `browser report` after collecting evidence when the user needs a combined Markdown, JSON, or HTML summary with backend and artifact provenance.
