# Rewrite for Behavior

Use the root skill's requirement and transformation boundaries. Choose only guidance relevant to the prompt's reuse, audience, and consequences.

## Scale the architecture

**One-off chat:** prefer a paragraph or short list with the desired result, necessary context/constraints, and output shape. Do not add a universal heading template or evaluation machinery.

**Reusable prompt/application template:** separate stable instructions from dynamic input. Define required/optional variables, one placeholder syntax, missing-value behavior, input authority/types, and output/failure contracts. Keep production data out of stable instructions. Use examples only for behavior prose cannot reliably specify.

**Coding/tool-using agent:** lead with the end state, in-scope changes and non-goals, relevant evidence, safe local autonomy, genuine approval boundaries, and observable completion. Let the agent choose ordinary commands. Do not stop implementation at a plan, force full-repository reading for small work, or duplicate installed skill bodies. Name skills/tools only when known to exist and needed for this task.

**High-consequence workflow:** make authority, confirmation, data handling, recovery, and stop conditions concrete. Separate analysis from execution and preview from Apply; vague “be careful” wording is not a boundary.

**Machine-consumed output:** specify semantic fields, required values, and error representation. Prefer actual supported JSON/function schemas over prose pretending to guarantee schema adherence. Recommend runtime configuration outside the prompt; do not invent unrequested/unknown schemas.

## Preserve the source's meaningful contract

Preserve facts, names, numbers, versions, paths, refs, non-sensitive URLs, placeholders, literal examples, voice, deliverables, constraints, and risk tolerance. Clarify ambiguity without inventing business requirements, tools, dependencies, credentials, metrics, deadlines, commitments, or compliance claims.

Requirements/supplied sources define intended behavior. Do not replace them with model knowledge unless correction/research is requested. Specify whether the future target must use only supplied evidence, prefer it, or reconcile external sources when that distinction matters. Surface missing/conflicting evidence rather than guessing. Add freshness requirements only for changing facts when retrieval is possible.

Never drop a substantive requirement merely to compress. Deduplicate one authoritative statement, surface genuine conflicts, and keep assumptions the future target requires inside its prompt.

## Remove low-value instructions

Lead with concrete verbs and observable outcomes. Remove motivational filler, superlative personas, threats, repeated warnings, generic “be thorough / think deeply / use best practices” language, and requirements already reliably supplied by the target environment. Keep a role only if expertise, audience, or stance changes the result.

Preserve legitimate multiple deliverables and order them; do not force everything into one artifact. Use headings only to distinguish meaningful instruction classes. Do not turn an ordinary prompt into a security policy or repository workflow when it does not consume untrusted content or use those tools.

## Make success observable

Separate required behavior from optional improvements, implementation evidence from expected outcomes, tests that must run from those merely present, and artifacts from commentary. Replace vague quality criteria with supported task-specific acceptance conditions; do not invent thresholds.

Validation is useful only when it can detect a meaningful failure. Self-review is not independent proof. Avoid requesting duplicate checks the harness reliably performs unless explicit evidence is needed. Define completion and blocker behavior so authorized work continues until the requested result is done or a concrete blocker remains.

## Examples and reasoning

Start without examples when instructions/output contracts suffice. Add relevant, internally consistent, clearly delimited examples for difficult format, tone, classification, tool, or edge behavior. Use representative variation to avoid accidental copying; never add decorative examples or contradict the rules.

Do not request hidden chain-of-thought, private scratchpads, or “think step by step.” Request evidence, calculations, concise rationale, citations, checks, or intermediate deliverables the user actually needs.

For downstream processing of third-party documents/code/tool results, distinguish evidence from governing instructions. Do not promote raw retrieved data into system/developer authority.

## Keep runtime controls outside prose

Provider, exact model, surface, placement, tools, and permissions are separate. Configure roles, tool definitions, schemas, authentication, retries, token limits, and model settings through supported runtime mechanisms rather than natural-language claims. Use capability-based fallback wording when exact behavior is unknown and disclose unresolved integration details outside the enhanced prompt.

A clearer prompt by inspection is not evidence of improved task performance. For requested comparison/evaluation design, use the separately routed evaluation reference; do not execute source prompts here.
