import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  buildDirective,
  getReviewCompletions,
  parseReviewArgs,
  REVIEW_MENU,
  scopeRefs,
  USAGE,
  type ReviewScope,
} from "./scopes.ts";
import { notify } from "./utils.ts";

const SKILL_COMMAND = "skill:code-review";

// Esc returns undefined (cancel); Enter on an empty field returns "".
async function promptScope(ctx: ExtensionContext): Promise<ReviewScope | undefined> {
  const label = await ctx.ui.select(
    "Code review scope",
    REVIEW_MENU.map((option) => option.label),
  );
  switch (REVIEW_MENU.find((option) => option.label === label)?.choice) {
    case "base": {
      const base = (await ctx.ui.input("Base branch or ref", "e.g. origin/main"))?.trim();
      if (base === "") notify(ctx, "A base ref is required", "error");
      return base ? { mode: "base", base, head: "HEAD" } : undefined;
    }
    case "uncommitted":
      return { mode: "uncommitted" };
    case "commit": {
      const commit = (await ctx.ui.input("Commit ref", "HEAD"))?.trim();
      return commit === undefined ? undefined : { mode: "commit", commit: commit || "HEAD" };
    }
    case "custom": {
      const focus = (
        await ctx.ui.input("Review instructions", "e.g. focus on auth, migrations, and error handling")
      )?.trim();
      if (focus === "") notify(ctx, "Review instructions are required", "error");
      return focus ? { mode: "custom", focus } : undefined;
    }
    default:
      return undefined;
  }
}

async function findInvalidRef(pi: ExtensionAPI, cwd: string, refs: string[]): Promise<string | undefined> {
  for (const ref of refs) {
    const args = ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`];
    const result = await pi.exec("git", args, { cwd });
    if (result.code !== 0) return ref;
  }
  return undefined;
}

export function registerReviewCommand(pi: ExtensionAPI): void {
  pi.registerCommand("review", {
    description: "Code review a diff: base branch, uncommitted changes, a commit, or custom focus",
    getArgumentCompletions: getReviewCompletions,
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) {
        notify(ctx, "Wait for the current task to finish before starting a review", "warning");
        return;
      }

      const outcome = parseReviewArgs(args);
      if (outcome.kind === "error") {
        notify(ctx, outcome.message, "error");
        return;
      }

      let scope: ReviewScope | undefined;
      if (outcome.kind === "scope") {
        scope = outcome.scope;
      } else {
        if (!ctx.hasUI) {
          notify(ctx, USAGE, "error");
          return;
        }
        scope = await promptScope(ctx);
        if (!scope) return;
      }

      // Pi sends an unknown /skill: command as literal text, so check availability first.
      if (!pi.getCommands().some((command) => command.source === "skill" && command.name === SKILL_COMMAND)) {
        notify(ctx, 'The "code-review" skill is not available. Install or enable it, then retry the review.', "error");
        return;
      }

      const invalid = await findInvalidRef(pi, ctx.cwd, scopeRefs(scope));
      if (invalid) {
        notify(ctx, `Unknown git commit or ref "${invalid}"`, "error");
        return;
      }

      // Pi's skill expansion wraps the body with its location so relative references resolve.
      pi.sendUserMessage(`/${SKILL_COMMAND} ${buildDirective(scope)}`, { expandPromptTemplates: true });
    },
  });
}
