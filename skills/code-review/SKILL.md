---
name: code-review
description: Reviews branch/PR diffs, individual commits, or uncommitted changes for material defects and merge risk. Use for review of a code change, not general repository audits or implementing fixes.
metadata:
  author: local
  version: "3.0.0"
---

# Code Review

Review as an independent reviewer. Report defects introduced, exposed, or materially worsened by the selected change; prefer no finding over speculative, duplicated, or style-only feedback.

Review without editing. When the user also requested fixes, report the review, then complete the authorized fixes as a separate implementation phase. The original request can authorize both; do not require a second approval merely to change phases.

## Resolve scope and load one procedure

Infer the scope from the request. Ask only when competing interpretations materially change the review and available evidence cannot resolve them.

- **Base/PR comparison:** `base=<ref> head=<ref>` or a bare ref. Read [references/base-scope.md](references/base-scope.md).
- **Single commit:** `commit=<ref>`. Read [references/commit-scope.md](references/commit-scope.md).
- **Uncommitted:** `uncommitted` or `worktree`, including staged, unstaged, and untracked changes. Read [references/worktree-scope.md](references/worktree-scope.md).
- **Custom focus:** resolve its underlying scope from those keys; otherwise use base comparison with `head=HEAD`. Focus is not permission to ignore unrelated blockers unless the user explicitly narrows scope.

Without scope keys, use base comparison with `head=HEAD`; resolve the base from evidence, never assume `main`. Pin commit IDs once and use target-side files throughout. Do not switch branches or mix unrelated working-tree changes into a committed comparison.

References are relative to the `code-review` skill directory.

## Review and verify

Read [references/review-method.md](references/review-method.md) for change assessment and safe verification. Inspect the complete changed-path manifest, then enough changed code, tests, callers, contracts, configuration, and execution paths to establish material impact. Scale depth to risk and report gaps that prevent a trustworthy verdict.

Do not install dependencies, run migrations, or perform external writes merely to increase review coverage without authorization. Use the smallest relevant existing checks against the stated revision; report unavailable checks rather than borrowing results from another state. Remove disposable worktrees created for verification even after failure.

## Finding gate

Publish only when all hold:

- the change causes or activates the defect;
- a concrete trigger, execution path, or violated contract establishes meaningful impact;
- the cited location is the actionable changed cause;
- a smallest reasonable fix direction is known;
- callers, guards, types, tests, and conventions do not disprove it.

Collapse symptoms sharing a root cause. Do not publish preferences, generic missing-test requests, speculative performance/security claims, or pre-existing/base-only defects. Put unresolved decision-relevant uncertainty under **Questions**, not disguised findings.

## Priority and verdict

Use repository labels when documented and map them explicitly; otherwise use the lowest defensible priority:

- **P0:** plausible catastrophic security exposure, unrecoverable data loss, or system-wide outage.
- **P1:** likely serious user, security, data, or production failure.
- **P2:** credible defect with limited impact, normally requiring correction before merge.
- **P3:** small concrete non-blocking issue, never taste.

Verdicts:

- **Request changes:** any P0–P2 finding or unresolved merge blocker.
- **Approve with comments:** only P3 findings or non-blocking questions, with sufficient coverage.
- **No material findings:** no publishable findings and sufficient coverage.
- **Review incomplete:** missing evidence, unsafe verification state, or material coverage gaps prevent a reliable judgment.

## Output

Lead with findings ordered by priority:

```markdown
## Findings

### [P1] Specific, actionable title

`path/to/file.ts:42–47`

When <trigger>, <behavior> causes <impact>. State the supporting evidence.
**Fix:** <smallest safe correction>.
```

Cite the target-side path and smallest useful changed range, ideally 1–5 lines. Derive line numbers from the pinned target or diff, not a different checkout. For deletion-only defects, cite the removed range on the compared-to side and label it `(deleted)`. Merge conflicts belong in the summary, not fabricated inline locations.

Include **Questions** only when needed. Finish with:

- **Verdict**
- **Compared:** original refs and abbreviated pinned SHAs, merge base or parent as applicable; for uncommitted review, identify the status snapshot and its mutability
- **Scope:** paths/commits reviewed and material coverage limits
- **Verification:** commands actually run, outcomes, and revision; otherwise `Not run` with reason
- **Residual risk:** only material unverified areas or integration blockers

With sufficient coverage and no findings, say **“No material findings.”** If incomplete, say **“No material findings identified in the reviewed scope.”** A completed review need not fix the defects it identifies.

Read [references/sources.md](references/sources.md) only for provenance or methodology revision.
