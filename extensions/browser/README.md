# Browser extension

This extension coordinates the official `playwright-cli`, `chrome-devtools`, and `lighthouse` CLIs for the currently running Pi session.

## Routing

- `playwright` — interaction, workflows, and accessibility snapshots.
- `chrome_devtools` — console, network, runtime, memory, and performance tracing.
- `lighthouse_cli` — scored audits, repeated runs, device comparisons, thresholds, and report comparisons.
- `browser` — backend preparation, URL/artifact handoffs, current-runtime status, reports, close, and cleanup.

Backend tools are registered but inactive at session start. Call `browser` with `action: "prepare"` before using one backend; preparation is not needed before every action.

## Runtime model

Each loaded extension instance creates a fresh runtime. Backend CLI identities are private implementation details: callers cannot select, list, restore, close-all, or kill-all backend sessions. Browser state is held in memory and is never restored from disk. Extension shutdown closes or detaches only the current runtime.

Browser-managed output is stored outside repositories at:

```text
~/.pi/artifacts/browser/<project>/<pi-session-id>/<runtime-id>/
```

Only the current runtime directory is listed, reported, closed, or cleared. Historical runtime directories are not restored or managed. The current workspace contains backend output directories, a sanitized artifact manifest, normalized in-memory evidence, and generated reports. Chrome DevTools uses a short-lived owner-only `/tmp/pi-browser-*` IPC directory because of its Unix socket path limit; this is not artifact storage.

Output paths are allocated centrally, checked for containment and symlink escapes, and recursively recorded for directory-producing commands. Artifact records include size, sanitized URL/title metadata, report IDs, and correlation IDs. SHA-256 is recorded for artifacts up to 64 MiB and omitted for larger files so heap snapshots, traces, and videos do not block tool completion on a second full-file read. Upstream package and browser caches are not Browser-managed.

Workspace creation and permission setup are initialized once per runtime. Containment and symlink checks still run at filesystem/CLI boundaries, and clearing a runtime invalidates initialization. Chrome DevTools caches the PID learned from its scoped daemon status and checks process liveness without launching a status CLI before each warm command. Stop, close, connection changes, and transport/process failures invalidate readiness. A failed command is never automatically replayed.

## Commands

```text
/browser status
/browser artifacts
/browser report [json|html] [artifact-id]
/browser close
/browser clear
```

Commands run immediately without approval prompts. `clear` first closes the current runtime and then deletes only its Browser-owned directory. A failed backend shutdown retains the directory and reports the failure.

## Handoffs and endpoint safety

URL/artifact-only handoff is the default. Shared CDP is enabled only by passing a credential-free loopback HTTP(S)/WS(S) endpoint to `browser prepare` or `browser handoff`. Preparing or handing off without an endpoint returns to URL/artifact-only mode. Backend tools cannot supply alternate remote endpoints directly.

URLs are sanitized before they enter tool output, manifests, evidence, or reports. Userinfo is removed and secret-like query values are redacted. The extension never copies cookies, storage, authorization headers, or secrets between backends.

## Reports

`browser report` produces Markdown, JSON, or HTML for the current runtime. Reports include normalized backend outcomes—Playwright workflow results, Chrome DevTools findings, Lighthouse scores/thresholds/comparisons—and link them to artifact IDs, report IDs, and correlation IDs. Raw or truncated output remains in managed artifacts rather than being duplicated into the combined report. Only the requested report format is rendered. Both Chrome Markdown and JSON error envelopes mark evidence as failed. Playwright Markdown and JSON snapshot paths are registered and read through the same containment checks. Lighthouse thresholds and comparisons use all finite numeric audit metrics; the compact summary keeps its Core Web Vitals/display shortlist.

## Fast workflows and tests

Reuse snapshots returned by Playwright actions instead of requesting duplicates. For large pages use `find`, `snapshot` with `target`, or `depth`. Batch known actions and observable checks with the existing `run_code` action, for example:

```js
async page => {
  await page.getByRole('textbox', {name: 'Search'}).fill('browser');
  await page.getByRole('button', {name: 'Search', exact: true}).click();
  await page.getByRole('heading', {name: 'Search results', exact: true}).waitFor();
  return {resultsVisible: true};
}
```

Use stable locators inside a batch and let failed checks throw. Avoid fixed sleeps, blanket network-idle waits, and retries that could duplicate a mutation. Reuse browser processes but isolate independent tests with fresh contexts/fixture state. Keep Lighthouse performance runs sequential; narrow categories and use one run while iterating, then repeated measurements for final conclusions.

```sh
# Fast contract tests: no browsers, network, or CLI subprocesses.
npm run test:browser

# Opt-in local browser integration tests; requires installed playwright-cli,
# chrome-devtools, and Chrome. No dependency/browser installation is performed.
npm run test:browser:smoke

npm run typecheck
```

Contract tests cover response formats, quality/regression thresholds, sequential medians, daemon reuse/invalidation, report formats, and artifact path safety after initialization. Smoke tests use disposable runtimes and loopback HTTP fixtures, reuse one browser per backend, and close only their own sessions. They verify navigation, snapshots, batched checks, error reporting, and screenshots. A failed shutdown retains its test directory for diagnosis. Lighthouse calculations are covered with fixtures; the smoke suite does not run scored performance audits.

## Skills

The extension discovers only the exact official `playwright-cli` and `chrome-devtools-cli` skills. It does not load the generic Chrome MCP skill or Lighthouse's contributor verification skill. Lighthouse audit guidance remains in this extension's local Browser skill and tool description.
