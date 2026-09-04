# Manual Test Design Reference

Read this file only when the change has multiple roles or states, material side effects, asynchronous behavior, accessibility or localization implications, a technical-verification requirement, or existing Steps to Test that need a deeper audit.

## Evidence and test-oracle boundaries

An executable manual test needs a trustworthy basis for deciding pass or fail.

- Accepted requirements establish intended behavior.
- Confirmed product documentation can establish baseline behavior and supported constraints.
- Repository evidence can establish likely routes, labels, conditions, state changes, and regression surfaces.
- Existing tests can reveal scenarios and intended invariants, but do not prove execution or current correctness.
- Screenshots can establish visible composition and copy in the captured state, but not keyboard behavior, responsiveness, persistence, hidden states, or successful integration.
- Commit messages and branch names can suggest intent, but cannot establish requirements or pass conditions.
- A current implementation that conflicts with accepted requirements is evidence of a mismatch, not a new expected result.

When no trustworthy oracle exists, state the uncertainty instead of converting an implementation detail into a pass condition.

## Risk dimensions

Select only dimensions activated by the change.

### State and validation

Consider:

- empty, minimum, maximum, malformed, duplicate, stale, and partial input;
- required and optional values;
- dependent fields and mutually exclusive settings;
- cancellation, retry, undo, and recovery;
- valid input retained after an error;
- repeated submission or repeated action;
- persistence after refresh, navigation, sign-out, or revisit.

### Roles, permissions, and data boundaries

Consider:

- allowed and denied roles;
- ownership boundaries between users or organizations;
- hidden versus disabled controls;
- direct navigation to protected content;
- destructive, financial, privacy, and security-sensitive actions;
- audit or confirmation state visible to the user.

Do not invent an unauthorized test role or ask QA to access another user's real data.

### Asynchronous and integration behavior

Consider:

- loading and pending states;
- completion, failure, timeout, cancellation, and retry;
- duplicate callbacks, events, or requests;
- eventual consistency and refresh behavior;
- notifications, email, webhooks, exports, imports, or third-party services;
- offline or unavailable dependency behavior when supported.

Use a time limit only when requirements or product behavior establishes it. Otherwise say what completion signal to wait for rather than inventing seconds.

### Navigation, cache, and session

Consider:

- browser back and forward behavior;
- deep links and refresh;
- session expiry or sign-in transition;
- stale cached content;
- multiple tabs only when shared state or concurrency changed.

### Responsive, input, and accessibility

Include only relevant checks:

- narrow and wide composition around a changed breakpoint;
- keyboard reachability, visible focus, logical order, and escape behavior;
- no essential hover-only action;
- clear labels, required indicators, and errors that do not rely only on color;
- retained valid input and actionable recovery guidance;
- zoom, text growth, or long content when layout or typography changed;
- reduced motion when motion changed.

A focused manual check is not a complete accessibility audit. Never claim WCAG conformance from these steps.

### Locale, time, and content variation

Consider:

- longer translated labels and right-to-left layout;
- locale-specific dates, times, numbers, currency, and sorting;
- time-zone boundaries and daylight-saving behavior;
- empty, long, multiline, special-character, and Unicode content.

Only include these when the changed behavior processes or displays them.

## Safe setup and cleanup

Manual instructions should not create avoidable harm.

- Prefer a dedicated test environment and account.
- Use synthetic or approved test data rather than customer or employee personal data.
- Use test payment methods and non-deliverable or controlled email addresses when the project provides them.
- Make irreversible operations explicit and require the approved sandbox or disposable record.
- State feature flags, permissions, and configuration that must be enabled.
- Restore shared settings, records, carts, accounts, permissions, and flags after testing.
- If a workflow intentionally leaves durable data, name that consequence so the tester can coordinate cleanup.

A missing safe environment is an open question, not permission to test destructive behavior in production.

## Technical verification design

Use technical verification only when it proves an accepted criterion that ordinary UI observation cannot establish.

A usable technical step identifies:

1. **Performer** — QA, developer, analyst, or another authorized role.
2. **Tool and location** — for example, Browser DevTools → Network, Application, or Console; an approved API client; or a named observability dashboard.
3. **Starting state** — environment, account, consent, flags, and filters.
4. **Trigger** — the user action that should produce the technical effect.
5. **Object to inspect** — request, response, event, storage key, job, metric, or record.
6. **Objective result** — exact supported name, status, property, value, or absence.
7. **Cleanup** — reset storage, consent, data, or configuration when needed.

Do not ask the tester to infer correctness from a source file, selector, function, or generic “no console errors” check. A console check is useful only when the change has a concrete runtime-error risk or an accepted criterion names it.

Never expose or request bearer tokens, cookies, authorization headers, private API keys, signed URLs, or real personal data in the written steps.

## Workflow partitioning

Use a separate workflow when any of these changes the action sequence materially:

- role or permission;
- environment or platform;
- starting state;
- feature flag or configuration;
- primary outcome;
- technical versus ordinary UI verification;
- destructive versus non-destructive path.

Keep simple data variations in one workflow when the sequence and expected result remain the same. Do not create one test per acceptance-criterion sentence when related criteria form one coherent user journey.

## Audit anti-patterns

Flag these when they affect execution or confidence:

- no target build, environment, or reachable starting point;
- requirements restated without actions;
- actions without objective checks;
- `works correctly`, `looks good`, or `verify the fix` as the oracle;
- a check after every trivial click;
- unsupported values, labels, URLs, limits, or timing;
- implementation details written for nontechnical QA;
- one long workflow containing unrelated user goals;
- duplicated setup in every workflow when a shared prerequisite would be clearer;
- hidden role, flag, locale, device, or data dependency;
- destructive action without safe data or cleanup;
- generic browser, responsive, accessibility, or regression padding;
- an instruction to reproduce the old failure on the fixed build;
- a test marked passed without execution evidence;
- screenshots or videos used as a substitute for complete written instructions;
- technical verification that does not name the tool, trigger, object, and expected value.
