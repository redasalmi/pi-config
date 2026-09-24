# Multi-role coding workflow

An opt-in Pi extension: Architect → Builder → optional Reviewer. Uses Pi's existing runtime, tools (including MCP and other extensions), skills, and model registry through the public Pi APIs. No extra dependencies or separate agent harness.

## Install and run

Already included when this repository is installed as a Pi package. To load only this extension for a trial:

```sh
pi -e /absolute/path/to/pi-config/extensions/workflow/index.ts
```

For persistent installation, add that file to Pi's `extensions` setting or use `pi config` to enable it from this package. Do not load both copies. `/reload` applies source changes.

```text
/workflow-models
/flow Implement customer address editing
/flow-stop
```

The selector lists **Pi's available authenticated models**, including custom providers. Choose architect, builder, reviewer, then `auto`, `always`, or `never`. Cancel any selector to discard the whole configuration change. No default model identities or silent substitutions. One model can fill every role.

**Single-shot modes (`pi -p` and `pi --mode json`) are unsupported.** `/flow` reports an extension error to stderr before reading configuration, changing workflow state, or invoking models/tools. Use interactive Pi instead. Pi currently leaves extension-command errors at exit code zero, so do not treat the single-shot exit code as a workflow outcome.

Use a **self-contained request**: previous chat messages, attachments, and implicit approvals are intentionally not transferred. Mention relevant file paths and constraints. Normal prompts are unchanged when no workflow is running.

## Pi tools and skills

Every role starts with the tools enabled in Pi when `/flow` was invoked, plus `workflow_handoff`. This includes MCP, browser, delegation, and other extension tools when available and enabled; there is no workflow-specific tool whitelist or MCP/subagent prohibition. Native tool loaders can register and enable additional tools during a phase. Each subsequent phase starts from the original enabled set, and the original set is restored when the workflow ends. Disabled tools are not force-enabled by the workflow.

Roles inherit Pi's skill descriptions and can load applicable `SKILL.md` files using normal tools. Each role loads the instructions it needs independently. You can name a skill explicitly, for example `/flow Redesign the settings page using the design-director skill`. Configure tools, MCP connections, and skills in Pi as usual; the workflow does not maintain separate integrations or permissions.

Role responsibilities, approval boundaries, and the session/context safeguards below still apply. Available capabilities do not grant permission to perform unrelated actions.

## Configuration

Choices are saved atomically to `~/.pi/agent/workflow.json` (or the directory selected by `PI_CODING_AGENT_DIR`). This is an extension-owned JSON file, not additional keys in Pi's settings. There are no project-local overrides or credential fields. Changes apply on the next invocation.

[workflow.example.json](workflow.example.json) shows the minimal shape. Replace its placeholders with actual `provider/modelId` values from Pi. IDs containing slashes work. Bare model IDs work only when unambiguous.

The implementation role is configured under `builder`. Existing `implementer` settings are accepted as a legacy alias, preserving the model and optional prompt; `/workflow-models` saves them under `builder`. Do not specify both keys. No manual migration is needed.

Each role accepts an optional `systemPrompt` string, **appended** to its role instructions and normal Pi/project instructions. Do not put secrets in prompts or handoffs.

| Setting               | Default | Meaning                                                     |
| --------------------- | ------- | ----------------------------------------------------------- |
| `review`              | `auto`  | `auto`, `always`, or `never`                                |
| `maxReviewIterations` | `2`     | Maximum builder correction passes after initial review; 0–5 |

`reviewer` may be omitted with `review: "never"`. All configured role models are validated before work begins. Availability means configured in Pi, not a guarantee of provider uptime, credits, or valid remote authentication. Runtime provider failures stop the workflow; the role/model is identified and native error details remain on its phase branch.

Model selection preserves optional role prompts and the review limit. Edit JSON for those advanced settings. Invalid configuration fails rather than falling back silently. Older `maxTurnsPerPhase` and `maxPlanRevisions` settings are accepted but ignored; saving configuration through `/workflow-models` removes them. No manual configuration migration is needed.

## Execution and context boundaries

1. Save a session-tree checkpoint and current model, thinking level, and tools.
2. Switch to the architect model. Investigate using normal tools; return a structured plan or up to three clarification questions.
3. Archive that phase on its own session-tree branch without an LLM summary. Start the builder with only the request, paired clarification questions and answers, and plan.
4. Implement and validate. Return a compact cumulative result, or `PLAN_BLOCKED` with reason, evidence (including partial changes), and suggested reconsideration.
5. Review when configured/justified. Transfer the request, plan, and result, not exploration logs. The reviewer inspects targeted current files/diffs through tools and returns actionable issues, never edits.
6. Apply bounded corrections and re-review, or report outstanding issues. Restore the original branch/model/thinking/tools and post a normally styled Markdown summary: what changed, files, validation checks/results, review outcome, any deviations or remaining issues, and per-role model identifiers with token totals. There is no colored result box and no extra model call to write this summary.

Plans include summary, decisions, affected files, concrete steps, constraints, acceptance criteria, validation commands, optional essential context, and review reasons. Results include changed files, validation commands/outcomes/status, deviations, unresolved issues, and review reasons. `workflow.ts` contains the small TypeBox schemas. Pi validates tool arguments; semantic validation enforces role-specific payloads and a 24,000-character handoff limit. Malformed handoffs get normal tool-error feedback so the role can correct them.

`/tree` retains the original phase transcripts and `workflow-handoff` entries for inspection. Only the final compact result is added to the original conversation. The footer names each started role's resolved `provider/modelId` alongside its token total (including failed attempts and repeated phases). Roles that never started are marked `not run` with zero tokens. Usage totals sum Pi's reported `usage.totalTokens`, including reported cache tokens and repeated calls—not estimates or unique context size. Pi's native session totals still include all branches.

### When auto-review runs

Review runs for either role's explicit risk reasons (security, large/risky work, architecture/API/schema changes), deviations, unresolved issues/uncertainty, failed or missing validation, more than eight reported changed files, or a reported changed file outside the plan. A successful small change with none of those signals skips review. Once review requests corrections, subsequent fixes are always re-reviewed within the bound.

Risk and validation signals are model reports, **not an independent filesystem audit**. Instruct the builder to inventory all changes, including shell-generated and untracked files. Use `always` when an independent review is important. Pre-existing failures may still justify review; review approval never changes a reported failed validation into a pass.

Two correction passes means at most three reviews: initial review, fix/review, fix/review. This limit is unchanged and is not reset by replanning. Reaching it reports outstanding review issues, not success.

Running phases have **no extension-imposed turn limit or execution deadline**. Replanning and clarification also continue as needed without counters that stop the flow. Repeated blocked plans can therefore keep consuming tokens until resolved or cancelled with `/flow-stop`.

A startup-only watchdog reports failure if a role prompt does not reach its first context event within 15 minutes, including time spent in asynchronous input and `before_agent_start` hooks. It is cleared before the first model request and does not limit model work or tool execution. Provider failures, cancellation, and the context-isolation safeguards below can still interrupt a workflow; removing work limits is not a guarantee that every request can finish.

`/flow` returns control to Pi's interactive loop as soon as setup completes; the roles then run as an extension-owned background task. This keeps `/flow-stop` dispatchable through normal Pi input while a phase is starting, even when an asynchronous `input` or `before_agent_start` hook is still pending and Pi reports itself idle. The busy guard stays held for the whole run through finalization, so duplicate `/flow` invocations, ordinary prompts, and session navigation remain rejected until restoration finishes.

## Permissions, cancellation, and limitations

- Roles run sequentially in the **existing Pi runtime**, not bare SDK child sessions. This preserves live permission extensions, tool overrides (including remote/sandbox backends), provider registrations, and authentication. SDK sessions do not expose automatic inheritance of that live extension state.
- Isolation is **model-visible conversation isolation**, not separate processes or filesystem isolation. A `context` hook exposes only the current phase's handoff and subsequent messages. Normal Pi/project system instructions are shared; role-specific prompts and prior phase tool output are not copied.
- All already-active Pi tools are retained for every role, with native dynamic tool loading supported. Existing tool overrides remain intact. If Pi's explicit tool allowlist excludes `workflow_handoff`, enable it before starting.
- The workflow adds **no per-command approval prompts**. All roles use normal Pi shell execution; existing permission/sandbox extensions can still block commands or ask for approval. This extension does not auto-approve or bypass their checks and adds no shell execution implementation.
- Architect and reviewer are instructed to inspect only, but have the same enabled tools as the builder. Role instructions are not read-only enforcement; tools can mutate files or external services. Pi itself is not a sandbox; use your existing permission/sandbox setup for untrusted work.
- Esc aborts the current agent normally; `/flow-stop` also cancels clarification. Cancelled prompt markers remain guarded after cleanup, and late preflight completions are aborted before provider invocation. Until a cancelled preflight drains, new workflows, `/workflow-models`, ordinary prompts, and session navigation remain fenced. Completion events are correlated to their originating prompt, including failures that never reach `context`; unrelated events cannot release the fence or complete a phase. Partial edits are never rolled back, stashed, committed, or pushed automatically. New prompts and session navigation are blocked while running. Other extensions can still have effects; do not run competing orchestrators or model changes concurrently.
- Automatic/manual compaction is cancelled during a workflow, and the phase stops, because native compaction could otherwise summarize the original conversation outside the context filter. Start from `/new` if existing session context is already near its limit; split tasks that exceed a role's context window.
- Pi's fire-and-forget prompt API does not expose every preflight outcome. If a hook never returns, consumes the prompt without a settlement event, or preflight fails before emitting one, the workflow cannot confirm drainage and conservatively retains the fence. The result/status and rejected requests explain this. Wait for the hook to finish or restart the Pi process; do not rely on `/reload` to cancel pending async hooks.
- If another extension vetoes tree navigation, work stops and restoration is reported as incomplete. Use `/tree` to return to `workflow-checkpoint`. On reload/exit the workflow stops and attempts to restore tools/model, but does not automatically resume; an interrupted phase may remain selected. Its checkpoint remains in `/tree`.
- Trusted extensions can modify prompts, context, and tool inputs after these hooks. This is not a security boundary against other installed extensions or repository prompt injection.
- No conversation export, environment inspection, credential copying, or external telemetry is implemented. Structured handoffs and transcripts remain in Pi's normal session storage. Model providers necessarily receive their role's request/context through Pi.

## Design size and removal

Three source files: `index.ts` binds Pi commands/events, `workflow.ts` holds schemas and the sequential flow with bounded review corrections, `config.ts` handles configuration and exact model lookup. There is no workflow engine or persistent task state.

Disable this extension in `pi config`, remove its explicit settings path, or stop launching with `-e`. Optionally remove the extension-owned `workflow.json`. Existing Pi sessions remain readable; no migrations or cleanup jobs are needed.

## Verification

```sh
npm run test:workflow
npm run typecheck
```

Tests cover config/model validation, handoff validation, context filtering, auto-review, unchanged correction bounds, continued replanning/clarification, and real Pi SDK sessions with an offline mock provider. The SDK tests verify shell inspection without workflow approval prompts, inheritance of all enabled tools, offline MCP-style dynamic tool registration/loading, per-role skill loading, inherited permission gates (including extension tools), disabled-tool preservation, provider failure/cancellation, more than 40 turns per role and simulated elapsed time beyond 15 minutes, startup-failure handling, cancellation/timeouts during delayed prompt preflight (including fenced restarts, unrelated completion events, and a pending read tool after a safe restart), role isolation, archival, model/token reporting, and restoration. They also drive `/flow` and `/flow-stop` through Pi's real editor-submit handler and `getUserInput` queue to confirm that a phase-startup cancellation is dispatched while the startup hook is still pending, that duplicate `/flow` is rejected mid-run, and that a later workflow still succeeds; separate coverage forces a finalization error to confirm it is reported, the busy guard is released, and the detached task does not reject unhandled. Result rendering is checked at 40 and 100 columns in Pi's dark and light themes. A regression test uses Pi's actual print-mode runner to verify visible rejection without model/tool calls or session changes. They make no paid provider calls and change only temporary test directories.
