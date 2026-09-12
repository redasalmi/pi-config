# Base/Head Review Scope

Use for PR/branch comparisons and custom focus without another underlying mode.

## Resolve the subject

Base is the target ref; head is the proposed ref, defaulting to `HEAD`. Resolve missing refs in this order: explicit ref; unambiguous current-PR metadata when available and network use is appropriate; `refs/remotes/origin/HEAD`; repository default established by local instructions/configuration. Never silently assume `main`; ask if no reliable choice exists.

Use local refs by default. Fetch only when current remote state is requested or a required ref is stale/missing and network access is appropriate. Never imply local refs match the remote unless verified.

Pin once:

```bash
git rev-parse --show-toplevel
BASE_SHA=$(git rev-parse --verify --end-of-options "${BASE_REF}^{commit}")
HEAD_SHA=$(git rev-parse --verify --end-of-options "${HEAD_REF:-HEAD}^{commit}")
MERGE_BASE=$(git merge-base "$BASE_SHA" "$HEAD_SHA")
```

Stop if ref resolution or merge-base discovery fails. An ordinary branch review is invalid without a merge base. Report original names and abbreviated SHAs.

## Establish the patch

Inspect status, head-only history, divergence, and a complete path manifest covering additions, deletions, renames, modes, binaries, generated/vendor files, lockfiles, and submodules. These commands provide the relevant views; use additional output only when it changes judgment:

```bash
git status --porcelain=v1 --branch
git rev-list --left-right --count "${BASE_SHA}...${HEAD_SHA}"
git log --oneline --decorate "${BASE_SHA}..${HEAD_SHA}"
git diff --name-status --find-renames "$MERGE_BASE" "$HEAD_SHA"
git diff --summary --submodule=log "$MERGE_BASE" "$HEAD_SHA"
git diff --check "$MERGE_BASE" "$HEAD_SHA"
```

`git log base..head` lists head-only commits; the merge-base-to-head diff is the patch. Dotted notation has different meanings across commands. For an unexpectedly empty or huge patch, verify direction and commit counts. Do not categorically hide merge commits; filtered history is an additional view only.

Inspect path-limited diffs and target-side context:

```bash
git diff --find-renames --find-copies "$MERGE_BASE" "$HEAD_SHA" -- <path>
git show "$HEAD_SHA:<path>"
```

When `MERGE_BASE != BASE_SHA`, inspect base-side changes touching the same files, callers, contracts, schemas, or dependencies. For merge-readiness reviews, validate a prospective merge when practical. Base-only defects are not head findings; merge conflicts are summary blockers.

Do not switch branches. Keep unrelated uncommitted changes out of the patch. Run checks in the current worktree only if clean and checked out at the intended revision; otherwise use a disposable detached worktree at head or the prospective merge state. Report which state was verified and remove disposable worktrees even after failure.
