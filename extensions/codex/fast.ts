import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CodexState, ServiceTier } from "./types.ts";
import { writeStoredServiceTier } from "./storage.ts";
import { describeServiceTiers, findServiceTier } from "./service-tiers.ts";
import { notify } from "./utils.ts";

type ServiceTierDeps = {
  renderStatus: (ctx: ExtensionContext) => boolean;
};

export function createServiceTier(pi: ExtensionAPI, state: CodexState, deps: ServiceTierDeps) {
  function setServiceTier(ctx: ExtensionContext, tier: ServiceTier | undefined, persist: boolean): void {
    state.selectedServiceTier = tier?.id;
    if (persist) writeStoredServiceTier(state.selectedServiceTier ?? null);
    deps.renderStatus(ctx);
  }

  pi.registerCommand("tier", {
    description: "Select a model-advertised Codex service tier",
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) {
        notify(ctx, "Wait for the current task to finish before changing the service tier", "warning");
        return;
      }

      const name = args.trim();
      if (!name) {
        notify(ctx, `Available tiers: ${describeServiceTiers(ctx)}`);
        return;
      }
      const normalizedName = name.toLowerCase();
      if (normalizedName === "off" || normalizedName === "standard" || normalizedName === "default") {
        setServiceTier(ctx, undefined, true);
        notify(ctx, "Codex service tier cleared; standard routing will be used");
        return;
      }
      const tier = findServiceTier(ctx.model, name);
      if (!tier) {
        notify(ctx, `Unknown or unsupported service tier "${name}". Available: ${describeServiceTiers(ctx)}`, "error");
        return;
      }
      setServiceTier(ctx, tier, true);
      notify(ctx, `Codex service tier: ${tier.name} (${tier.id})`);
    },
  });

  return { setServiceTier };
}
