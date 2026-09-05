import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CodexState } from "./types.ts";
import { writeStoredServiceTier } from "./storage.ts";
import { describeServiceTiers, findServiceTier, refreshServiceTierCatalog } from "./service-tiers.ts";
import { notify } from "./utils.ts";

type ServiceTierDeps = {
  renderStatus: (ctx: ExtensionContext) => boolean;
  persistSession: (ctx: ExtensionContext) => void;
};

export function createServiceTier(pi: ExtensionAPI, state: CodexState, deps: ServiceTierDeps): void {
  pi.registerCommand("tier", {
    description: "Select a session service tier; /tier save NAME saves a startup default",
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) { notify(ctx, "Wait for the current task to finish before changing the service tier", "warning"); return; }
      await refreshServiceTierCatalog();
      const trimmed = args.trim();
      const save = trimmed.startsWith("save ");
      const name = save ? trimmed.slice(5).trim() : trimmed;
      if (!name) { notify(ctx, `Current tier: ${state.selectedServiceTier ?? "standard"}\nAvailable: ${describeServiceTiers(ctx)}\nUsage: /tier NAME|off | /tier save NAME|off`); return; }
      const standard = ["off", "standard", "default"].includes(name.toLowerCase());
      const tier = standard ? undefined : findServiceTier(ctx.model, name);
      if (!standard && !tier) { notify(ctx, `Unknown or unsupported service tier "${name}". Available: ${describeServiceTiers(ctx)}`, "error"); return; }
      if (save) {
        writeStoredServiceTier(tier?.id ?? null);
        notify(ctx, `Startup service tier: ${tier?.name ?? "standard"}. Current session unchanged.`);
        return;
      }
      state.selectedServiceTier = tier?.id;
      deps.persistSession(ctx);
      deps.renderStatus(ctx);
      notify(ctx, `Session service tier: ${tier ? `${tier.name} (${tier.id})` : "standard"}`);
    },
  });
}
