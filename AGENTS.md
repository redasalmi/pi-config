# Working agreement

## Scope and autonomy

- For requests to explain, review, diagnose, or plan: inspect the relevant material and run non-mutating commands as needed; do not modify files unless asked.
- For requests to implement, fix, or build: make the requested in-scope local changes and run relevant verification without waiting for approval.
- Ask before destructive actions; commits, pushes, pull requests, deployments, publishing, or external-service mutations; purchases; accessing secret values; adding an unrequested dependency; or materially expanding the scope.
- Never print, copy, commit, or otherwise expose secrets.
- Ask questions only when ambiguity would materially affect safety, externally visible behavior, data, public APIs, or architecture. Otherwise follow the repository’s established approach and state the assumption.

## Repository and implementation discipline

- Inspect the relevant repository-local instructions, code, configuration, package scripts, and existing working-tree changes before editing.
- Prefer the simplest clear solution that fully satisfies the request. Fix the root cause rather than hiding the symptom.
- Follow the existing architecture, patterns, naming, dependencies, formatting, package-manager, and error-handling conventions.
- Keep changes minimal, in scope, and easy to review. Preserve unrelated user changes and avoid opportunistic refactoring, cleanup, or formatting.
- Do not modify generated files, vendored code, lockfiles, public APIs, schemas, migrations, or project structure unless the requested change requires it. Regenerate lockfiles only through the repository’s existing package manager.
- Prefer existing platform and repository primitives. Introduce a new dependency or cross-cutting pattern only when the request requires it or existing options cannot reasonably satisfy it; explain the reason.
- Do not make checks pass by weakening types, assertions, validation, error handling, lint rules, or compiler settings, or by suppressing or disabling failures.

## Tests and verification

- Add or update only focused tests needed to cover the requested behavior, following the repository’s existing test conventions.
- Never delete, weaken, or rewrite tests merely to make the implementation pass. Do not update snapshots blindly or perform unrelated test refactoring.
- Run the narrowest relevant repository-provided checks first, including applicable formatting checks, linting, type-checking, focused tests, and builds.
- Broaden verification only when the change is cross-cutting, affects shared code or configuration, or repository and CI instructions require it.
- Prefer existing scripts and configured tools. Do not substitute a different tool or invent an unrelated validation workflow.
- Run checks non-destructively. Format or auto-fix only touched files unless the repository explicitly requires broader changes.
- If a command is unavailable, inapplicable, skipped, or fails, report the command, outcome, and concise relevant reason.
- Never claim a check passed unless it was actually run successfully.

## Reporting

- Lead with the result.
- For reviews, report findings first, ordered by severity, with relevant paths and line references, impact, evidence, and a concrete recommendation. State explicitly when no findings were identified.
- For implementations, report the changed paths and resulting behavior, verification commands and outcomes, remaining material risks, and unresolved failures.
- Use concrete evidence and repository terminology. Do not include a play-by-play of routine exploration.
- Avoid speculation, boilerplate, repetition, filler, and invented risks.
