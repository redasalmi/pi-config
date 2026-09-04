---
name: code-review
description: Reviews committed pull-request or branch changes by comparing a head ref with its base, then produces evidence-backed, prioritized inline findings and a merge-readiness summary. Use for PR reviews, branch comparisons, regression or security analysis, test assessment, and requests to decide whether a change is safe to merge. Do not use for implementing fixes or reviewing only uncommitted working-tree changes.
metadata:
  author: local
  version: "2.0.0"
---

# Pull Request Code Review

Act as an independent reviewer, not the change author. Review what the head introduces relative to the base. Optimize for material defects and merge risk; prefer no comment over weak, speculative, duplicated, or style-only feedback.

Do not edit code unless the user explicitly asks for fixes after the review.

## 1. Resolve an immutable review scope

Prefer explicit invocation:

```text
/skill:code-review base=main head=my-feature
```

**Base** is the ref the change will merge into; **head** is the proposed ref. Treat extra invocation text as a focus hint, not permission to ignore unrelated blockers unless the user explicitly narrows scope.

Resolve missing refs in this order:

- **Head:** explicitly named ref, otherwise current `HEAD`.
- **Base:** explicitly named ref; unambiguous current-PR metadata when available and network use is appropriate; `refs/remotes/origin/HEAD`; then a repository default established by local instructions or configuration.

Never silently assume `main`. Ask for the base only when no reliable local or PR-derived choice exists.

Confirm the intended repository, resolve both refs safely, and pin their commit IDs once:

```bash
git rev-parse --show-toplevel
BASE_SHA=$(git rev-parse --verify --end-of-options "${BASE_REF}^{commit}")
HEAD_SHA=$(git rev-parse --verify --end-of-options "${HEAD_REF}^{commit}")
```

Use `BASE_SHA` and `HEAD_SHA` for every later Git read so moving refs cannot change the review mid-pass. Report the original ref names and abbreviated SHAs. Use local refs by default; fetch only when current remote state is requested or a required ref is stale/missing and network access is appropriate. Never imply local refs match the remote unless verified.

## 2. Establish the PR patch and execution state

Do not switch branches or include uncommitted changes in a committed branch review. Record a dirty worktree as context, but keep it outside the patch.

Build a complete manifest before reading individual files:

```bash
git status --porcelain=v1 --branch
MERGE_BASE=$(git merge-base "$BASE_SHA" "$HEAD_SHA")
git rev-list --left-right --count "${BASE_SHA}...${HEAD_SHA}"
git log --oneline --decorate "${BASE_SHA}..${HEAD_SHA}"
git diff --stat "${BASE_SHA}...${HEAD_SHA}"
git diff --name-status --find-renames "${BASE_SHA}...${HEAD_SHA}"
git diff --summary --submodule=log "${BASE_SHA}...${HEAD_SHA}"
git diff --check "${BASE_SHA}...${HEAD_SHA}"
```

`git log base..head` lists head-only commits. `git diff base...head` shows the merge-base-to-head PR patch. Do not transfer dotted-notation meaning between commands.

If there is no merge base, stop: an ordinary PR-style review is invalid. If the patch is unexpectedly empty or huge, verify ref direction and commit counts. Do not hide merge commits categorically; use `--first-parent`, `--no-merges`, or path-limited history only as additional views.

Inspect each path with a path-limited diff and enough full-file context:

```bash
git diff --find-renames --find-copies "${BASE_SHA}...${HEAD_SHA}" -- <path>
git show "$HEAD_SHA:<path>"
```

When `MERGE_BASE != BASE_SHA`, current base contains changes absent from head. Inspect base-side changes touching the same files, callers, contracts, schemas, or dependencies. For merge-readiness reviews, validate a prospective merge state when practical. Never report a base-only defect against head; list merge conflicts as summary blockers rather than inventing inline locations.

Run checks in the current worktree only when it is clean and checked out at `HEAD_SHA`. Otherwise, when safe and worthwhile, use a temporary detached worktree at the intended head or prospective merge state, run repository-approved checks there, and remove it even after failure. Do not install dependencies, run migrations, or perform external writes merely to increase coverage without authorization. If safe validation is unavailable, say so.

For a patch too large to review reliably in one pass:

1. classify every changed, renamed, deleted, binary, generated, vendor, lockfile, and submodule path;
2. partition human-authored changes by subsystem and risk;
3. inspect every path for scope, then deeply review high-risk partitions first;
4. track deep, light, generated, and unreviewable coverage internally;
5. report material gaps and use **Review incomplete** when they prevent a trustworthy verdict.

Never claim complete line-by-line coverage when it did not occur.

## 3. Understand intent and review in risk order

Read only context that can change the judgment: repository instructions, architecture notes, supplied PR/issue context, changed production code and tests, schemas, dependencies, configuration, generated output, relevant full functions, callers, types, persisted formats, and existing tests. Treat commit subjects as hints, never proof.

Write an internal thesis: “This change attempts to ___ by ___.” When intent is uncertain, state the smallest reasonable assumption and continue; ask only when competing interpretations materially change correctness or invalidate the review.

### Map behavior and boundaries

Identify public contracts, trust boundaries, state transitions, persistence, concurrency, user-visible flows, migrations, feature flags, rollout/rollback, and deployment effects. Review generated output through its source when possible, while still noticing suspicious generated, lockfile, file-mode, symlink, or submodule changes.

Prioritize authentication/authorization, secrets and personal data, tenant boundaries, money and destructive actions, schemas and API compatibility, dependency changes, concurrency/retries/idempotency, input handling and external calls, configuration defaults, observability, and failure recovery.

For security-sensitive changes, trace untrusted data from source through validation and authorization to each sink. Check business-logic bypasses and cross-boundary assumptions, not only recognizable vulnerability patterns.

### Review changed behavior in context

Review every meaningful human-written changed line when scope permits, plus enough surrounding and downstream code to establish behavior. Check:

- normal, empty, boundary, malformed, stale, duplicate, reordered, and partial inputs;
- errors, cleanup, cancellation, timeouts, retries, and recovery;
- invariants, lifecycle, ordering, ownership, and races;
- nullability, narrowing, locale, time zone, encoding, precision, and numeric limits;
- compatibility with current callers, persisted data, old clients, and rollout order;
- UI loading/empty/error/optimistic/stale states, focus, keyboard, accessibility, responsive behavior, hydration, and effect/listener cleanup where relevant;
- performance only with a concrete path and realistic scale;
- complexity only when it creates a specific correctness, operability, or future-change hazard.

Do not report unrelated pre-existing defects unless the patch activates, exposes, or materially worsens them.

### Review tests and verification evidence

Determine whether changed tests would fail when the protected behavior breaks. Check regression cases, assertions, fixtures, mocking, timing dependence, and tests coupled only to implementation details.

Run the smallest relevant existing checks first: targeted tests, then type, lint, build, integration, or browser checks when justified. A failing command is a finding only when reproducible and attributable to head; otherwise record it under verification or residual risk. Never claim a command passed unless it ran successfully in this session against the stated revision.

## 4. Apply a strict finding gate

Publish a finding only when all are true:

1. Head introduces, exposes, or materially worsens it.
2. There is a concrete trigger, execution path, or violated contract.
3. Impact is meaningful to users, data, security, operations, or safe future modification.
4. The cited changed location is the root cause or closest actionable cause.
5. A smallest reasonable fix direction is known.
6. Confidence is high enough that a human reviewer should leave the comment.

Before publishing, try to disprove the candidate using callers, guards, types, tests, framework/library behavior, configuration, and repository conventions. Collapse multiple symptoms into one root-cause finding.

Do not report preferences, formatter/linter issues, vague cleanliness or architecture concerns, speculative performance/security claims, generic missing-test requests, base-only defects, or duplicate symptoms.

Use a non-blocking question only when a decision-relevant uncertainty remains after investigation. A question is not a finding and must not be phrased as a disguised accusation.

## 5. Assign priority and verdict

Use repository labels when documented; otherwise choose the lowest defensible priority:

- **P0 — critical/blocking:** catastrophic security exposure, unrecoverable data loss, or system-wide outage through a plausible path.
- **P1 — high/blocking:** likely serious user, security, data, or production failure; fix before merge.
- **P2 — medium/blocking:** credible real defect with limited impact; normally fix before merge.
- **P3 — low/non-blocking:** small concrete issue worth addressing; never taste or generic polish.

Avoid P0/P1 inflation. Map repository labels explicitly when they differ.

Choose the verdict deterministically:

- **Request changes:** any P0-P2 finding or unresolved merge blocker.
- **Approve with comments:** only P3 findings or non-blocking questions, with sufficient coverage.
- **No material findings:** no publishable findings and sufficient coverage.
- **Review incomplete:** missing refs/context, unsafe execution state, unreviewable artifacts, or material coverage gaps prevent a reliable verdict.

## 6. Output

Lead with findings ordered P0 to P3. Keep each concise, independent, and ready to paste as an inline PR comment.

```markdown
## Findings

### [P1] Imperative, specific title
`path/to/file.ts:42-47`

When <trigger>, <current behavior> causes <observable impact>. Explain the evidence and why existing guards or tests do not prevent it.
**Fix:** Apply the smallest safe remediation without redesigning unrelated code.
```

Location rules:

- cite the head-side path and smallest useful changed range, ideally 1-5 lines;
- the range must overlap the diff and identify the actionable cause;
- for deletion-only defects, cite the deleted base-side range and label it `(deleted from base)`;
- when failure manifests elsewhere, cite the changed cause and name the downstream location;
- derive line numbers from diff hunks when head is not checked out; never invent a surviving line.

Include `## Questions` only for remaining decision-relevant, non-blocking questions. Finish with:

```markdown
## Review summary
- **Verdict:** Request changes / Approve with comments / No material findings / Review incomplete
- **Compared:** `<base-ref>@<sha> ← <head-ref>@<sha>`; merge base `<sha>`
- **Scope:** commits and changed paths reviewed; material coverage limits only
- **Verification:** commands actually run with outcomes, or `Not run` with reason
- **Residual risk:** only material integration, runtime, generated, binary, or unverified areas
```

With sufficient coverage and no findings, write **“No material findings.”** Under an incomplete review, write **“No material findings identified in the reviewed scope.”** Never invent a nit. Mention positive work only when specific and useful, and never let praise obscure blockers or gaps.

The methodology is grounded in GitHub, Google, Microsoft, OWASP, Conventional Comments, Git, and Pi Agent Skills guidance. Read [references/sources.md](references/sources.md) only when provenance or methodology details are needed.
