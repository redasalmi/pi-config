# Implement the Direction

Use for authorized visual implementation. Reuse the product language and verify the actual rendered result; visual QA is routed separately from the root skill.

## 4. Establish the smallest coherent system

Reuse the existing source of truth first. Introduce a token, variant, or abstraction only when it represents a repeated decision, semantic role, state, theme, or durable rule; do not build a parallel design system for one screen.

- **Tokens:** prefer semantic roles for surface, text, action, status, spacing, geometry, depth, and motion. Separate primitive, semantic, and component layers only when the system's scale warrants it. Preserve the repository's current token source and format; when creating new interoperable token files, prefer the stable DTCG format unless project tooling requires another format.
- **Typography:** define task-appropriate hierarchy, line length, numerals, scripts, fallback metrics, loading, and license. Minimize font families, give each a defined role, and do not add typefaces as decoration.
- **Color:** reserve strongest contrast for priority, encode state with more than color, and treat dark or high-contrast themes as designed systems rather than inversions.
- **Space and layout:** use a limited rhythm. Create hierarchy with proximity, alignment, and whitespace before adding containers, dividers, or shadows.
- **Components:** preserve recognizable semantics and define only relevant default, hover, focus, pressed, selected, disabled, loading, empty, error, success, overflow, and destructive states.
- **Content:** make labels and actions specific, consistent, and user-centered. One visible control should do one understandable thing.
- **Assets:** use licensed, attributable, project-approved imagery, fonts, and icons. Do not embed unverified remote assets merely to make a mockup look finished.
- **Motion:** explain causality, hierarchy, or spatial continuity; avoid motion as filler and provide a reduced-motion treatment.

For web work without a stricter project requirement, design toward WCAG 2.2 AA, then report the checks actually performed rather than claiming conformance.

For substantial greenfield work, a redesign, or a durable design-system effort, update the project's existing authoritative design document. Create a new document from [the design template](../assets/DESIGN.template.md) only when the user requested project-level direction or the repository clearly expects a durable specification. Do not add design documentation for a routine feature or styling fix.

## 5. Implement within the product

- Inspect existing components, styles, scripts, and repository conventions before editing.
- Respect the framework and component library; do not rewrite the stack to express a visual preference.
- Avoid new dependencies when the current stack can deliver the result cleanly.
- Preserve routes, forms, data behavior, semantics, keyboard flows, and unrelated user changes unless modification is in scope.
- In **Reproduce** posture, prioritize like-for-like fidelity and documented responsive behavior over personal improvements.
- Centralize repeated decisions as existing tokens or variants; avoid scattered magic values and duplicate sources of truth.
- Build responsive behavior from content constraints; recompose rather than merely shrink or stack desktop UI.
- Prefer native HTML or platform controls. For custom web widgets, follow the corresponding WAI-ARIA Authoring Practices interaction model.
- Use the project's icon system. Do not use emoji as functional icons.
- Every visible production control must work. Remove, disable with an accurate explanation, or clearly mark prototype-only controls instead of adding dead UI.
- Do not use production credentials or sensitive customer data solely to produce a design or screenshot.
- Never publish, deploy, purchase, or introduce externally hosted assets without appropriate user intent and project policy.

Use the root skill's platform-reference routing for responsive work, custom controls, localization, and desktop behavior.

## Resist generic model output

Apply this diagnostic when greenfield identity, redesign, or distinctiveness is in scope; do not use it to override a supplied complete design.

Challenge a result when removing the logo and product nouns would make it interchangeable with an unrelated product. Distinctiveness may come from task architecture, data treatment, interaction rhythm, or platform integration—not only decoration.

Common warning signs include an automatic sidebar-and-card dashboard, giant low-information hero, identical rounded surfaces, universal pills, decorative gradient or glow, icon tiles beside every heading, fake metrics, arbitrary numbered sections, obligatory eyebrow labels, one accented headline word, monospace metadata everywhere, arrows appended to every action, or fade-up animation on every section.

These devices are not banned. Each needs a product-specific role. Spend boldness in one memorable place, keep the supporting system disciplined, and remove decoration that does not improve meaning, hierarchy, or character.
