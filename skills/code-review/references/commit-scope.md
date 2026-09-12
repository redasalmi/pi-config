# Single-Commit Review Scope

Review one pinned commit against its first parent. For merge commits, this is the merge result relative to the first parent, not separate review of every merged commit; state that in the summary.

```bash
COMMIT_SHA=$(git rev-parse --verify --end-of-options "${COMMIT_REF}^{commit}")
if ! PARENT_SHA=$(git rev-parse --verify --end-of-options "${COMMIT_SHA}^1" 2>/dev/null); then
  # A missing shallow/grafted parent must not be treated as a root commit.
  if [ -n "$(git cat-file commit "$COMMIT_SHA" | grep '^parent ')" ]; then
    echo "Parent of $COMMIT_SHA is unavailable; obtain the missing history before reviewing." >&2
    exit 1
  fi
  PARENT_SHA=4b825dc642cb6eb9a060e54bf8d69288fbee4904
fi
```

Stop if the commit cannot be resolved. The empty-tree SHA applies only to a verified root commit. Use local history by default; fetch missing history only when network use is appropriate. Report the original ref and abbreviated commit/parent IDs.

Inspect status and a complete manifest before path-level review:

```bash
git status --porcelain=v1 --branch
git show --stat --summary --find-renames --format=fuller "$COMMIT_SHA"
git diff --name-status --find-renames "$PARENT_SHA" "$COMMIT_SHA"
git diff --summary --submodule=log "$PARENT_SHA" "$COMMIT_SHA"
git diff --check "$PARENT_SHA" "$COMMIT_SHA"
```

Include generated/vendor, binary, lockfile, mode, symlink, and submodule changes in scope accounting. Then inspect each path and enough target-side context:

```bash
git diff --find-renames --find-copies "$PARENT_SHA" "$COMMIT_SHA" -- <path>
git show "$COMMIT_SHA:<path>"
```

Determine whether the commit is already reachable from the established base/default branch. If so, label the review retrospective rather than a merge gate.

Do not switch branches or include unrelated worktree changes. Run checks in the current worktree only if clean and checked out at the commit; otherwise use a disposable detached worktree at that revision. Remove it even after failure. Unavailable safe validation is a disclosed gap, not permission to install dependencies, run migrations, or make external writes.
