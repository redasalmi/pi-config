# Branch and Working-Tree Evidence

Read only when deriving Steps to Test from repository changes. A requirements-only draft does not need a Git comparison.

## Select the repository scope

Never mix committed branch changes and uncommitted working-tree changes silently.

### Committed branch scope

Use when base/head refs or a PR branch are supplied. Interpret **base** as the target branch and **head** as the branch under test.

Resolve missing refs in this order:

- **Head:** explicit ref, otherwise current `HEAD`.
- **Base:** explicit ref; available PR metadata; `refs/remotes/origin/HEAD`; then a clearly established repository default.

Do not silently assume `main` when the repository establishes another default. Resolve immutable commits once and use them throughout:

```bash
git status --short
BASE_SHA=$(git rev-parse --verify --end-of-options "${BASE_REF}^{commit}")
HEAD_SHA=$(git rev-parse --verify --end-of-options "${HEAD_REF}^{commit}")
MERGE_BASE=$(git merge-base "$BASE_SHA" "$HEAD_SHA")

git log --oneline "$BASE_SHA..$HEAD_SHA"
git diff --stat "$MERGE_BASE" "$HEAD_SHA"
git diff --name-status --find-renames "$MERGE_BASE" "$HEAD_SHA"
git diff --find-renames "$MERGE_BASE" "$HEAD_SHA"
```

Use merge-base-to-head scope to identify what the branch introduces. Inspect the current base only when its newer behavior materially affects reachability, contracts, or the expected merged result; never attribute base-only behavior to the head branch.

Do not include worktree changes. When the pinned head is not checked out, inspect head-side files with `git show "${HEAD_SHA}:<path>"` rather than reading another revision from the worktree.

Resolve reversed refs, a missing merge base, or an unexpectedly empty or broad diff before relying on branch evidence. A requirements-only draft may still be possible; disclose the branch-evidence gap rather than fabricating coverage.

Use local refs by default. Fetch only when the user requests current remote state or stale or missing refs make it necessary and network access is appropriate.

### Working-tree scope

Use staged or unstaged changes only when the user explicitly asks for steps based on current or uncommitted work. Inspect staged and unstaged changes separately and label the result a **provisional working-tree draft**. Do not describe it as a committed PR comparison.

### Requirements or context-only scope

When repository evidence is unavailable, draft from accepted requirements and supplied product context. Do not infer implementation details, labels, routes, or test data that the sources do not establish.

### Coverage for broad changes

For a large or cross-cutting diff, build a complete changed-path manifest, group the work by behavior, and inspect every path at least for tester-facing relevance. Distinguish generated, vendor, lockfile, migration, configuration, and human-authored changes. If material areas remain lightly inspected or unavailable, state that the draft is partial and identify the coverage gap.
