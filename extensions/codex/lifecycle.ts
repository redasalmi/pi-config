import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CodexState } from "./types.ts";
import { DEFAULT_STATUSLINE, PROVIDER, STATUS_KEY } from "./constants.ts";
import { isRecord } from "./utils.ts";
import { readCodexDefaults } from "./storage.ts";
import { findServiceTier, refreshServiceTierCatalog } from "./service-tiers.ts";
import type { createPresetIntegration } from "./preset-integration.ts";
import type { createStatusline } from "./statusline.ts";
import type { createUsage } from "./usage.ts";

export function registerLifecycle(
  pi: ExtensionAPI,
  state: CodexState,
  deps: {
    usage: ReturnType<typeof createUsage>;
    tiers: ReturnType<typeof createPresetIntegration>;
    statusline: ReturnType<typeof createStatusline>;
  },
): void {
  let timer: ReturnType<typeof setInterval> | undefined;
  const wantsUsage = () => state.statusline.some((item) => item === "usage" || item === "credits");
  function refreshLocal(ctx: ExtensionContext): void {
    deps.statusline.renderStatus(ctx);
    if (ctx.hasUI && state.statusline.includes("git")) void deps.usage.loadGitBranch(ctx);
  }

  pi.on("session_shutdown", (_event, ctx) => {
    clearInterval(timer);
    timer = undefined;
    deps.tiers.persist(ctx);
    deps.tiers.dispose();
    deps.usage.cancelAll();
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });

  pi.on("session_start", async (_event, ctx) => {
    const defaults = readCodexDefaults();
    state.statusline = defaults.statusline ?? [...DEFAULT_STATUSLINE];
    state.quotaWarnings = defaults.quotaWarnings ?? true;
    await deps.tiers.initialize(ctx);
    refreshLocal(ctx);
    if (!ctx.hasUI) return;
    if (wantsUsage() || state.quotaWarnings) deps.usage.scheduleRefresh(ctx, true);
    clearInterval(timer);
    timer = setInterval(() => {
      deps.statusline.renderStatus(ctx); // Age-based staleness, no token-by-token work.
      if (ctx.isIdle() && (wantsUsage() || state.quotaWarnings)) deps.usage.scheduleRefresh(ctx);
    }, 30_000);
    timer.unref();
  });

  pi.on("session_tree", (_event, ctx) => {
    deps.tiers.restore(ctx);
    refreshLocal(ctx);
  });
  pi.on("agent_settled", (_event, ctx) => {
    refreshLocal(ctx);
    if (ctx.hasUI && (wantsUsage() || state.quotaWarnings)) deps.usage.scheduleRefresh(ctx);
  });
  pi.on("thinking_level_select", (_event, ctx) => {
    deps.statusline.renderStatus(ctx);
  });
  pi.on("session_compact", (_event, ctx) => {
    deps.statusline.renderStatus(ctx);
  });

  pi.on("model_select", async (_event, ctx) => {
    deps.usage.cancelAll();
    state.lastAttempt = 0;
    if (ctx.model?.provider !== PROVIDER) {
      state.snapshots.clear();
      state.resetCreditCount = undefined;
      state.accountObservedAt = 0;
      state.statusStale = false;
    }
    await refreshServiceTierCatalog();
    state.selectedServiceTier = findServiceTier(ctx.model, state.selectedServiceTier)?.id;
    deps.statusline.renderStatus(ctx);
    if (ctx.hasUI && (wantsUsage() || state.quotaWarnings)) deps.usage.scheduleRefresh(ctx, true);
  });

  pi.on("before_provider_request", (event, ctx) => {
    if (!isRecord(event.payload)) return;
    const tier = findServiceTier(ctx.model, state.selectedServiceTier);
    if (tier) return { ...event.payload, service_tier: tier.id };
  });
}
