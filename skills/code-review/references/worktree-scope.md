# Uncommitted Review Scope

The subject is staged, unstaged, and untracked working-tree changes. There is no immutable revision or prospective merge state. Capture status at the start and report that the subject may change during review.

```bash
git status --porcelain=v1 --branch
git diff --name-status --find-renames
git diff --cached --name-status --find-renames
git diff --check
git diff --cached --check
```

Build the complete changed-path manifest, including deleted, renamed, binary, generated, vendor, lockfile, mode, symlink, and submodule paths. Inspect staged and unstaged views separately:

```bash
git diff --find-renames -- <path>
git diff --cached --find-renames -- <path>
```

Read current full-file context. Untracked paths appear as `??` in status; read their contents and treat them as added files. Do not omit them merely because `git diff` does not show them.

Run relevant non-destructive checks in place: this worktree is the subject. Do not overwrite user edits or let auto-fix/format commands change unrelated content. If the subject changes materially while inspecting or checking, refresh the affected evidence and disclose remaining coverage gaps. Never attribute these results to a committed revision.
