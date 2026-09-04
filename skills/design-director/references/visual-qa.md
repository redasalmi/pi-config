# Evidence-Based Visual QA

Rendered pixels and interaction behavior are part of the implementation. Use this workflow after meaningful visual changes or for rendered UI review; scale the matrix to the risk and scope rather than applying every case mechanically.

## 1. Discover the existing path

Read repository instructions and inspect existing scripts and configuration before adding tooling. Prefer, in order:

1. the project's documented dev or preview command;
2. existing Storybook or component explorer;
3. existing Playwright, Cypress, browser automation, screenshot, or visual-regression setup;
4. the framework's normal local preview;
5. a native app preview or test harness for desktop work.

Do not install a large dependency or subscribe to a service solely for screenshots without user intent and project fit. Do not commit temporary captures unless the repository expects visual baselines or the user asks.

Start the smallest reliable environment that provides representative data. Record blockers such as unavailable credentials, services, fixtures, feature flags, fonts, target OS, or runtime.

## 2. Identify the comparison source

Classify the comparison source before judging fidelity:

- **Baseline:** the product state before the change.
- **Authoritative target:** a supplied design or specification that should be reproduced.
- **Directional reference:** inspiration whose principles may be adapted but not copied literally.
- **No prior source:** a greenfield result judged against the product thesis and acceptance criteria.

For substantial changes, capture the baseline at the same route, data, theme, locale, viewport/window size, zoom or scale, and interaction state that will be reviewed afterward.

A useful baseline or target set includes only relevant cases:

- primary view and action;
- changed component or region;
- narrowest supported view or minimum useful window;
- expected default desktop or laptop view;
- dense/long and empty/sparse content when layout depends on data;
- one important overlay, validation, selection, or interaction state.

Do not call a directional reference the product's prior state or an approximate screenshot a complete specification.

## 3. Build a risk-based matrix

Choose cases from the change, acceptance criteria, and likely failure modes—not a generic checklist.

### Web marketing and content

- initial viewport and full-page narrative;
- mobile navigation and primary call to action;
- primary conversion path;
- slow or missing image/font behavior when assets changed;
- long headings and representative content;
- sticky or fixed elements at high zoom and narrow widths.

### Web applications

- primary happy path and affected navigation state;
- loading, empty, validation, error, selected, disabled, permission, stale, and destructive states affected by the change;
- dense data, long labels, overflow, pagination, virtualization, or scrolling as relevant;
- supported themes and high-contrast/forced-color behavior when tokens changed;
- browser/runtime combinations affected by the CSS, API, or platform feature used.

### Desktop applications

- minimum useful, default, and large window;
- resized, snapped, or tiled layout;
- menus, toolbar, sidebar/split view, inspector, context menu, and dialog affected by the work;
- keyboard focus, selection, drag/resize, and platform-specific chrome;
- target scaling, theme, system font, and accessibility settings where practical.

For responsive work, test immediately below and above every changed breakpoint. Starting dimensions such as 360×800, 768×1024, and 1440×900 are useful only when they fit the product. Include 320 CSS px reflow checks when WCAG web requirements apply.

## 4. Make captures stable and safe

- Use deterministic fixtures or mock data where the project supports them.
- Wait for intended fonts, images, data, layout, and transitions before capture.
- Disable animation only for deterministic comparison, not to hide a motion defect; test reduced-motion behavior separately.
- Keep route, data, theme, scale, zoom, locale, browser/runtime, and state constant for before/after comparison.
- Mask volatile timestamps or user data only when the tooling supports it and the masked region is not under review.
- Do not use or retain real secrets, payment data, or unnecessary personal information in screenshots.
- Check console/runtime errors and failed requests before blaming CSS for an incomplete render.
- Record device-pixel ratio or OS scaling when it materially affects the comparison.

Prefer full-page screenshots for narrative flow and viewport or element captures for interaction detail. Use the project's existing tooling rather than requiring Playwright or Storybook specifically.

In Pi, inspect the saved image itself with the `read` tool when the active provider supports image input and images are not blocked. Otherwise state that pixel-level inspection was unavailable. Do not infer visual quality from markup or CSS alone.

## 5. Inspect at four levels

### Whole-view composition

Check:

- primary task/action and reading order;
- balance of visual weight, density, and negative space;
- grid, alignment, and purposeful width use;
- navigation and system-status visibility;
- product identity beyond logo and accent color;
- fixed/sticky regions, scrolling, overlays, and viewport obstructions.

### Component and content detail

Check:

- type rendering, line length, wrapping, truncation, numerals, and fallback fonts;
- spacing relationships, control sizes, borders, radii, and surface hierarchy;
- icon alignment, optical balance, consistency, and accessible labels;
- representative long, empty, error, and localized content;
- hover, focus, pressed, selected, disabled, loading, error, success, and destructive differentiation;
- clipping, accidental scrollbars, z-index, layout shift, and low-resolution assets.

### Interaction and platform behavior

Check:

- keyboard reachability, focus order, visibility, restoration, and Escape behavior;
- common control semantics and expected keys;
- no hover-only essential action;
- error prevention, feedback, cancel/undo, and recovery;
- resizing and recomposition rather than simple shrinking;
- platform menus, shortcuts, window behavior, scaling, themes, and system settings for desktop.

### Source fidelity or design-thesis fit

For **Reproduce** posture, compare the same state and size against the authoritative source:

- hierarchy, composition, alignment, proportions, typography roles, color roles, geometry, imagery, and state treatment;
- responsive behavior explicitly shown or documented by the source;
- intentional differences required by accessibility, content, platform, or implementation constraints.

Do not pixel-chase anti-aliasing, browser font rasterization, OS-native control rendering, or unspecified responsive states. Record meaningful deviations and their reason.

For greenfield or redesign work, compare against the selected product thesis and fingerprint rather than against unrelated inspiration screenshots.

Automated accessibility scans can supplement these checks. They do not validate task flow, keyboard quality, screen-reader meaning, source fidelity, or full WCAG conformance.

## 6. Record evidence-based findings

Do not assign an aggregate design score. Use:

- **Blocker:** critical task or access failure.
- **High:** material hierarchy, responsive, platform, state, or accessibility problem affecting the main task.
- **Medium:** concrete readability, consistency, discoverability, or secondary-flow problem.
- **Polish:** optical improvement without meaningful usability impact.

Use this format internally or in Review mode:

```markdown
### [High] Primary action disappears below the sticky footer
- **Evidence:** `/checkout`, 360×800, validation-error state, keyboard focus on the first invalid field
- **Impact:** The user cannot submit or recover without discovering an obscured scroll region.
- **Correction:** Keep the action in normal flow at this width or reserve footer space and scroll the first error into view.
- **Verify:** Repeat the same state at 320, 360, and immediately above the footer breakpoint with focus visible.
```

A finding must identify an observed visible or behavioral symptom. “Feels dated,” “needs polish,” unsupported taste, and behavior inferred from a static image are not findings. Group multiple symptoms under one root cause when one correction addresses them.

## 7. Fix root causes and recheck

Prioritize the highest-impact issues in each pass. Prefer system fixes:

- correct hierarchy rather than add decoration;
- repair the grid rather than nudge unrelated elements;
- revise type, spacing, or color roles rather than add one-off overrides;
- simplify surface grouping rather than strengthen every shadow;
- recompose at a breakpoint rather than scale everything down;
- improve content or state architecture rather than add emphasis to compensate.

Re-capture the same matrix after fixes and compare against the baseline, authoritative source, or intended direction. Confirm that intentional changes did not create regressions elsewhere.

Continue until no known Blocker or High issue remains in the inspected scope, or until a concrete blocker prevents correction. Limit cosmetic churn, not the number of necessary correctness passes.

## 8. Functional and accessibility checks

Run relevant existing formatting, lint, type, unit, integration, build, and visual checks. Then, where applicable:

- operate the changed flow with keyboard only;
- inspect focus at sticky regions, dialogs, menus, and overlays;
- test browser zoom, text growth, text-spacing overrides, and long labels;
- test reduced motion;
- inspect light, dark, high-contrast, or forced-color modes;
- check console/runtime errors and failed assets;
- run the project's existing accessibility scanner;
- perform a targeted screen-reader check when a custom interaction or announcement changed and the environment supports it.

Never claim a check ran because configuration or test files exist. Keep visual, functional, accessibility, performance, and source-fidelity claims separate.

## 9. Report honestly

Record:

- comparison source: baseline, authoritative target, directional reference, or product thesis;
- routes/screens and data states inspected;
- exact viewport/window sizes, themes, locales, browser/runtime, OS, scale, and input used where relevant;
- baseline and final captures when retained;
- material findings corrected and remaining findings;
- commands and checks actually run;
- browsers, operating systems, inputs, accessibility checks, and states not covered;
- blockers that prevented rendering or image inspection.

Do not say the UI was visually verified if no rendered output was inspected. Do not claim user validation, accessibility conformance, native quality, cross-browser coverage, or source fidelity beyond the evidence collected.
