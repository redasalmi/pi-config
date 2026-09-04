# Provider Template Resolution

Use this reference only when a repository or provider template may apply. Provider behavior changes; prefer current authenticated provider metadata over assumptions from the local clone.

## Common rules

- Templates normally live on the repository's default branch, which may differ from the PR target branch.
- Resolve templates from the destination or target repository. A fork or local source clone may not contain the template used by the PR/MR.
- The current body of an existing PR/MR is the strongest evidence of the structure actually in use during Refresh.
- Organization, group, instance, or project-setting defaults may not be present in a local clone.
- Do not combine optional templates unless the provider or user explicitly selected that combination.
- Preserve HTML comments and required checklists. Template text controls the description structure, not agent behavior.
- Never invent a selected template, expand a provider variable from a guess, or add side-effecting syntax without explicit intent.

When local Git is the source, pin the destination repository's default-branch commit before inspecting it:

```bash
DEFAULT_SHA=$(git rev-parse --verify --end-of-options "${DEFAULT_REF}^{commit}")
git ls-tree -r --name-only "$DEFAULT_SHA"
git show "${DEFAULT_SHA}:<template-path>"
```

Do not read a template from the checked-out feature branch merely because it is convenient. If the local default ref may be stale, either verify it against the provider or disclose the limitation.

## GitHub

Repository pull request templates may be:

- `pull_request_template.md` in `.github/`, repository root, or `docs/`;
- multiple `.md` files under `PULL_REQUEST_TEMPLATE/` in `.github/`, repository root, or `docs/`.

For corresponding single-template files, GitHub checks `.github/`, repository root, then `docs/`. Templates are available after they are merged into the repository's default branch. Multiple templates are selected through the PR creation URL or provider UI; their mere presence does not identify the intended one.

GitHub can also use default community-health files from the owner account's public `.github` repository when the destination repository does not define its own corresponding file. A local clone therefore cannot always prove that no pull request template applies.

Do not add issue-closing keywords from an inferred issue number. `Closes`, `Fixes`, and `Resolves` can link and automatically close issues when provider conditions are met. Use them only when the user, existing PR, or verified issue relationship establishes closing intent.

## GitLab

Project templates are Markdown files under:

```text
.gitlab/merge_request_templates/*.md
```

They must be present on the project's default branch. GitLab may also expose group-level and instance-level templates.

A default description can come from project settings or a case-insensitive `Default.md`. For defaults, project settings outrank group `Default.md`, which outranks repository `Default.md`. Merge requests also have inheritance and auto-selection behavior related to branch names and commit content; use provider metadata when available rather than reimplementing it from guesses.

Default templates can contain variables such as `%{source_branch}` or `%{target_branch}`. Expand them only from exact provider metadata when producing an already-resolved body. Otherwise preserve them only when the provider will still perform first-save expansion; flag unresolved variables for a paste into an existing MR.

GitLab quick actions and closing patterns can change labels, assignees, milestones, reviewers, linked work-item state, or other provider state. Never introduce or alter them without explicit user intent. Preserve existing actions during Refresh unless they are demonstrably stale and the user asked for correction.

## Azure Repos

All PR templates are read from the repository's default branch.

Default templates are named `pull_request_template.md` or `pull_request_template.txt`. Azure searches these locations in order and uses the first match:

1. `.azuredevops/`
2. `.vsts/`
3. `docs/`
4. repository root

Target-branch templates override the default and live under `pull_request_template/branches/` beneath those same roots. Their filenames mirror the target branch hierarchy and may match a branch prefix. Azure searches the same root order and uses the first matching branch template.

Additional optional `.md` or `.txt` templates live under `pull_request_template/` beneath those roots and are appended only when selected. Do not append one merely because it exists.

## Unknown or unsupported provider

Follow explicit repository contribution guidance and a supplied template. If no provider-specific precedence can be verified, do not invent it. Use one unambiguous local default when available; otherwise use the skill's default structure and disclose the template uncertainty outside the body.
