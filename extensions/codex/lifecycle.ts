import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CodexState } from "./types.ts";
import { DEFAULT_STATUSLINE, PROVIDER, STATUS_KEY, isRecord } from "./constants.ts";
import { loadPresets, readCodexDefaults } from "./storage.ts";
import { findServiceTier, refreshServiceTierCatalog } from "./service-tiers.ts";
import { notify } from "./utils.ts";
import type { createPresets } from "./presets.ts";
import type { createStatusline } from "./statusline.ts";
import type { createUsage } from "./usage.ts";

export function registerLifecycle(pi: ExtensionAPI, state: CodexState, deps: {
  usage: ReturnType<typeof createUsage>;
  presets: ReturnType<typeof createPresets>;
  statusline: ReturnType<typeof createStatusline>;
}): void {
  let timer: ReturnType<typeof setInterval> | undefined;
  let initialTools: string[] = [];
  const wantsUsage = () => state.statusline.some((item) => item === "usage" || item === "credits");
  function refreshLocal(ctx: ExtensionContext): void {
    deps.statusline.renderStatus(ctx);
    if (ctx.hasUI && state.statusline.includes("git")) void deps.usage.loadGitBranch(ctx);
  }

  pi.on("session_shutdown", (_event, ctx) => {
    clearInterval(timer);
    timer = undefined;
    deps.presets.persist(ctx);
    deps.usage.cancelAll();
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });

  pi.on("session_start", async (event, ctx) => {
    const loaded = loadPresets(ctx.cwd, ctx.isProjectTrusted());
    state.presets = loaded.presets;
    state.presetSources = loaded.sources;
    const defaults = readCodexDefaults();
    state.statusline = defaults.statusline ?? [...DEFAULT_STATUSLINE];
    state.quotaWarnings = defaults.quotaWarnings ?? true;
    state.selectedServiceTier = defaults.serviceTier ?? undefined;
    initialTools = [...pi.getActiveTools()];
    await refreshServiceTierCatalog();
    const flag = pi.getFlag("preset");
    // A CLI flag is a startup override, not a command to reapply on every /reload.
    const presetFlag = event.reason === "startup" && typeof flag === "string" ? flag.trim() : "";
    const restored = deps.presets.restore(ctx);
    const name = presetFlag || (!restored ? defaults.preset : undefined);
    if (name === "none") {
      await deps.presets.clearPreset(ctx, { persist: true, notify: Boolean(presetFlag), source: "CLI --preset" });
    } else if (name) {
      if (Object.hasOwn(state.presets, name)) await deps.presets.applyPreset(name, state.presets[name], ctx, { persist: true, notify: Boolean(presetFlag), source: presetFlag ? "CLI --preset" : "global default" });
      else notify(ctx, `Unknown preset "${name}". Use /preset status to inspect configuration.`, "warning");
    }
    state.selectedServiceTier = findServiceTier(ctx.model, state.selectedServiceTier)?.id;
    deps.presets.persist(ctx);
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
    if (!deps.presets.restore(ctx)) {
      pi.setActiveTools(initialTools);
      state.selectedServiceTier = undefined;
      state.presetSelectionSource = "session branch (none)";
    }
    refreshLocal(ctx);
  });
  pi.on("agent_settled", (_event, ctx) => {
    refreshLocal(ctx);
    if (ctx.hasUI && (wantsUsage() || state.quotaWarnings)) deps.usage.scheduleRefresh(ctx);
  });
  pi.on("thinking_level_select", (_event, ctx) => { deps.statusline.renderStatus(ctx); });
  pi.on("session_compact", (_event, ctx) => { deps.statusline.renderStatus(ctx); });

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
