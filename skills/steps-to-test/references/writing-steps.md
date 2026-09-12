# Write Executable Steps

Use for Draft and Revise; for Audit consult only when assessing the requested/default document format.

## Bug-fix workflow

For a bug fix, recreate the original **trigger conditions and action sequence** on the fixed build; do not require the failure itself to occur there.

The first workflow should establish:

- the exact state and data that previously triggered the issue;
- the original action sequence;
- the corrected objective result;
- the former symptom that must be absent when that is not already obvious;
- one nearby workflow that should remain unchanged when the risk justifies it.

If a separate baseline environment is known and safe, an optional baseline workflow may demonstrate the old failure. Never require QA to check out branches or run developer commands.

Do not turn missing automated regression coverage into a tester instruction. Mention it only in separate developer-facing analysis when explicitly requested; merge-readiness test coverage belongs to code review.

## Technical verification

Default to ordinary product behavior. Add a separate technical-verification workflow only when an accepted criterion cannot be validated reliably from the visible UI and the intended tester has legitimate access to the required tool.

When needed:

- identify whether QA, a developer, or another role performs it;
- name the exact browser panel, API client, observability screen, or approved tool;
- state the filter, record, request, event, or property to inspect;
- state the trigger action and objective expected value;
- avoid credentials, tokens, private headers, customer data, and signed URLs;
- do not require source-code reading, Git, or shell commands unless the user explicitly requested developer-facing verification and those commands are established by project documentation.

If no legitimate observable check exists, place the behavior under **Technical coverage gaps**. For a refactor, infrastructure change, background job without an exposed status, or telemetry-only change with no authorized observation surface, say that no executable manual workflow is available. Do not fabricate a UI path, event, request, log entry, or metric.

## Write for the tester

- Use exact visible page, menu, field, and button labels when known.
- Start from a location the tester can reach; use a direct safe URL when established.
- State shared build, environment, role, data, and flag prerequisites before the workflows or inline when unique to one test.
- Write in execution order with concise imperative language: `navigate to`, `select`, `enter`, `add`, `remove`, `refresh`, and `check that`.
- Put every action and check in a Markdown bullet beginning with `- `.
- Keep one meaningful action per bullet, allowing a tightly coupled sequence when splitting it would reduce clarity.
- Use `check that ...` for objective, observable pass conditions at meaningful checkpoints; do not force a check after every click.
- Keep each bullet on one logical source line, with no blank lines between consecutive bullets and no manual hard wrapping.
- Define safe concrete values only when supported. Otherwise describe the required kind of test record.
- Make workflows independent where practical. Include reset or cleanup instructions when they mutate shared data or configuration.
- Distinguish product failure from missing setup, unavailable data, or an undeployed build when that distinction affects triage.
- Keep screenshots and recordings supplemental; the written instructions must remain executable without them.
- Avoid implementation vocabulary, source paths, selectors, database terminology, internal IDs, logs, and DevTools in ordinary UI workflows.
- Never write `works correctly`, `behaves as expected`, `looks good`, or `verify the fix`. State what appears, changes, persists, is sent, is blocked, or does not occur.
- Never mark a workflow passed. The document defines future testing; it does not claim execution.

## Output contracts

### Draft or Revise

Return clean, paste-safe Markdown without a preamble unless the user asks for analysis. Preserve a supplied team format when it remains clear and executable; otherwise use the default below.

```markdown
## Steps to test

### Test setup:

- use [confirmed build, environment, role, and shared data only when needed]

### Short scenario name test:

- navigate to [known starting location]
- perform the next meaningful action
- check that [specific visible result appears, changes, persists, is blocked, or is absent]

### Cleanup:

- restore [shared state only when needed]

## Notes:

- [confirmed constraint or out-of-scope behavior only when useful]

## Technical coverage gaps:

- [accepted behavior that cannot be proven through the available manual workflow]

## Open questions:

- [missing information or conflict that affects execution or pass/fail]
```

Omit empty sections. `Test setup` and `Cleanup` are not workflows; every actual workflow must have a level-three heading ending in `test:`. Normally produce one to six focused workflows. Use more only when different roles, environments, states, platforms, or action sequences genuinely require them.

Match the user's concise narrative tone. Prefer lowercase instruction openings when no house style is supplied. Do not use tables, checkboxes, test-case IDs, severity labels, or `Action`/`Expected` pairs unless explicitly requested.

Replace every illustrative bracketed value before returning the final document. For unknowns, use explicit `Not provided — ...` wording and repeat the material unresolved item under **Open questions**.

Do not append branch SHAs, file paths, or diff analysis to the paste-ready QA content by default. When developer traceability is requested, add a separate block after a horizontal rule:

```markdown
---

## Draft basis

- **Scope:** committed branch / provisional working tree / requirements only
- **Compared:** <base>@<sha> to <head>@<sha>
- **Evidence gaps:** <only material gaps>
```
