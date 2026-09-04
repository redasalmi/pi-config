# Design Director Sources and Applied Decisions

This file records provenance and deeper rationale. Routine design work should load only the operational references needed for the task.

**Last source review:** 2026-09-04. Core skill, accessibility, KDE, design-token, and visual-tool references were re-checked; re-check vendor HIGs, browser behavior, specifications, and tool versions during major revisions.

## Skill structure and routing

- [Pi skills documentation](https://pi.dev/docs/latest/skills)
  - Pi keeps skill names and descriptions in the startup context, loads the full `SKILL.md` on demand, resolves relative resources from the skill directory, and validates Agent Skills frontmatter.
  - The description determines automatic selection, so it should state both positive triggers and important exclusions.
- [Agent Skills specification](https://agentskills.io/specification)
  - Defines the directory layout and frontmatter constraints, recommends a focused `SKILL.md`, and uses referenced files for progressive disclosure.
  - Recommends keeping the main instructions below 500 lines and references shallow and task-specific.

**Applied:** use a specific routing description, keep operational decisions in `SKILL.md`, place detailed platform/QA/creative guidance in focused references, and use only relative one-level resource links.

## Accessibility and interaction semantics

- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/)
  - Provides testable criteria for contrast, reflow, text spacing, keyboard access, focus visibility and obstruction, dragging alternatives, target size, error handling, accessible authentication, and status messages.
  - WCAG 2.2 AA target size is 24×24 CSS px or an allowed spacing/exception case; this is a minimum, not a touch-comfort recommendation.
- [WCAG overview](https://www.w3.org/WAI/standards-guidelines/wcag/)
  - W3C recommends using the latest WCAG version and distinguishes conformance criteria from broader accessibility work.
- [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
  - Defines roles, states, focus, and conventional keyboard models for custom widgets such as dialogs, menus, tabs, trees, and grids.
- [APG: Read Me First](https://www.w3.org/WAI/ARIA/apg/practices/read-me-first/)
  - Native HTML semantics are preferred; incorrect ARIA can reduce accessibility.
- [APG: Developing a keyboard interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)
  - Tab normally moves between components while arrow keys operate within composite widgets; focus must remain visible and predictable.
- [GOV.UK Design System accessibility](https://design-system.service.gov.uk/accessibility/)
  - Accessible components do not automatically make a complete service accessible; research, implementation, and testing still matter.
- [MDN `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
  - The media feature reflects a user's OS preference to remove, reduce, or replace nonessential motion.

**Applied:** target WCAG 2.2 AA when no stricter requirement exists, prefer native semantics, use APG for custom controls, test keyboard/focus manually, honor reduced motion, and never claim conformance from component choice or automation alone.

## General usability and content

- [Nielsen Norman Group: 10 usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
  - Supports system-status visibility, user-language match, control and undo, consistency, error prevention, recognition over recall, expert efficiency, focused visual design, actionable errors, and contextual help.
- [Nielsen Norman Group: Aesthetic and minimalist design](https://www.nngroup.com/articles/aesthetic-minimalist-design/)
  - Minimalism means maximizing useful signal and reducing irrelevant competition, not hiding needed information or actions.
- [KDE HIG: Text and labels](https://develop.kde.org/hig/text_and_labels/)
  - Reinforces concise, actionable, user-facing language, familiar wording, accessible labels, and controlled emphasis.

**Applied:** establish interaction hierarchy before visual treatment, keep common behavior conventional, use consistent action names, prevent and recover from errors, and treat content as functional interface material.

## Platform guidance

- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
  - Covers platform-native navigation, controls, input, windows, typography, color, motion, and accessibility expectations.
- [Microsoft Windows app design](https://learn.microsoft.com/en-us/windows/apps/design/)
- [Microsoft keyboard interactions](https://learn.microsoft.com/en-us/windows/apps/design/input/keyboard-interactions)
- [Microsoft navigation basics](https://learn.microsoft.com/en-us/windows/apps/design/basics/navigation-basics)
  - Windows guidance covers input and form-factor adaptation, focus visuals, access keys, shortcuts, inner navigation, command surfaces, and task-appropriate navigation.
- [GNOME Human Interface Guidelines](https://developer.gnome.org/hig/)
- [GNOME adaptive design](https://developer.gnome.org/hig/guidelines/adaptive.html)
- [GNOME keyboard guidance](https://developer.gnome.org/hig/guidelines/keyboard.html)
  - GNOME expects resizable and adaptive windows, constrained-first layouts, standard shortcuts, and complete keyboard operation.
- [KDE Human Interface Guidelines](https://develop.kde.org/hig/)
- [KDE: Simple by default](https://develop.kde.org/hig/simple_by_default/)
- [KDE: Powerful when needed](https://develop.kde.org/hig/powerful_when_needed/)
- [KDE: Layout and navigation](https://develop.kde.org/hig/layout_and_nav/)
- [KDE: Accessibility and inclusiveness](https://develop.kde.org/hig/accessibility/)
  - KDE emphasizes obvious common workflows, expert accelerators, adaptive windows, system settings, themable icons, and testing with alternate themes, larger fonts, keyboard, touch, and screen readers.

**Applied:** desktop behavior follows the target OS before brand styling; cross-platform apps adapt menus, modifiers, dialogs, chrome, scaling, system settings, and keyboard behavior instead of presenting one web shell everywhere.

## Design systems and visual foundations

- [Design Tokens Format Module 2025.10](https://www.designtokens.org/TR/2025.10/format/)
  - Defines the first stable vendor-neutral DTCG exchange format for design tokens and aliases across tools.
  - It is a W3C Community Group specification rather than a W3C Recommendation, so adoption should follow repository and tooling constraints.
- [Fluent 2 design tokens](https://fluent2.microsoft.design/design-tokens)
  - Separates context-free global values from semantic alias tokens and uses tokens for light, dark, high-contrast, and branded themes.
- [IBM Carbon themes](https://carbondesignsystem.com/elements/themes/overview/)
  - Role-based tokens keep component usage stable while theme values change; Carbon separates productive and editorial type roles.
- [IBM Carbon 2x Grid](https://carbondesignsystem.com/elements/2x-grid/overview/)
  - A constrained sizing and spacing system creates alignment, grouping, rhythm, and hierarchy across fluid and fixed layouts.
- [Material Design 3 design tokens](https://m3.material.io/foundations/design-tokens/overview)
- [Material Design 3 color roles](https://m3.material.io/styles/color/roles)
  - Material uses role-based color, typography, shape, and component tokens to keep theming systematic.
- [Google research on expressive design](https://design.google/library/expressive-material-design-google-research)
  - Expression through color, size, shape, motion, and containment can improve attention and usability when grounded in users and accessibility rather than decoration alone.

**Applied:** use the smallest token architecture the product needs, preserve the repository's existing source of truth, prefer semantic roles, and use the stable DTCG format only when new interoperable token files are appropriate.

## Responsive design, localization, assets, and performance

- [web.dev responsive design basics](https://web.dev/articles/responsive-web-design-basics)
  - Supports fluid layouts, content-driven breakpoints, and avoiding assumptions that viewport size determines input capability.
- [web.dev optimize web fonts](https://web.dev/learn/performance/optimize-web-fonts)
  - Font files, `font-display`, family/weight count, formats, and fallback metrics affect first rendering and layout stability.
- [web.dev CSS for Web Vitals](https://web.dev/articles/css-web-vitals)
  - Layout, images, fonts, animation, and unused CSS can affect loading and cumulative layout shift.
- [SIL Open Font License](https://openfontlicense.org/)
  - Font use, modification, embedding, and redistribution depend on license terms and reserved-name requirements.
- [Adobe React Spectrum](https://github.com/adobe/react-spectrum/)
  - Provides a production reference for cross-input behavior, adaptive layout, RTL, locale formatting, and multilingual component requirements.

**Applied:** let content drive breakpoints, treat localization and RTL as layout inputs, and include license, privacy, performance, script coverage, and failure behavior in font and asset decisions.

## Visual verification

- [Playwright screenshots](https://playwright.dev/docs/screenshots)
  - Supports viewport, full-page, element, and in-memory screenshots for deterministic browser inspection.
- [Storybook visual tests](https://storybook.js.org/docs/writing-tests/visual-testing)
  - Pixel baselines capture rendered output and reveal regressions that markup snapshots can miss.
- [Storybook interaction tests](https://storybook.js.org/docs/writing-tests/interaction-testing)
  - Components can be rendered in known states and exercised through interactions in a browser.
- [Pi settings: images](https://pi.dev/docs/latest/settings)
  - Pi can pass images from file attachments, `read`, and tool results to image-capable providers unless image handling is disabled.

**Applied:** prefer existing project tooling, compare stable like-for-like states, inspect the actual image when supported, separate visual evidence from functional/accessibility claims, and explicitly report when rendering or image input was unavailable.

## Agent visual-direction calibration

- [Anthropic frontend-design skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
  - Provides a current first-party example of grounding visual direction in subject matter, critiquing generic model defaults, using restrained signature moves, and treating interface copy as part of design.

**Applied:** derive distinctiveness from product evidence, expose alternatives only when the brief is open, and use anti-default diagnostics without banning legitimate styles or overriding authoritative supplied designs.
