# Establish a Design Direction

Read when choosing or changing visual/interaction direction. Scale evidence gathering and alternatives to the decision, not a fixed design itinerary.

## 1. Establish evidence

Read repository instructions and relevant product or design documentation. Inspect:

- product type, audience, primary job, usage frequency, and consequence of error;
- information architecture, realistic content, critical journeys, and important states;
- supplied design files, screenshots, references, and their intended authority;
- runtime, target platforms, inputs, viewports or window constraints;
- current rendered behavior, acceptance criteria, and functionality that must not regress;
- existing tokens, components, fonts, icons, assets, patterns, and dependencies.

Classify each supplied visual as one of: **source of truth**, **constraint**, or **inspiration**. Do not silently treat inspiration as a pixel specification or reinterpret a complete specification as a loose moodboard.

When runnable, render the current interface and capture a stable baseline before substantial changes. Inspect the rendered product or supplied image itself; do not infer visual quality from markup, component names, or CSS alone.

Keep a small internal evidence ledger:

- **Confirmed:** directly visible in requirements, product behavior, repository, or supplied source.
- **Inferred:** a reasonable conclusion supported by confirmed evidence.
- **Unknown:** a fact that could materially alter the solution or confidence.

A static screenshot supports visible-layout findings only. It does not prove responsive behavior, keyboard operation, semantics, focus management, screen-reader output, loading behavior, or interaction states.

### Research only when it can change the outcome

When search or network tools are available and permitted, research for greenfield work, unfamiliar domains or platforms, a requested distinctive direction, or conventions that may have changed. Skip it for a small extension to a well-established system.

Prefer a small set of high-value references:

1. official platform, accessibility, and technical guidance;
2. the product's existing system and user evidence;
3. live products with comparable tasks, density, audience, or constraints;
4. respected design-system, editorial, or brand work;
5. inspiration galleries only for weak discovery signals.

For each useful reference, record the comparable constraint, principle to borrow, and element not to copy. Never copy a page or proprietary asset, claim user validation that did not occur, or call a design “research-backed” merely because it resembles another product.

## 2. Form the product and interaction thesis

Summarize in one or two sentences:

- who the primary user is and what they need to accomplish;
- what must feel easy, safe, fast, calm, or expressive;
- which platform, content, brand, and risk constraints shape the result.

Establish the interaction hierarchy before styling:

1. primary outcome and next action, if any;
2. navigation, information architecture, and working context;
3. secondary actions and supporting evidence;
4. system status, progress, and feedback;
5. error prevention, recovery, cancel or undo, and destructive boundaries;
6. novice discoverability and expert efficiency;
7. loading, empty, partial, stale, permission, offline, success, and failure states where relevant.

Favor recognition over recall, use the user's language, preserve user control, and keep common behavior conventional. Do not change information architecture or product behavior solely to serve a visual concept unless that change is in scope.

Use real product content when available. If representative content is necessary, use neutral, clearly fictional samples that exercise realistic length and states, label them as provisional, and do not fabricate customers, testimonials, ratings, metrics, integrations, or capabilities. Preserve production copy unless changing it is requested.

## 3. Select the visual direction

Ground the direction in the subject matter: its workflows, artifacts, vocabulary, materials, data, emotional register, and audience—not in a trend label.

For open-ended **Direction** work, explore meaningfully different candidates when alternatives help resolve the decision, then recommend one. Honor a requested option count; otherwise present only the useful alternatives and tradeoffs. When the brief already establishes a direction, refine it instead of manufacturing alternatives. In **Implement** mode, evaluate alternatives internally as needed but report and build only the selected direction.

A direction defines:

- product-specific concept or tension;
- typography voice and hierarchy;
- palette and contrast distribution;
- density and spatial rhythm;
- grid, composition, and alignment;
- geometry, borders, surfaces, and depth;
- imagery, illustration, icon, and data treatment;
- interaction and motion character;
- content voice;
- a product-specific distinguishing choice when useful, without requiring decorative signature devices;
- an explicit tradeoff.

Alternatives should represent different product-relevant approaches, such as composition, density, hierarchy, or interaction—not merely cosmetic palette/font swaps. Select qualitatively by product fit, task clarity, platform behavior, accessibility, brand distinction, content, and implementation feasibility. Do not use an arbitrary numeric style score or dimension quota.

If ideas converge on generic defaults, read [the direction catalog](direction-catalog.md). Its families are divergence prompts, not presets.
