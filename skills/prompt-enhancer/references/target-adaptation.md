# Target and Surface Adaptation

Read this reference only when the user requests adaptation to a named model, provider, application, API, coding harness, message role, or runtime.

## Separate the dimensions

Record these independently:

| Dimension | Examples | Why it matters |
|---|---|---|
| Provider | OpenAI, Anthropic, Google | Documentation and API vocabulary |
| Exact model | A dated snapshot or exact model ID | Prompt behavior and feature support can change |
| Surface/harness | Pi, Codex, ChatGPT, Claude Code, API application | Available tools, surrounding instructions, persistence, and approvals |
| Placement | system, developer, user, skill, reusable template | Instruction authority and separation from dynamic input |
| Runtime configuration | tools, schemas, reasoning/verbosity, sandbox, permissions | Often cannot be controlled reliably through prose |
| Output consumer | human or software | Natural language versus structured contract |

Do not infer one dimension from another. When a detail is unknown, use portable capability-based language.

## General adaptation rules

- Use the current official documentation for exact model or API claims. Date the claim when the advice is likely to change.
- Prefer observed eval results for the user's real task over provider-wide folklore.
- Keep model parameters, tool definitions, role assignment, structured-output schemas, token limits, sandbox permissions, and retry policy in runtime configuration when the surface supports them.
- Do not tell a model it has browsing, files, vision, code execution, memory, or a particular tool unless that capability is available in the target surface.
- Do not include local usernames, absolute paths, environment values, or installed-tool names in prompts intended for other machines.
- Preserve a generic fallback when exact model information is absent.

## Pi

Pi discovers a skill from its name and description, then loads the full `SKILL.md` when selected. Arguments after `/skill:<name>` become user input appended to the skill.

For Pi prompts:

- state the end result, repository scope, evidence, permissions, and completion condition;
- let the agent inspect repository instructions and choose ordinary commands;
- mention an installed matching skill by name only when its availability is known and its workflow is actually needed;
- do not duplicate a skill's full instructions inside the task prompt;
- use capability-based wording when the prompt may run under another Pi configuration;
- distinguish local reversible work from external writes, destructive operations, secrets, and material scope expansion.

## Codex and other coding agents

A useful coding-agent prompt normally specifies:

- the intended implementation or diagnostic result;
- the relevant repository area and behavior to preserve;
- whether editing is authorized;
- the smallest relevant verification and what to report;
- non-goals and external-write boundaries;
- blocker behavior when required context or services are unavailable.

Do not force an implementation task to stop at a plan. Do not prescribe a long command sequence unless command choice is part of the requirement.

## ChatGPT or another interactive chat surface

A one-off chat prompt should be self-contained enough for the current turn. Include source material or attachments explicitly, state the desired output, and avoid API-only role or schema language unless the user will actually configure it.

Conversation context may supply facts, but a prompt intended for reuse outside the current chat must carry every required input or placeholder itself.

## OpenAI API

Separate stable application instructions from dynamic user input. Use supported message roles and pass variable data through typed application inputs where practical.

For machine-consumed output, prefer the API's structured-output or function/tool schema mechanism when supported. Describe the semantic contract in the prompt, but keep the actual schema and tool configuration in code or runtime configuration.

Current OpenAI reasoning-model guidance favors direct prompts, clear delimiters, specific end goals, no chain-of-thought requests, and zero-shot prompting before closely aligned examples. Re-check the exact model documentation before adding snapshot-specific syntax or settings.

## Claude and Claude Code

Claude guidance favors clear, explicit instructions. XML can help when a prompt combines multiple documents, instructions, examples, and variable inputs, but it is not required for ordinary prompts.

Relevant, diverse, well-delimited examples can strongly steer format and edge behavior. Use them only when the task benefits from them and validate their effect against the exact model. Claude Code additionally requires coding-agent scope, permissions, tools, and verification to match its actual environment.

## Gemini and Gemini API

Current Gemini reasoning-model guidance favors concise, direct prompts and warns that verbose legacy prompting can cause over-analysis. For long data inputs, exact placement guidance can differ by model generation; use the current model documentation rather than applying one universal “instructions first” or “instructions last” rule.

Keep search grounding, function declarations, schemas, thinking settings, and media settings in API configuration rather than prose when applicable.

## Generic or unknown target

Use robust cross-model guidance:

- clear desired result;
- necessary context and delimiters;
- concrete constraints and output contract;
- uncertainty rather than guessing;
- permission and stop rules only when side effects exist;
- no private chain-of-thought request;
- no unsupported tool or capability claim.

Avoid provider-specific tokens, roles, parameters, or claims.
