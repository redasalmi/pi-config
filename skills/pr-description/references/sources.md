# PR Description Sources and Applied Decisions

This provenance file is not required for routine use.

**Last source verification:** 2026-09-04. Re-check provider template precedence, inherited-template behavior, issue-closing syntax, and CI metadata semantics during major revisions.

## GitHub: review context and branch scope

- [Helping others review your changes](https://docs.github.com/en/pull-requests/concepts/helping-others-review-your-changes)
  - Clear titles and descriptions explain the problem, approach, result, and areas needing reviewer attention.
  - Self-review should inspect the diff, accidental changes, and relevant checks.
  - Generated summaries still require human/contextual review.
- [Branches: comparing branches in pull requests](https://docs.github.com/en/pull-requests/reference/branches#comparing-branches-in-pull-requests)
  - GitHub PRs compare head against base and show a three-dot merge-base-to-head diff.
  - This view focuses on what the topic branch introduces since divergence.

**Applied:** pin base and head commits, summarize the merge-base-to-head patch, inspect every material diff group, and direct reviewers to nonlinear or risky areas.

## GitHub: templates, inherited defaults, and linked issues

- [Creating a pull request template for your repository](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository)
  - A single `pull_request_template.md` may live in `.github/`, repository root, or `docs/`.
  - Multiple templates may live in `PULL_REQUEST_TEMPLATE/` beneath those roots and are selected through a query parameter/provider flow.
  - Templates become available after entering the repository's default branch.
- [Creating a default community health file](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file)
  - An owner account's public `.github` repository can supply default issue and PR templates when a destination repository does not define its own corresponding file.
  - These inherited files are not present in the destination clone.
- [Linking a pull request to an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)
  - Supported keywords in a PR description can link and automatically close issues when provider conditions are met.

**Applied:** resolve templates from the default branch, do not choose among optional templates arbitrarily, disclose inherited-template uncertainty, and never add closing keywords from an inferred issue number.

## GitLab templates and merge-request side effects

- [Description templates](https://docs.gitlab.com/user/project/description_templates/)
  - Project MR templates are `.md` files in `.gitlab/merge_request_templates/` on the default branch.
  - Projects can inherit group and instance templates.
  - A default can come from project settings or `Default.md`; project settings outrank group `Default.md`, which outranks repository `Default.md`.
  - Default MR templates can contain provider-expanded variables and quick actions.
- [Create merge requests](https://docs.gitlab.com/user/project/merge_requests/creating_merge_requests/)
  - Branch/issue workflows can prefill closing patterns and link work items.
  - Merge requests created from forks may involve a target project different from the local source repository.

**Applied:** prefer exact provider MR metadata, account for inherited/default precedence, do not guess variable expansion or template selection, and treat quick actions and closing patterns as side-effecting syntax.

## Azure Repos templates

- [Improve pull request descriptions using templates](https://learn.microsoft.com/en-us/azure/devops/repos/git/pull-request-templates?view=azure-devops)
  - All Azure PR templates come from the default branch.
  - Branch-specific templates override defaults.
  - Default and branch-template roots are searched in this order: `.azuredevops/`, `.vsts/`, `docs/`, repository root.
  - Additional templates are appended only when explicitly selected.

**Applied:** reproduce Azure's target-branch and location precedence rather than selecting the first arbitrary file found in the repository.

## Google Engineering Practices

- [Writing good CL descriptions](https://google.github.io/eng-practices/review/developer/cl-descriptions.html)
  - A change description is a durable public record explaining what changed and why.
  - Its opening should be short, focused, and able to stand alone.
  - The body should include problem context, approach, tradeoffs, shortcomings, and useful references.
  - Descriptions should be rechecked because the change may evolve during review.

**Applied:** use outcome-led titles and summaries, preserve valuable author rationale during Refresh, remove stale claims, and disclose material tradeoffs without narrating every file.

## Microsoft pull-request guidance

- [Get feedback with pull requests](https://learn.microsoft.com/en-us/devops/develop/git/git-pull-requests)
  - Reviewers need a clear description of the change and trustworthy evidence that the relevant build or behavior works.
  - Out-of-scope improvements should remain separate rather than muddying the current PR.

**Applied:** keep the description conceptually focused, distinguish current verification from test code, and put deliberate follow-ups in a separate section.

## Git revision and comparison semantics

- [git-rev-parse](https://git-scm.com/docs/git-rev-parse)
  - `^{commit}` ensures a name resolves to a commit-ish.
  - `--end-of-options` prevents a supplied revision name from being parsed as an option.
- [git-diff](https://git-scm.com/docs/git-diff)
- [git-merge-base](https://git-scm.com/docs/git-merge-base)

**Applied:** resolve immutable commit IDs once, use the merge base explicitly, and keep `git log base..head` set semantics distinct from merge-base-to-head diff semantics.

## Pi and Agent Skills structure

- [Pi Skills documentation](https://pi.dev/docs/latest/skills)
  - Pi keeps skill names and descriptions in context, then loads the complete `SKILL.md` only when the task matches.
  - The description should be specific because it controls routing.
- [Agent Skills specification](https://agentskills.io/specification)
  - A skill uses one root `SKILL.md`, may contain focused references, and should use progressive disclosure.
  - The main file is recommended to stay below 500 lines, with shallow relative references.

**Applied:** narrow the routing description against code review, implementation, release notes, commit messages, and QA-step generation; keep provider details and provenance in focused references.
