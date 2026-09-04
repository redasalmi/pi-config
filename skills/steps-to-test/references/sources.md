# Manual QA Sources and Applied Decisions

This file records provenance. It should not be loaded for routine generation.

**Source review date:** 2026-09-04. Pi, Agent Skills, Git, GitHub, NASA, W3C, and current IBM documentation locations were rechecked. The supplied ISTQB and Cem Kaner source summaries were retained from the previous 2026-08-31 review.

## Pi and Agent Skills

- [Pi Skills documentation](https://pi.dev/docs/latest/skills)
  - Pi scans skill names and descriptions at startup and loads the full `SKILL.md` only when a task matches or the user invokes it explicitly.
  - Arguments after `/skill:name` are appended as user input.
  - Name collisions warn and keep the first discovered skill.
- [Agent Skills specification](https://agentskills.io/specification)
  - The description should state what the skill does and when to use it, with specific routing keywords.
  - The main file should remain focused; detailed references can load on demand.
  - The specification recommends keeping `SKILL.md` under 500 lines.

**Applied:** narrow the description around framework-agnostic manual QA and explicitly exclude code review, PR descriptions, automated-test work, and general test strategy. Keep specialized risk and technical-verification detail in one shallow reference.

## IBM Engineering Test Management

- [Creating manual test scripts](https://www.ibm.com/docs/en/engineering-lifecycle-management-suite/test-management/7.1.0?topic=scripts-creating-manual-test)
- [Creating or modifying manual test scripts with the recorder](https://www.ibm.com/docs/en/engineering-lifecycle-management-suite/test-management/7.1.0?topic=recorder-creating-modifying-manual-test-scripts)
- [Add test data to a manual test script](https://www.ibm.com/docs/en/engineering-lifecycle-management-suite/test-management/7.1.0?topic=crmt-lesson-2-add-test-data-manual-test-script)
  - Manual scripts contain ordered execution steps and expected results.
  - Test data makes the procedure executable and reproducible.
  - Images may supplement descriptions and expected results.

**Applied:** write linear workflows, place objective checks at meaningful checkpoints, include the data needed to execute the workflow, and keep written instructions complete without relying on images.

## NASA software test procedures

- [Software Test Procedures](https://swehb.nasa.gov/spaces/SWEHBVC/pages/140640783/Test+-+Software+Test+Procedures)
  - Procedures identify preparation, configuration, system and data state, methods, and expected results.
  - The full procedure set should cover requirements and retain traceability.
  - Tests should address intended behavior, prohibited behavior, adverse conditions, boundaries, and invalid input according to risk.
  - Instructions should be clear, detailed, sequential, and suitable for a tester who does not know the implementation.
  - Cleanup should return the system to a known state.

**Applied:** establish reachable setup and an objective oracle, trace accepted criteria internally, select negative and boundary cases by risk, and include cleanup when shared state changes.

## ISTQB terminology

- [ISTQB Standard Glossary](https://api.glossary.istqb.org/storage/help/tZx8UKflTwsfhq67frhOsb8mNPE7r01xRzivgFTG.pdf)
  - A test case includes preconditions, inputs, actions, expected results, and postconditions.
  - A test procedure defines execution sequence.
  - Risk-based testing uses risk type and level to prioritize test activity.

**Applied:** retain the information required for reproducible pass/fail testing while presenting it as concise workflows instead of a formal field-by-field test-management form.

## Scenario testing

- [Scenario Testing tutorial by Cem Kaner](https://kaner.com/pdfs/CAST2010ScenarioTestingTutorial.pdf)
  - A scenario is a coherent story with a setting, actors, goals, and a sequence of actions and events.
  - Scenario tests evaluate whether the product behaves appropriately as that story unfolds.

**Applied:** group related actions around a user goal. Do not label a simple linear procedure as scenario testing when actor, goal, and context do not materially shape it.

## W3C Web Accessibility Initiative

- [Easy Checks — A First Review of Web Accessibility](https://www.w3.org/WAI/test-evaluate/preliminary/)
  - Nontechnical reviewers can perform focused checks for keyboard access, visible and logical focus, traps, text resizing, labels, required-field cues, and error handling.
  - These checks cover only part of accessibility and are not a complete conformance evaluation.

**Applied:** include keyboard, focus, form, text-growth, or motion checks only when the changed UI gives them a concrete reason; never claim a complete accessibility audit or WCAG conformance.

## GitHub and Git

- [GitHub: Branches and pull-request comparisons](https://docs.github.com/en/pull-requests/reference/branches)
  - GitHub pull requests use a three-dot comparison from merge base to the topic branch to focus on what the branch introduces.
- [git-diff documentation](https://git-scm.com/docs/git-diff)
- [git-rev-parse documentation](https://git-scm.com/docs/git-rev-parse)
  - `^{commit}` requires a commit-ish.
  - `--end-of-options` prevents a supplied revision from being interpreted as an option.

**Applied:** pin base and head to immutable commits, derive branch behavior from merge-base to head, keep working-tree scope separate, and use current-base context only when it changes the expected integrated behavior.

## Regression testing practice

- [Goto Fail, Heartbleed, and Unit Testing Culture](https://martinfowler.com/articles/testing-culture.html)
  - A bug fix should establish the defect-triggering case, verify the correction, and protect it with suitable regression coverage.

**Applied:** manual steps recreate the trigger conditions and confirm the former symptom is absent. Automated-regression sufficiency remains developer-facing review work rather than a nontechnical tester instruction.
