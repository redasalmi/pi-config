import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CodexState } from "./types.ts";
import type { createUsage } from "./usage.ts";
import { findServiceTier } from "./service-tiers.ts";
import { formatTokens, getStat, itemLabel, notify } from "./utils.ts";

export function registerStatusCommand(pi: ExtensionAPI, state: CodexState, usage: ReturnType<typeof createUsage>): void {
  function text(ctx: ExtensionContext): string {
    const context = ctx.getContextUsage();
    const tier = findServiceTier(ctx.model, state.selectedServiceTier);
    return [
      itemLabel(ctx, "Model", ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "none"),
      itemLabel(ctx, "Thinking", pi.getThinkingLevel()),
      itemLabel(ctx, "Preset", `${state.activePresetName ?? "none"} (${state.presetSelectionSource})`),
      itemLabel(ctx, "Service tier", tier ? `${tier.name} (${tier.id})` : "standard"),
      itemLabel(ctx, "Context", context?.percent == null ? "unknown" : `${Math.round(context.percent)}%`),
      itemLabel(ctx, "Git", state.gitBranch ?? "unknown / not a repository"),
      itemLabel(ctx, "Tools", pi.getActiveTools().join(", ") || "none"),
      itemLabel(ctx, "Plan", state.plan.mode),
      usage.limitsText(ctx),
      ctx.ui.theme.fg("dim", "Use /preset status for configuration sources; /usage cumulative for account token activity."),
    ].join("\n");
  }

  pi.registerCommand("status", {
    description: "Show local Codex status immediately; refresh Git and limits in parallel",
    handler: async (args, ctx) => {
      if (args.trim() && args.trim() !== "tokens") { notify(ctx, "Usage: /status [tokens]", "error"); return; }
      const signal = usage.lifetimeSignal();
      notify(ctx, `${text(ctx)}\n${ctx.ui.theme.fg("dim", "Refreshing…")}`);
      const jobs: Promise<unknown>[] = [usage.refresh(ctx, true), usage.loadGitBranch(ctx, true)];
      if (args.trim() === "tokens") jobs.push(usage.refreshTokenUsage(ctx));
      const results = await Promise.allSettled(jobs);
      if (signal.aborted) return;
      const failures = results.filter((result) => result.status === "rejected").length;
      let updated = text(ctx);
      if (args.trim() === "tokens") {
        const tokens = formatTokens(getStat(state.tokenUsage?.stats, "lifetime_tokens", "lifetimeTokens"));
        updated += `\n${itemLabel(ctx, "Lifetime tokens", tokens)} ${ctx.ui.theme.fg("dim", "(cached on failure)")}`;
      }
      if (failures) updated += `\n${ctx.ui.theme.fg("warning", `${failures} refresh operation(s) unavailable.`)}`;
      notify(ctx, updated);
    },
  });
}
