# Branch Evidence

Read when deriving claims from a branch or PR/MR comparison, not for a supplied-text-only wording critique.

## 3. Resolve an immutable branch scope

Preferred invocation:

```text
/skill:pr-description base=main head=my-feature
/skill:pr-description pr=123 mode=refresh
```

**Base** is the target ref; **head** is the proposed ref. If a specific PR/MR is supplied and provider metadata is available, prefer its exact repository, base, head, and commit OIDs over guesses from the current checkout.

Resolve missing values in this order:

- **Head:** explicit ref or provider head OID; otherwise current `HEAD`.
- **Base:** explicit ref or provider base OID; current-PR metadata when unambiguous; `refs/remotes/origin/HEAD`; then a repository default established by local instructions or configuration.

Never silently assume `main`. Confirm the repository and pin both commits once:

```bash
ROOT=$(git rev-parse --show-toplevel)
BASE_SHA=$(git rev-parse --verify --end-of-options "${BASE_REF}^{commit}")
HEAD_SHA=$(git rev-parse --verify --end-of-options "${HEAD_REF}^{commit}")
MERGE_BASE=$(git merge-base "$BASE_SHA" "$HEAD_SHA")
```

Use `BASE_SHA`, `HEAD_SHA`, and `MERGE_BASE` for every later Git read so moving refs cannot change the draft mid-pass. Use local refs by default. Fetch only when current remote state is requested or a required ref is stale or missing and network access is appropriate. Never imply that a local ref matches the provider unless verified.

Build a complete change manifest before summarizing:

```bash
git status --porcelain=v1 --branch
git rev-list --left-right --count "${BASE_SHA}...${HEAD_SHA}"
git log --oneline --decorate "${BASE_SHA}..${HEAD_SHA}"
git diff --stat "$MERGE_BASE" "$HEAD_SHA"
git diff --numstat "$MERGE_BASE" "$HEAD_SHA"
git diff --name-status --find-renames "$MERGE_BASE" "$HEAD_SHA"
git diff --summary --submodule=log "$MERGE_BASE" "$HEAD_SHA"
git diff --find-renames --find-copies "$MERGE_BASE" "$HEAD_SHA"
```

`git log base..head` lists head-only commits. The merge-base-to-head diff shows what the proposed branch introduces. Do not transfer dotted-notation meaning between commands.

Do not switch branches or include dirty working-tree changes in a committed PR description. When head is not checked out, read files with `git show "${HEAD_SHA}:<path>"` and path-limited diffs rather than using another revision from the worktree.

If the user explicitly asks to include staged or unstaged work, inspect those scopes separately and label the result **provisional working draft**. Do not represent uncommitted work as part of an existing PR or apply that description externally before the relevant commits exist.

Resolve a missing merge base, likely reversed refs, or an unexpectedly empty or broad diff before relying on branch evidence. A context-only draft or critique may still be possible, but disclose that the branch comparison was unavailable.

For a large diff:

1. classify every changed, renamed, deleted, generated, vendor, binary, lockfile, file-mode, symlink, and submodule path;
2. group human-authored changes by behavior or subsystem;
3. inspect every path for scope and material impact, then read enough surrounding code to understand the important groups;
4. track lightly inspected or unreviewable areas internally;
5. call the result provisional when coverage gaps could materially change the summary.

Never hide a material subsystem simply because it does not fit the apparent ticket narrative.
