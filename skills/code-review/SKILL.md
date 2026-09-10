---
name: code-review
description: Reviews a code change against an explicit, immutable scope — a base/head branch or pull-request comparison, a single commit, or the uncommitted working tree — and produces evidence-backed, prioritized inline findings with a merge-readiness verdict. Use for PR reviews, branch comparisons, commit review, pre-commit review of working changes, regression or security analysis, test assessment, and requests to decide whether a change is safe to merge. Do not use for implementing fixes.
metadata:
  author: local
  version: "2.1.0"
---

# Code Review

Act as an independent reviewer, not the change author. Review what the change introduces relative to its resolved scope. Optimize for material defects and merge risk; prefer no comment over weak, speculative, duplicated, or style-only feedback.

Review without editing. If the user explicitly requested fixes as well, complete and report the review first, then perform those fixes as a separate implementation phase under the repository's change and verification rules. Authorization may be given in the original request; do not require a second request merely because the review is now complete.

## 1. Resolve the review scope and mode

Reviews run against exactly one **mode**, each defining what “the change” is:

- **base** — compare a head ref against a base ref (pull-request or branch review).
- **commit** — review one commit against its first parent.
- **uncommitted** — review staged, unstaged, and untracked working-tree changes.
- **custom** — apply a free-text focus to the scope named by the other keys.

Prefer explicit invocation:

```text
/skill:code-review base=main head=my-feature
/skill:code-review commit=abc123
/skill:code-review uncommitted
/skill:code-review base=main focus="check auth and migrations"
```

If the mode is not named, infer it: a `commit` key selects commit; `uncommitted`/`worktree` selects uncommitted; `base`/`head` keys or a bare ref select base; otherwise base with `head=HEAD`. Ask only when competing modes materially change the review and cannot be inferred.

Treat a `focus` value as a focus hint, not permission to ignore unrelated blockers, unless the caller explicitly narrows scope.

Pin commit IDs once so moving refs cannot change the review mid-pass. Report the original ref names and abbreviated SHAs.

**base**

```bash
git rev-parse --show-toplevel
BASE_SHA=$(git rev-parse --verify --end-of-options "${BASE_REF}^{commit}")
HEAD_SHA=$(git rev-parse --verify --end-of-options "${HEAD_REF:-HEAD}^{commit}")
```

- **Base** is the ref the change will merge into; **head** is the proposed ref.
- Resolve missing refs in this order: explicitly named ref; unambiguous current-PR metadata when available and network use is appropriate; `refs/remotes/origin/HEAD`; then a repository default established by local instructions or configuration.
- Never silently assume `main`. Ask for the base only when no reliable local or PR-derived choice exists.
- Use local refs by default; fetch only when current remote state is requested or a required ref is stale/missing and network access is appropriate. Never imply local refs match the remote unless verified.
- Stop if `git merge-base "$BASE_SHA" "$HEAD_SHA"` fails: an ordinary branch review is invalid without a merge base.

**commit**

```bash
COMMIT_SHA=$(git rev-parse --verify --end-of-options "${COMMIT_REF}^{commit}")
if ! PARENT_SHA=$(git rev-parse --verify --end-of-options "${COMMIT_SHA}^1" 2>/dev/null); then
  # `^1` also fails at a shallow or grafted boundary, which must not be treated as a root commit.
  if [ -n "$(git cat-file commit "$COMMIT_SHA" | grep '^parent ')" ]; then
    echo "Parent of $COMMIT_SHA is unavailable (shallow or grafted history); fetch more history before reviewing." >&2
    exit 1
  fi
  PARENT_SHA=4b825dc642cb6eb9a060e54bf8d69288fbee4904
fi
```

The empty-tree SHA stands in for a root commit's parent; when the parent is missing for any other reason, stop instead of diffing against the empty tree. For a merge commit, `^1` reviews the merge result relative to its first parent; state that in the summary.

**uncommitted**

There is no revision to pin. The subject is the current working tree (staged, unstaged, and untracked). Capture a `git status --porcelain=v1` snapshot at the start and treat the subject as mutable; note in the summary that it may change mid-review.

**custom**

Resolve the underlying mode from any `base`/`head`/`commit`/`uncommitted` keys, defaulting to base with `head=HEAD`. Carry the focus into the intent thesis and the finding gate, but do not discard blockers outside it.

## 2. Build the patch and execution state

Do not switch branches. In **base** and **commit** modes, keep uncommitted changes out of the patch and record a dirty worktree only as context. In **uncommitted** mode, the working tree itself is the patch. In **custom** mode, follow the underlying mode.

Build a complete manifest before reading individual files.

**base** (merge-base-to-head patch):

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

`git log base..head` lists head-only commits. `git diff base...head` shows the merge-base-to-head patch. Do not transfer dotted-notation meaning between commands. If the patch is unexpectedly empty or huge, verify ref direction and commit counts. Do not hide merge commits categorically; use `--first-parent`, `--no-merges`, or path-limited history only as additional views.

When `MERGE_BASE != BASE_SHA`, current base contains changes absent from head. Inspect base-side changes touching the same files, callers, contracts, schemas, or dependencies. For merge-readiness reviews, validate a prospective merge state when practical. Never report a base-only defect against head; list merge conflicts as summary blockers rather than inventing inline locations.

**commit** (single-commit patch):

```bash
git status --porcelain=v1 --branch
git show --stat --summary --find-renames --format=fuller "$COMMIT_SHA"
git diff --name-status --find-renames "$PARENT_SHA" "$COMMIT_SHA"
git diff --summary --submodule=log "$PARENT_SHA" "$COMMIT_SHA"
git diff --check "$PARENT_SHA" "$COMMIT_SHA"
```

Note whether the commit is already reachable from the default/base branch; an already-merged commit is a retrospective review, not a merge gate.

**uncommitted** (working-tree patch):

```bash
git status --porcelain=v1 --branch
git diff --stat
git diff --cached --stat
git diff --name-status --find-renames
git diff --cached --name-status --find-renames
git diff --check
git diff --cached --check
```

Untracked paths appear as `??` in `git status --porcelain=v1`; read their full contents and treat them as added files. There is no merge base or prospective merge state to validate.

Inspect each path with a path-limited diff and enough full-file context:

```bash
# base
git diff --find-renames --find-copies "${BASE_SHA}...${HEAD_SHA}" -- <path>
git show "$HEAD_SHA:<path>"
# commit
git diff --find-renames --find-copies "$PARENT_SHA" "$COMMIT_SHA" -- <path>
git show "$COMMIT_SHA:<path>"
# uncommitted
git diff --find-renames -- <path>
git diff --cached --find-renames -- <path>
```

For **base** and **commit** modes, read the target side through `git show "<sha>:<path>"`; for **uncommitted**, read the working-tree file directly.

Run checks in the current worktree only when it is clean and checked out at the target revision. For **base** and **commit** modes, prefer a temporary detached worktree at the intended head, commit, or prospective merge state when the worktree is dirty. For **uncommitted**, the worktree is the subject: run checks in place and expect the subject to change. Remove temporary worktrees even after failure. Do not install dependencies, run migrations, or perform external writes merely to increase coverage without authorization. If safe validation is unavailable, say so.

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

Run the smallest relevant existing checks first: targeted tests, then type, lint, build, integration, or browser checks when justified. A failing command is a finding only when reproducible and attributable to the change; otherwise record it under verification or residual risk. Never claim a command passed unless it ran successfully in this session against the stated revision.

## 4. Apply a strict finding gate

Publish a finding only when all are true:

1. The change introduces, exposes, or materially worsens it.
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

Lead with findings ordered P0 to P3. Keep each concise, independent, and ready to paste as an inline review comment.

```markdown
## Findings

### [P1] Imperative, specific title

`path/to/file.ts:42-47`

When <trigger>, <current behavior> causes <observable impact>. Explain the evidence and why existing guards or tests do not prevent it.
**Fix:** Apply the smallest safe remediation without redesigning unrelated code.
```

Location rules:

- cite the target-side path and smallest useful changed range, ideally 1-5 lines;
- the range must overlap the diff and identify the actionable cause;
- for deletion-only defects, cite the removed range on the compared-to side and label it `(deleted)`;
- when failure manifests elsewhere, cite the changed cause and name the downstream location;
- derive line numbers from diff hunks when the target side is not checked out; never invent a surviving line.

Include `## Questions` only for remaining decision-relevant, non-blocking questions. Finish with:

```markdown
## Review summary

- **Verdict:** Request changes / Approve with comments / No material findings / Review incomplete
- **Compared:** the resolved mode and subject, e.g. `base <ref>@<sha> ← head <ref>@<sha>` with merge base `<sha>`, `commit <ref>@<sha>` (parent `<sha>`), or `uncommitted working tree @ <status snapshot>`
- **Scope:** commits and changed paths reviewed; material coverage limits only
- **Verification:** commands actually run with outcomes, or `Not run` with reason
- **Residual risk:** only material integration, runtime, generated, binary, or unverified areas
```

With sufficient coverage and no findings, write **“No material findings.”** Under an incomplete review, write **“No material findings identified in the reviewed scope.”** Never invent a nit. Mention positive work only when specific and useful, and never let praise obscure blockers or gaps.

The methodology is grounded in GitHub, Google, Microsoft, OWASP, Conventional Comments, Git, and Pi Agent Skills guidance. Read [references/sources.md](references/sources.md) only when provenance or methodology details are needed.
