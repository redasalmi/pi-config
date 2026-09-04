import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CodexState } from "./types.ts";
import type { createUsage } from "./usage.ts";
import { findServiceTier, isFastActive } from "./service-tiers.ts";
import { formatTokens, getStat, itemLabel, notify, renderCredits, renderWindow } from "./utils.ts";

export function registerStatusCommand(
  pi: ExtensionAPI,
  state: CodexState,
  usage: ReturnType<typeof createUsage>,
): void {
  pi.registerCommand("status", {
    description: "Show Codex model, tier, context, Git, usage, and tool status",
    handler: async (_args, ctx: ExtensionContext) => {
      await usage.refresh(ctx, true);
      await usage.refreshTokenUsage(ctx);
      await usage.loadGitBranch(ctx);
      const context = ctx.getContextUsage();
      const codex = state.snapshots.get("codex");
      const tier = findServiceTier(ctx.model, state.selectedServiceTier);
      const lines = [
        itemLabel(ctx, "Model", ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "none"),
        itemLabel(ctx, "Thinking", pi.getThinkingLevel()),
        itemLabel(ctx, "Preset", state.activePresetName ?? "none"),
        itemLabel(ctx, "Fast", isFastActive(ctx, state.selectedServiceTier) ? "ON" : "OFF"),
        itemLabel(ctx, "Service tier", tier ? `${tier.name} (${tier.id})` : "standard"),
        itemLabel(
          ctx,
          "Context",
          context?.percent === undefined || context?.percent === null ? "unknown" : `${Math.round(context.percent)}%`,
        ),
        itemLabel(ctx, "Git", state.gitBranch ?? "none"),
        itemLabel(ctx, "Tools", pi.getActiveTools().join(", ") || "none"),
      ];
      if (codex?.primary) lines.push(renderWindow(ctx, codex.primary, "primary"));
      if (codex?.secondary) lines.push(renderWindow(ctx, codex.secondary, "secondary"));
      if (codex?.credits) {
        const credits = renderCredits(ctx, codex.credits);
        if (credits) lines.push(credits);
      }
      if (state.resetCreditCount !== undefined) lines.push(itemLabel(ctx, "Reset credits", String(state.resetCreditCount)));
      if (state.tokenUsage?.stats) {
        lines.push(itemLabel(ctx, "Lifetime tokens", formatTokens(getStat(state.tokenUsage.stats, "lifetime_tokens", "lifetimeTokens"))));
      }
      notify(ctx, lines.join("\n"));
    },
  });
}
