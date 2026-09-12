# Assess the Change

Use after resolving the scope and changed-path manifest. The goal is evidence-backed judgment, not a fixed command itinerary or an exhaustive generic checklist.

## Intent and coverage

Read only context that can change the judgment: relevant repository instructions, supplied PR/issue requirements, changed production code/tests, callers, types, schemas, persisted formats, dependencies, configuration, generated sources, and relevant full functions. Commit subjects are hints, not proof.

Establish internally what the change attempts and how. State a small assumption and continue when safe; ask only when competing interpretations materially change correctness or invalidate scope.

For large patches, classify every path, group human-authored work by subsystem/risk, and inspect every path for scope before deeply reviewing the highest-risk partitions. Track deep/light/generated/unreviewable coverage and use **Review incomplete** when material gaps prevent a trustworthy verdict. Do not claim complete line-by-line coverage unless it occurred.

## Risk-driven inspection

Review every meaningful human-written changed line when scope permits, plus enough surrounding and downstream code to establish behavior. Select relevant dimensions:

- authorization, tenant boundaries, secrets/personal data, money, destructive actions;
- public APIs, schemas, persisted data, old clients, migration and rollout order;
- state transitions, concurrency, idempotency, retries, ownership, lifecycle, cleanup, cancellation;
- empty, malformed, stale, duplicate, reordered, boundary, or partial inputs;
- errors, fallback behavior, configuration defaults, external-service behavior, observability and recovery;
- types/nullability, locale/time zones, encoding, precision, and numeric limits;
- changed UI states, keyboard/focus, accessibility, responsiveness, hydration, listeners/effects;
- performance only on a concrete execution path at realistic scale;
- complexity only when it creates a specific correctness, operability, or future-change hazard.

For security-sensitive changes, trace untrusted data through validation and authorization to the sink; include business-logic bypasses, not just recognizable vulnerability patterns. Review generated output through its source where possible while still noticing suspicious generated, dependency, file-mode, symlink, and submodule changes.

A pre-existing defect is in scope only if this change activates, exposes, or materially worsens it. Base-only integration problems are not invented head-side inline findings.

## Tests and verification

Determine whether changed tests fail when the protected behavior breaks. Inspect assertions, regression cases, fixtures, mocks, timing dependence, and tests coupled only to implementation details.

Run the smallest relevant existing checks against the intended execution state from the scope procedure. Broaden to type/lint/build/integration/browser checks only when changed behavior or unresolved risk justifies them. Do not run a generic full matrix merely because tools exist.

A failing check is a finding only when reproducible and attributable to the change. Otherwise report it as verification evidence or residual risk. Record exact commands, outcomes, and tested revision/state; never infer a pass from test files or another checkout.

Before publishing each candidate, try to disprove it through callers, guards, types, tests, framework behavior, configuration, and repository conventions. The root skill's finding gate and verdict rules govern the final judgment.
