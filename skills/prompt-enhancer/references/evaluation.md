# Prompt Evaluation Protocol

Read this reference for `with-eval`, production prompt changes, repeatable application prompts, or a request to compare prompt quality empirically.

This skill designs an evaluation; it does not execute the original or enhanced prompt.

## 1. Define the decision

State what the comparison is intended to decide, such as:

- whether the enhanced prompt improves task fidelity;
- whether it reduces unsupported claims or side effects;
- whether output format becomes more reliable;
- whether it reduces context, latency, cost, or unnecessary tool use without lowering quality;
- whether it generalizes across normal and difficult inputs.

Do not use one vague overall score when several independent dimensions matter.

## 2. Define task-specific criteria

Choose observable criteria from the actual use case:

- required facts, actions, or artifacts are present;
- constraints and non-goals are respected;
- unsupported claims are absent;
- output parses or validates when machine-consumed;
- tool calls and external effects stay within authorization;
- failure and missing-information behavior is correct;
- tone, length, and audience fit the brief;
- latency, token use, tool count, or cost remain within a stated budget when relevant.

Classify criteria as hard pass/fail, graded, or informational. Weight severe safety, data-loss, or external-side-effect failures separately from style defects.

## 3. Build representative cases

For a compact starter, provide 3–7 cases covering the most important variation:

- normal input;
- boundary or unusually long/short input;
- missing required context;
- ambiguous or conflicting requirements;
- irrelevant or adversarial content when the workflow consumes untrusted data;
- a case likely to tempt scope expansion or an unauthorized side effect;
- a format or tool failure when applicable.

Use the user's real input distribution when available. Synthetic cases should reproduce real decision boundaries, not trivia invented only to favor the enhanced prompt.

Separate:

- **development cases** used while revising the prompt;
- **holdout cases** not inspected or tuned against until comparison time.

A 3–7 case starter is useful for iteration but is not evidence of broad production reliability.

## 4. Freeze the comparison setup

Run original and enhanced prompts under the same:

- exact model or snapshot;
- application or harness version;
- system/developer messages and instruction placement;
- tools, skills, schemas, permissions, and sandbox;
- input documents and conversation context;
- reasoning, verbosity, temperature, seed, or equivalent settings when supported;
- time, token, tool-call, and cost budget;
- retry and error-handling policy.

Record all differences. Do not attribute an improvement to prompt text when the environment changed.

When outputs are nondeterministic, compare multiple runs per case. Use the same run count and stopping policy for both prompts.

## 5. Grade appropriately

Prefer deterministic checks when possible:

- schema validation;
- exact or normalized match;
- executable tests;
- required/forbidden field checks;
- repository diff or file-state assertions;
- tool-call and side-effect logs.

Use human or model judging only for criteria that require it. For subjective comparison, randomize presentation order and blind the judge to which prompt produced each output where practical. Give the judge a task-specific rubric and allow ties or “insufficient evidence.”

Do not let an LLM judge infer hidden facts that are absent from the grading context.

## 6. Compare and report

Report:

- per-criterion results and severe failures;
- pass rate across development and holdout cases separately;
- run-to-run variance when multiple runs were used;
- latency, token, cost, or tool-use differences when measured;
- regressions introduced by the enhanced prompt;
- cases needing prompt, model, tool, data, or system changes rather than more wording.

Claim that the enhanced prompt is better only when the agreed criteria support that conclusion under a controlled comparison. Otherwise state that it is clearer by inspection but empirically unverified.

## Compact `with-eval` output

```markdown
## Evaluation starter

### Decision
[What this comparison will establish.]

### Cases
| # | Input condition | Expected behavior | Failure signal | Set |
|---|---|---|---|---|
| 1 | ... | ... | ... | Development/Holdout |

### Pass conditions
- [Objective criterion.]

### Comparison protocol
- Run both prompts under the same exact model, surface, roles, context, tools, permissions, configuration, and budget.
- Use [deterministic grader / blinded rubric / executable check].
- Repeat [when nondeterminism matters] and report variance.

### Important limitations
- [What this starter cannot establish.]
```
