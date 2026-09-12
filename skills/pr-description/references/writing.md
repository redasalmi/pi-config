# Write for PR Reviewers

Use for Draft/Refresh and when critiquing evidence or reviewer clarity. The root skill owns authority, template selection, external-update permission, and delivery format.

## Establish the useful facts

From the selected evidence, identify:

- **Purpose:** supported problem or goal, not a motivation invented from commit subjects.
- **Outcome:** actual user/API/data/developer/operational behavior that changes.
- **Scope:** every material subsystem, including work outside the apparent ticket narrative.
- **Implementation shape:** only choices, boundaries, tradeoffs, or review order that help reviewers.
- **Verification:** exact checks and revision, author-reported manual coverage, and tests added but not run.
- **Risk/rollout:** relevant migrations, contracts, permissions, dependencies, configuration, flags, compatibility, rollback, and limitations.
- **Artifacts/related work:** supplied screenshots, recordings, benchmarks, and verified issues/follow-ups; state what they actually demonstrate.

Use commit history as a map, not proof. Read relevant changed code, surrounding head-side context, tests, and callers to establish these facts. Do not turn a small change into an exhaustive architecture review or hide unrelated changes behind an invented single purpose.

For Refresh, preserve compatible author-only rationale and useful historical context. Remove stale claims, obsolete file inventories, old status, and statements contradicted by the current diff. If purpose cannot be established, use a neutral outcome-led summary and put a concise question outside the paste-ready body.

## Verification labels

Use these labels unless the repository template requires equivalent wording:

- **Passed — command/CI check:** trustworthy final evidence tied to pinned head.
- **Failed — command/CI check: reason:** current relevant failure tied to pinned head.
- **Reported — manual scenario/command:** user or author assertion, not independently verified here.
- **Added/updated — coverage:** test code exists in the diff; not an execution claim.
- **Suggested — reviewer check:** future verification, only when requested by the user/template.
- **Not run — reason:** no verification evidence.

Provider checks need a known final state and head OID. Pending, skipped, cancelled, stale, and base-branch results are not passes. Dirty-worktree or other-revision results cannot certify the pinned head. Do not hide known failures or write “fully tested,” “production ready,” or “all tests pass” beyond the evidence.

## Reviewer prose

Lead with outcome, not “This PR...” or a file-by-file diary. Explain why only when supported. Each bullet adds a distinct fact; do not repeat Summary under another heading.

Keep details proportional. A tiny fix may need two bullets and testing; a migration may require rollout order, rollback, and data verification. State concrete compatibility/configuration/data consequences instead of calling a change low-risk because it is small. Explain refactors/tooling in developer or operational terms rather than inventing a user benefit.

Include generated/dependency changes when they affect review, behavior, deployment, licensing, supply chain, or reproducibility. Call out security-sensitive, nonlinear, generated, migration, or subtle review areas. Do not claim performance, UX, robustness, or security benefits without evidence.

Include only real screenshots/recordings. If a required section asks for missing captures, say `Not captured`; otherwise omit the empty section. Read legitimate issue context when access exists and it materially changes the prose; never publicly search private ticket identifiers.

Use neutral issue references unless explicit closing intent exists. An inferred branch ticket key does not authorize `Closes`, `Fixes`, or `Resolves`. Full manual QA procedures belong in the Steps to Test workflow unless explicitly requested here; a PR normally needs only concise reviewer verification.

## Titles

Generate only when requested or needed for an explicit provider action. Use a short, specific, outcome-led title consistent with established PR-title conventions. Preserve verified ticket/scope prefixes; do not infer them from branch names or impose Conventional Commits merely because commit subjects use it.

Avoid content-free titles such as `Fix bug`, `Update code`, `Misc changes`, or `Phase 1` without a concrete outcome.

## Default body

When no template applies, use the smallest useful structure:

```markdown
## Summary

- Outcome and material behavior changes in distinct bullets.

## Testing

- <Passed / Failed / Reported / Added/updated / Suggested / Not run> — <evidence or reason>
```

Add only sections that carry material information: Context, Implementation notes, Screenshots, API/data migration, Risks and rollout, Reviewer notes, Related issue, or Follow-ups/known limitations. Do not add boilerplate checklists, empty headings, or every changed filename.

Keep unresolved questions, template uncertainty, provisional scope, and inspection gaps outside paste-ready content after the root skill's separator.
