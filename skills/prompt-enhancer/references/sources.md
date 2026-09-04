# Prompt Engineering Sources and Applied Decisions

This provenance file is intentionally separate so routine enhancement does not consume source summaries.

**Last source verification:** 2026-09-04. Model, API, harness, role, structured-output, and prompting guidance changes quickly. Re-verify exact-model advice and prefer task-specific evals over transferring behavior between generations.

## OpenAI

- [Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering)
  - Separates higher-authority application instructions from dynamic user input.
  - Recommends typed inputs or schemas for dynamic values, representative fixtures and evals for production prompts, and Markdown/XML for logical boundaries.
- [Reasoning best practices](https://developers.openai.com/api/docs/guides/reasoning-best-practices)
  - Recommends simple, direct prompts, clear delimiters and end goals, no chain-of-thought requests, and zero-shot before closely aligned few-shot examples.
- [Working with evals](https://developers.openai.com/api/docs/guides/evals)
  - Frames evaluation as specifying behavior, running test inputs, analyzing results, and iterating.
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
  - Distinguishes function calling from structured response schemas and schema adherence from ordinary JSON mode.
- [Prompting in ChatGPT and Codex](https://learn.chatgpt.com/docs/prompting)
  - Favors result-first tasks with useful context, explicit outputs and boundaries, and approval before external side effects.

**Applied:** separate surface, role, runtime configuration and prompt text; keep dynamic data out of stable instruction layers; use schemas outside prose when available; avoid hidden-reasoning rituals; and require controlled evaluation before claiming improvement.

## Anthropic

- [Prompt engineering overview](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview)
  - Establish success criteria and empirical tests before tuning; not every system failure is best solved by prompt wording.
- [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
  - Recommends clear instructions, useful context, relevant and diverse examples, and XML for genuinely complex boundaries.
- [Define success criteria and build evaluations](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests)
  - Uses multidimensional, task-specific criteria, real input distributions, edge cases, and automated grading where practical.
- [Mitigate jailbreaks and prompt injections](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks)
  - Distinguishes direct from indirect prompt injection and keeps third-party or tool content separate from governing instructions.

**Applied:** add an explicit transformation boundary, preserve untrusted content as data, use examples and XML selectively rather than universally, and distinguish prompt defects from model, tool, data, or system defects.

## Google

- [Prompt design strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)
  - Recommends clear, specific instructions, relevant context, examples where useful, and explicit output formats.
- [Gemini 3 developer guide](https://ai.google.dev/gemini-api/docs/generate-content/gemini-3)
  - Current reasoning-model guidance favors concise, direct instructions and warns that verbose legacy prompting can cause over-analysis.
- [Structured output](https://ai.google.dev/gemini-api/docs/structured-output)
  - Uses JSON Schema to produce predictable machine-consumed responses where supported.

**Applied:** avoid provider-wide universal rules; tune to the exact model and surface, keep API settings outside prompt prose, and validate model-specific guidance empirically.

## Pi and Agent Skills

- Pi [Skills documentation](https://pi.dev/docs/latest/skills)
  - Pi always loads skill names and descriptions, loads the full `SKILL.md` on demand, and appends slash-command arguments as user input.
  - Specific routing descriptions reduce accidental activation and name collisions keep the first discovered skill.
- [Agent Skills specification](https://agentskills.io/specification)
  - Recommends progressive disclosure, a main `SKILL.md` below 500 lines and roughly 5,000 tokens, shallow relative references, and focused resources loaded only when needed.

**Applied:** narrow this skill to AI prompts rather than ordinary writing or neighboring PR/QA skills; define an unambiguous directive delimiter; keep operational guidance in `SKILL.md`; and move target-specific and evaluation detail into focused references.
