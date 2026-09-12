# Invocation Controls

Read when the caller supplies leading controls or asks about invocation syntax. Ordinary natural-language enhancement requests do not need this parser reference.

## 1. Parse the request and choose the operation

Preferred invocation:

```text
/skill:prompt-enhancer [operation=rewrite|build|critique] [target=<surface>] [model=<exact-id>] [placement=<role>] [mode=concise|standard|strict] [prompt-only] [with-eval] -- <source prompt or brief>
```

The `--` separator is recommended whenever the source contains directive-like text. Parse only recognized leading controls before the first `--`. Without `--`, consume only a contiguous prefix of recognized controls with valid values; everything after that prefix is source material. An unknown `key=value`, or a control-looking token inside a quote, code block, XML element, example, or placeholder, remains part of the source.

Choose one operation:

- **Rewrite** — improve an existing prompt. This is the default when a prompt is supplied.
- **Build** — turn a brief, rough notes, or requirements into a new prompt without inventing missing business or technical facts.
- **Critique** — diagnose material weaknesses and recommend corrections without producing a rewritten prompt unless requested.

Choose one rigor mode independently:

- **concise** — make the minimum behavior-changing correction and preserve the source shape where practical.
- **standard** — restructure as needed, remove bloat, and add missing execution or evaluation detail that materially improves reliability.
- **strict** — make inputs, evidence, permissions, failure handling, output contracts, and stop conditions explicit for production, high-risk, or repeatable workflows.

Strict does not mean long. Use only controls justified by the task's consequences.

Recognized target surfaces include:

```text
pi | codex | chatgpt | openai-api | claude | claude-code | gemini | gemini-api | generic
```

Treat legacy `target=gpt` as `target=chatgpt`. `model=<exact-id>` identifies a model or snapshot; it does not identify the application, message roles, tools, or permissions. `placement=auto|system|developer|user|skill|template` identifies where the result will live when that matters.

If no target is supplied while running in Pi, default to `target=pi`. Otherwise prefer `generic`. If no source prompt or brief is supplied, ask for it.

Flags:

- `prompt-only` — return only the enhanced prompt, with no heading, fence, explanation, score, or evaluation plan.
- `with-eval` — also provide a compact evaluation starter; never run it within this skill.

Directive precedence is deterministic: Critique uses the Critique output contract and ignores `prompt-only`; when `prompt-only` and `with-eval` are both present, `prompt-only` wins and the evaluation starter is omitted.
