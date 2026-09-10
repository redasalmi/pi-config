import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  buildDirective,
  parseReviewArgs,
  REVIEW_CHOICES,
  REVIEW_MENU_OPTIONS,
  USAGE,
  type ReviewScope,
} from "./scopes.ts";
import { readReviewSkill } from "./skill.ts";
import { notify } from "./utils.ts";

async function promptScope(ctx: ExtensionContext): Promise<ReviewScope | undefined> {
  const choice = await ctx.ui.select("Code review scope", [...REVIEW_MENU_OPTIONS]);
  if (!choice) return undefined;
  const index = REVIEW_MENU_OPTIONS.indexOf(choice as (typeof REVIEW_MENU_OPTIONS)[number]);
  switch (REVIEW_CHOICES[index]) {
    case "base": {
      const base = (await ctx.ui.input("Base branch or ref", "main"))?.trim();
      if (!base) return undefined;
      return { mode: "base", base, head: "HEAD" };
    }
    case "uncommitted":
      return { mode: "uncommitted" };
    case "commit": {
      const commit = (await ctx.ui.input("Commit ref", "HEAD"))?.trim();
      if (!commit) return undefined;
      return { mode: "commit", commit };
    }
    case "custom": {
      const focus = (
        await ctx.ui.input("Review instructions", "e.g. focus on auth, migrations, and error handling")
      )?.trim();
      if (!focus) return undefined;
      return { mode: "custom", focus };
    }
    default:
      return undefined;
  }
}

export function registerReviewCommand(pi: ExtensionAPI): void {
  pi.registerCommand("review", {
    description: "Code review a diff: base branch, uncommitted changes, a commit, or custom focus",
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

      let skill: string;
      try {
        skill = readReviewSkill(pi);
      } catch (error) {
        notify(ctx, error instanceof Error ? error.message : String(error), "error");
        return;
      }

      pi.sendUserMessage(`${skill}\n\n---\n\n${buildDirective(scope)}`);
    },
  });
}
