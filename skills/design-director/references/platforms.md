# Platform, Accessibility, and Asset Guide

Use only the sections relevant to the task. Official target-platform conventions and repository support policy take precedence over generic cross-platform advice.

## Decision hierarchy

For behavior and component selection, prefer:

1. native semantic element or platform control;
2. established project component with verified behavior;
3. official platform or design-system pattern;
4. custom component following the expected interaction model.

A branded surface can still behave conventionally. Familiar behavior lowers learning cost and usually improves keyboard and assistive-technology support.

## Marketing and content websites

Optimize for comprehension, trust, evidence, and one clear next action.

- State what the product is, who it helps, and why it is credible without forcing a long scroll.
- Build a narrative hierarchy instead of repeating interchangeable centered sections.
- Use truthful product evidence and meaningful visuals; never fabricate customers, quotes, ratings, or metrics.
- Change composition when the narrative changes while retaining grid and typography continuity.
- Keep navigation and calls to action clear at narrow widths, high zoom, and with long labels.
- Budget fonts, images, embeds, and motion against loading, layout stability, and the primary content.

## Web applications

Optimize for repeated task completion, working-context preservation, and state clarity.

- Derive navigation from information architecture; a sidebar is one option, not the default.
- Keep primary actions near the content or decision they affect.
- Preserve context during navigation and asynchronous operations.
- Design affected loading, empty, error, stale, partial-data, permission, offline, and destructive states.
- Match density to usage: frequent expert tasks can be compact; occasional tasks need guidance and stronger recognition cues.
- Make destructive or irreversible actions explicit and recoverable where practical.
- Support keyboard workflows for frequent actions and visible focus for every action.
- For data-heavy views, prioritize comparison, stable alignment, labels, sorting/filter state, overflow behavior, and non-color encodings.

## Responsive and adaptive web behavior

- Let content determine breakpoints. Do not target named devices or assume screen size predicts pointer, touch, hover, or keyboard capability.
- Start with the most constrained useful layout, then add space and parallelism where the content benefits.
- Recompose and prioritize instead of merely shrinking or stacking. A pane might become a drawer, disclosure, bottom sheet, or separate route.
- Do not hide essential content or actions solely because the viewport is small.
- Use fluid grids and media; use component or container queries when they fit the repository's support policy.
- Test immediately below and above every changed breakpoint, not only at common screenshot widths.
- Limit line length and surface width when additional width harms reading or separates related controls.
- For full-height or fixed-position mobile web UI, account for browser chrome, safe areas, the on-screen keyboard, zoom, and scroll restoration.
- Avoid locking page scroll or clipping overflow unless the interaction explicitly requires it and escape/recovery remains reliable.

Useful starting views—not product requirements—are approximately 360×800, 768×1024, and 1440×900, plus product-specific extremes. WCAG reflow also requires attention around 320 CSS px for vertically scrolling web content, subject to documented exceptions.

## Web accessibility baseline

Target the project's required standard. When none is given, design toward WCAG 2.2 AA and report checks rather than claiming conformance.

- Normal text needs at least 4.5:1 contrast and qualifying large text at least 3:1.
- Essential component boundaries, focus indicators, and states need at least 3:1 non-text contrast where WCAG applies.
- Content should reflow without loss of information or function at the required narrow width, except genuinely two-dimensional content.
- WCAG 2.2 AA target size is at least 24×24 CSS px or must satisfy a documented spacing/exception rule. Treat that as a compliance floor, not a comfortable touch target.
- Keyboard focus must be visible, logical, and not fully obscured by sticky regions, dialogs, or overlays.
- All functionality must be available without a pointer; drag interactions need a non-drag alternative where required.
- Status, errors, progress, and completion must be exposed to assistive technologies without disruptive focus changes.
- Support browser zoom, text resize, and WCAG text-spacing overrides without clipping controls or losing content.
- Do not encode state, error, selection, or data meaning by color alone.
- Honor `prefers-reduced-motion`; remove, shorten, or replace nonessential large-scale movement.
- Keep the visible label in an accessible name when a control has both.

Prefer semantic HTML. If a custom widget is necessary, use the matching WAI-ARIA Authoring Practices pattern for roles, states, keyboard behavior, and focus management. No ARIA is better than incorrect ARIA. Automated scans find only part of the problem; include keyboard checks and, when practical and in scope, screen-reader checks.

## Desktop applications

A desktop app is not a website with a fixed window. Determine the runtime and target OS: native toolkit, Electron, Tauri, Qt, Flutter, or another shell.

Design for:

- a documented minimum useful size, sensible default size, and productive large-window layout;
- continuous resizing, maximized/full-screen, tiling, scaling, and multiple displays;
- pointer and keyboard as first-class inputs;
- menus, command discoverability, shortcut labels, and context menus;
- toolbars, split panes, inspectors, status regions, tables, and multi-selection when task-appropriate;
- drag/drop plus keyboard alternatives, clipboard, undo/redo, inline editing, and file operations where relevant;
- dialogs/sheets/popovers, destructive confirmation, focus restoration, and interruption recovery;
- long sessions, stable spatial memory, dense information, and persistent window/pane preferences;
- offline, sync, update, permission, conflict, and file-system states when applicable.

Do not recreate OS-owned window controls unless custom chrome is intentional and moving, resizing, minimizing, maximizing, full-screen, system menus, accessibility, and drag regions remain correct. When a native toolkit supplies system fonts, colors, spacing, icons, and controls, do not hardcode replacements without a deliberate reason.

### macOS

- Respect the global menu bar and standard File/Edit/View/Window/Help command organization.
- Use Command-based standard shortcuts and do not override system or accessibility shortcuts.
- Support full keyboard access, pointer precision, window resizing, full-screen, and multiple windows where the task expects them.
- Use toolbars, sidebars, inspectors, sheets, and Settings terminology according to their platform roles.
- Do not imitate macOS with decorative traffic-light buttons inside content.

### Windows

- Follow Windows/Fluent behavior for navigation, title bars, command surfaces, focus visuals, access keys, dialogs, and selection.
- Preserve system window commands and valid title-bar drag regions.
- Use Ctrl-based standard shortcuts, logical tab order, and arrow-key inner navigation for grouped controls.
- Test system scaling, high contrast/forced colors, keyboard-only use, touch/pointer combinations, and narrow snapped windows.
- Do not put initial focus on a destructive action.

### GNOME

- When GNOME is the target, follow the GNOME HIG for header bars, primary/secondary menus, adaptive windows, standard shortcuts, and keyboard navigation.
- Primary windows should resize smoothly; constrained and tiled layouts must retain functionality.
- Support standard Tab/Shift+Tab, Return/Space, Escape, menu/context-menu, and platform shortcut behavior.
- Expect variation in fonts, themes, scaling, window managers, and input hardware.

### KDE/Plasma

- Follow the current KDE HIG and its “simple by default, powerful when needed” principle rather than applying GNOME or web conventions generically.
- Make the common workflow obvious while retaining shortcuts, context menus, and customization for expert work.
- Respect system fonts, color schemes, scaling, standard actions/shortcuts, and themable FreeDesktop/Breeze icons.
- Adapt toolbars, sidebars, status regions, panes, and menus for narrow, tiled, and large windows.
- Keep primary controls visible; shortcuts and context menus accelerate a workflow but must not be the only path.
- Verify with at least one non-default color scheme and larger system font when practical.

### Cross-platform desktop

- Keep product identity in content, data, icons, and selected surfaces; adapt menus, modifier keys, labels, dialogs, and chrome per OS.
- Display the correct shortcut symbols or names for the running platform.
- Use a platform adapter for behavioral differences rather than a lowest-common-denominator web shell.
- Test at least one real target environment per supported OS before claiming native quality.

## Input behavior

### Keyboard

- Visual and focus order should agree with the task and locale.
- Restore focus sensibly after closing dialogs, menus, and transient views.
- Tab moves between components; arrow keys usually move within composite components.
- Common actions expose conventional shortcuts without making shortcuts mandatory.
- Escape, Enter/Return, Space, arrows, and platform modifiers follow control conventions.
- Avoid single-character shortcuts unless they can be disabled, remapped, or are active only while the relevant control has focus.

### Touch

- Provide comfortably sized and separated targets beyond the bare compliance minimum.
- Never depend on hover for essential information or actions.
- Gestures need visible alternatives and must not conflict with system navigation.
- Do not make drag the only way to complete a task.

### Pointer

- Cursors communicate text, links, dragging, and resizing accurately.
- Dense controls remain hittable and tooltips supplement—not replace—understandable labels.
- Hover affordances must not move targets or reveal the only route to a critical action.

## Localization and internationalization

- Test longer translated labels, multiline text, plural forms, and at least 200% text growth.
- Use locale-aware dates, times, numbers, currency, names, and sorting.
- Use logical start/end layout properties where possible and inspect a real RTL layout; mirroring alone does not solve mixed-direction content.
- Verify fonts cover required scripts and that fallback fonts preserve hierarchy and line metrics.
- Do not encode meaning in capitalization, word length, or English-specific alphabetical order.
- Keep icons directional only when their meaning is directional; do not mirror universal symbols indiscriminately.
- Prefer pseudo-localized or representative target-language fixtures over guessing from short English labels.

## Fonts, imagery, icons, and performance

- Verify font, image, and icon licenses before adding files or external URLs. Preserve required notices and do not assume “free download” permits redistribution.
- Follow repository policy for remote assets and third-party font services; consider privacy, offline behavior, CSP, availability, and failure states.
- For web fonts, minimize families, weights, and subsets; prefer modern compressed formats where supported and choose `font-display` deliberately.
- Match fallback metrics to reduce text reflow and layout shift; test slow loading and missing-font behavior when typography changed.
- Verify glyph coverage with actual target-language text rather than a font marketing claim.
- Give images intrinsic dimensions or aspect ratios to prevent layout shift and provide alternatives for meaningful content.
- Compress and size assets for their rendered use. Decorative media must not materially delay the primary content or task.
- Use the project's icon source and accessible labels. Avoid mixing incompatible icon families or treating decorative icons as semantic content.

## Evidence limits

Using an accessible component library or design system does not make the complete product accessible. Following a platform HIG does not prove native quality. A clean screenshot does not prove responsive or interaction behavior. Report the exact checks performed, target environment used, and remaining gaps.
