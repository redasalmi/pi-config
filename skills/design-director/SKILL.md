---
name: design-director
description: Designs, implements, or critiques interfaces when visual or interaction judgment is central. Use for design reproduction, UI redesign, visual direction, or rendered visual QA; not nonvisual logic or mechanical CSS edits.
metadata:
  author: local
  version: "4.0.0"
---

# Design Director

Turn product evidence into a coherent interface. Distinctiveness should fit the product, content, audience, and platform—not accumulate fashionable effects.

## Select the task

Infer one mode and one change posture from the request:

- **Direction:** establish or explore the visual/interaction direction and recommend a path; do not code unless asked.
- **Implement:** choose or inherit a direction, edit, render, correct material issues, and verify through completion.
- **Review:** inspect rendered evidence and behavior, report findings, and do not edit unless asked.

Postures are **Reproduce** for an authoritative supplied design, **Preserve and extend** by default for an existing product, **Redesign** when changing its language is authorized, and **Greenfield** when establishing new foundations.

Resolve decisions by user/repository requirements, authoritative design and product behavior, existing brand/system, target-platform behavior and accessibility, then this skill's heuristics. Inspiration is not a pixel specification. A complete specification is not permission for personal redesign.

Inspect evidence before asking questions. Make delegated reversible choices yourself; ask only when missing information materially changes behavior, brand, platform, or scope. Scale work to the requested component or product; do not manufacture project-wide deliverables.

## Load only the needed guidance

- **Establishing or changing direction:** read [references/direction.md](references/direction.md). Explore alternatives only when they help resolve a genuinely open decision; recommend one. Honor a requested option count, otherwise let the decision determine the useful number.
- **Implementing:** read [references/implementation.md](references/implementation.md). Preserve the existing system unless change is authorized.
- **Meaningful visual implementation or rendered review:** read [references/visual-qa.md](references/visual-qa.md). It owns the inspection loop, severity definitions, and finding format. For an isolated fix, use a representative render and checks proportionate to the change.
- **Responsive web, custom controls, localization, or desktop work:** read the relevant sections of [references/platforms.md](references/platforms.md); desktop work requires its target-platform guidance.
- **Ideas converging on generic defaults:** consult [references/direction-catalog.md](references/direction-catalog.md) as exploration prompts, not presets or quotas.
- **Requested or repository-expected durable project direction:** update the existing authoritative design document. Use [assets/DESIGN.template.md](assets/DESIGN.template.md) only when a new specification is warranted, not for routine styling fixes.

## Evidence and boundaries

Inspect requirements, realistic content, important journeys/states, existing components/tokens/assets, and the actual supplied image or rendered product. Capture a stable baseline before substantial changes when runnable. Distinguish confirmed evidence, reasonable inference, and material unknowns.

Preserve routes, data behavior, semantics, keyboard flows, production copy, and unrelated user changes unless their modification is in scope. Use native controls or established accessible patterns. Do not invent customers, testimonials, metrics, capabilities, or research; clearly mark representative fictional content as provisional.

For web work without a stricter requirement, design toward WCAG 2.2 AA and report checks rather than claiming conformance. A screenshot proves only visible composition in that state—not responsiveness, keyboard operation, semantics, or successful interactions.

Prefer existing tooling and dependencies. New dependencies, publication, deployment, purchases, external assets, secrets, and external mutations remain subject to user intent and project approval policy. Use safe fixtures, not production credentials or sensitive customer data for screenshots.

## Completion and output

**Direction:** report the product thesis, posture, governing evidence, selected direction and rationale, useful alternatives/tradeoffs, and material open decisions. Do not require the user to choose unexplained aesthetic labels.

**Implement:** continue the render–inspect–fix loop until no known Blocker or High issue remains in the inspected scope, or a concrete blocker prevents correction. Report the direction, important files changed, routes/states/sizes/themes/inputs inspected, checks actually performed, and remaining gaps. Limit cosmetic churn, not necessary correctness passes.

**Review:** lead with observed findings using the visual-QA reference's severity and evidence format. Group symptoms by root cause; taste is not a defect. Add Questions only for decision-relevant unknowns. Finish with verdict, evidence inspected, coverage, and unverified behavior:

- **Needs revision:** any Blocker/High finding, or Medium finding violating an explicit requirement.
- **Acceptable with refinements:** only non-blocking findings, with sufficient coverage.
- **No material findings:** no findings, with sufficient coverage.
- **Review incomplete:** missing rendered evidence, behavior, or environment prevents reliable judgment.

If review and fixes were both requested, report the review and then complete the authorized implementation phase without another approval merely for changing phases. Otherwise a review ends with findings, not corrections. Do not substitute interactive user annotation for an autonomous review unless that collaboration was requested.

Never claim rendering, image inspection, user validation, source fidelity, accessibility conformance, native quality, or platform coverage that did not occur.

Read [references/sources.md](references/sources.md) only for provenance or methodology revision.
