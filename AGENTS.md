# Working agreement

## Scope and autonomy

- For requests to explain, review, diagnose, or plan: inspect without editing tracked content or existing user files unless asked. Safe disposable worktrees and temporary verification artifacts are allowed; preserve the original working tree and remove only disposable artifacts created by the task.
- For requests to implement, fix, or build: make the requested in-scope local changes and run relevant verification without waiting for approval.
- Require explicit approval before destructive actions; commits, pushes, pull requests, deployments, publishing, or external-service mutations; purchases; accessing secret values; adding an unrequested dependency; or materially expanding the scope. A direct, explicit request or prior approval covers only its stated action, target, and scope; ask again if these materially change or a separate confirmation is required by project policy.
- Approval confirmations are separate from clarification questions. Complete safe, already-authorized preparation before requesting approval, and continue independent authorized work when another part is blocked.
- Never print, copy, commit, or otherwise expose secrets.
- Ask clarification questions only when ambiguity would materially affect safety, externally visible behavior, data, public APIs, or architecture. Otherwise follow the repository’s established approach and state only material assumptions.

## Repository and implementation discipline

- Inspect the relevant repository-local instructions, code, configuration, package scripts, and existing working-tree changes before editing.
- Prefer the simplest correct solution that fully satisfies the request. Fix the root cause rather than hiding the symptom; do not trade correctness or maintainability for a smaller diff.
- Write human-readable code with clear names and straightforward control flow. Prefer explicit, easy-to-understand code over clever tricks or compressed expressions.
- Add comments only when necessary to explain non-obvious intent, constraints, or tradeoffs that clear code cannot convey, or to satisfy required documentation. Keep them brief and local. Do not restate obvious code, add decorative section banners, or routinely comment every function, block, or line.
- Do not overengineer: avoid speculative features, premature optimization, and abstractions or configuration that the current task does not need.
- Follow the existing architecture, patterns, naming, dependencies, formatting, package-manager, and error-handling conventions. Use a different approach only when the established approach cannot reasonably satisfy the request; explain why.
- Make the smallest coherent change that achieves the goal. Preserve unrelated user changes and avoid opportunistic refactoring, cleanup, or formatting.
- Preserve existing application behavior, user flows, and integrations unless changing them is necessary to fulfill the request. Keep necessary behavior changes narrowly scoped and report their impact.
- Do not modify generated files, vendored code, lockfiles, public APIs, schemas, migrations, or project structure unless the requested change requires it. Regenerate lockfiles only through the repository’s existing package manager.
- Prefer existing platform and repository primitives. Introduce a new dependency or cross-cutting pattern only when the request requires it or existing options cannot reasonably satisfy it; explain the reason.
- Do not make checks pass by weakening types, assertions, validation, error handling, lint rules, or compiler settings, or by suppressing or disabling failures.

## Tests and verification

- Never write, add, modify, delete, or regenerate tests or test snapshots. Running existing tests non-destructively remains allowed.
- If the user’s requested changes make existing tests outdated, only report the affected test paths and explain which expectations no longer match the intended behavior and why. Leave the tests unchanged; do not assume a failing test is outdated without evidence.
- Run the narrowest relevant repository-provided checks first, including applicable formatting checks, linting, type-checking, focused tests, and builds.
- Broaden or repeat verification only when required by the user, repository, or CI, or justified by cross-cutting impact, new changes, failures, or concrete unresolved concerns. Otherwise stop once the relevant checks pass.
- Prefer existing scripts and configured tools. Do not substitute a different tool or invent an unrelated validation workflow.
- Run checks non-destructively. Format or auto-fix only touched files unless the repository explicitly requires broader changes.
- Report failed or unavailable relevant checks and material verification gaps, including the command, outcome, and concise reason where applicable. Omit inapplicable checks.
- Never claim a check passed unless it was actually run successfully.

## Reporting

- Lead with the result.
- For reviews, report findings first, ordered by severity, with relevant paths and line references, impact, evidence, and a concrete recommendation. State explicitly when no findings were identified.
- For implementations, report the changed paths and resulting behavior, verification commands and outcomes, remaining material risks, and unresolved failures.
- Use concrete evidence and repository terminology. Do not include a play-by-play of routine exploration.
- Avoid speculation, boilerplate, repetition, filler, and invented risks.
