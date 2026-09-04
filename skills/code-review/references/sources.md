# Code Review Sources and Applied Decisions

This file records the evidence behind the skill. It is reference material, not required reading for every review.

**Last source verification:** 2026-09-04. Re-verify platform behavior, Git semantics, and security guidance during major revisions.

## Pi Agent Skills

- [Pi skills documentation](https://pi.dev/docs/latest/skills)
  - Pi exposes a skill's name and description in the system prompt, then loads `SKILL.md` on demand.
  - The description should say both what the skill does and when to use it.
  - Supporting references should use paths relative to the skill directory.
- [Agent Skills specification](https://agentskills.io/)
  - `name` and `description` are the discovery contract; detailed procedures belong in `SKILL.md` and supporting files.

**Applied:** keep the discovery description specific, keep the executable review workflow in `SKILL.md`, and move provenance into an on-demand reference file.

## GitHub: branch comparison and review workflow

- [About comparing branches in pull requests](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-comparing-branches-in-pull-requests)
  - GitHub pull requests compare head with base using a three-dot view from merge base to head.
  - This isolates what the topic branch introduced since divergence.
- [Reviewing proposed changes](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/reviewing-proposed-changes-in-a-pull-request)
  - Review changed files deliberately, comment on specific changes, and finish with an explicit outcome.
- [Helping others review your changes](https://docs.github.com/en/pull-requests/concepts/helping-others-review-your-changes)
  - Context, bounded scope, self-review, tests, and attention to sensitive areas improve review quality.

**Applied:** use the merge-base-to-head patch as the review scope, verify branch direction, cite specific changed lines, and report a verdict.

## Google Engineering Practices

- [What to look for in a code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html)
  - Review design, functionality, complexity, tests, naming, comments, documentation, style, and meaningful changed lines in system context.
  - Consider edge cases and concurrency; inspect user-facing behavior when code alone is insufficient.
  - Tests require human review and should fail when the behavior they protect breaks.
- [How to write code review comments](https://google.github.io/eng-practices/review/reviewer/comments.html)
  - Comment on code rather than the person, explain why, and distinguish required changes from optional feedback.
- [The standard of code review](https://google.github.io/eng-practices/review/reviewer/standard.html)
  - Improve overall code health rather than demand perfection; do not block on preference-level polish.

**Applied:** use a material-defect threshold, inspect tests as code, explain impact and resolution, and avoid perfectionism or style noise.

## Microsoft

- [Get feedback with pull requests](https://learn.microsoft.com/en-us/devops/develop/git/git-pull-requests)
  - Good feedback is informed, actionable, and constructive; it identifies the issue and offers specific direction.
  - Out-of-scope improvements belong in separate work rather than blocking the current change.

**Applied:** keep findings actionable, root-cause oriented, and patch-scoped.

## OWASP

- [Secure Code Review Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html)
  - Diff-based review should assess modified components, existing controls, trust boundaries, integrations, and regressions.
  - Human review adds particular value for authorization, business logic, state transitions, races, data flow, and contextual threats.
  - Trace sources through processing to sinks and validate controls at each boundary.

**Applied:** prioritize security-sensitive diffs and trace plausible attack or data paths instead of emitting generic security warnings.

## Conventional Comments

- [Conventional Comments](https://conventionalcomments.org/)
  - Labels and blocking decorations clarify intent; issues need rationale and a resolution path, while uncertain concerns should be questions.

**Applied:** separate high-confidence findings from non-blocking questions and make blocking intent explicit.

## Git

- [git-diff documentation](https://git-scm.com/docs/git-diff)
- [gitrevisions documentation](https://git-scm.com/docs/gitrevisions)
- [git-merge-base documentation](https://git-scm.com/docs/git-merge-base)
- [git-rev-parse documentation](https://git-scm.com/docs/git-rev-parse)
- [git-worktree documentation](https://git-scm.com/docs/git-worktree)

**Applied:** resolve refs to immutable commit IDs, use `git diff A...B` for the merge-base-to-B patch, distinguish that from revision-set semantics in `git log`, and isolate validation from unrelated working-tree state.

## Additional design decisions in version 2.0

- The current base is treated as integration context even though only head-introduced behavior can become a finding.
- Dirty or differently checked-out worktrees are never used to claim head-only verification.
- Candidate findings must survive an explicit disproof pass before publication.
- Merge blockers and verification failures without a changed-line root cause stay in the summary rather than receiving fabricated inline locations.
- Verdict selection is deterministic, and **Review incomplete** prevents false confidence when coverage is materially insufficient.
