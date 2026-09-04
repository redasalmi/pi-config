import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { CodexState } from "./types.ts";
import { PRESET_ENTRY_TYPE, PROVIDER, STATUS_KEY, isRecord } from "./constants.ts";
import {
  loadPresets,
  readStoredPresetName,
  readStoredServiceTier,
  readStoredStatusline,
} from "./storage.ts";
import { findServiceTier } from "./service-tiers.ts";
import { notify } from "./utils.ts";
import type { createPresets } from "./presets.ts";
import type { createStatusline } from "./statusline.ts";
import type { createUsage } from "./usage.ts";

export function registerLifecycle(
  pi: ExtensionAPI,
  state: CodexState,
  deps: {
    usage: ReturnType<typeof createUsage>;
    presets: ReturnType<typeof createPresets>;
    statusline: ReturnType<typeof createStatusline>;
  },
): void {
  pi.on("session_shutdown", (_event, ctx) => {
    deps.usage.cancelRefresh();
    state.activePresetName = undefined;
    state.activePreset = undefined;
    state.originalState = undefined;
    state.selectedServiceTier = undefined;
    state.tokenUsage = undefined;
    state.gitBranch = undefined;
    state.snapshots.clear();
    state.resetCreditCount = undefined;
    state.statusStale = false;
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });

  pi.on("session_start", async (_event, ctx) => {
    state.presets = loadPresets(ctx.cwd, ctx.isProjectTrusted());
    state.activePresetName = undefined;
    state.activePreset = undefined;
    state.originalState = undefined;
    state.statusline = readStoredStatusline();
    state.selectedServiceTier = readStoredServiceTier() ?? undefined;

    const presetFlag = pi.getFlag("preset");
    const savedEntry = [...ctx.sessionManager.getBranch()]
      .reverse()
      .find((entry) => entry.type === "custom" && entry.customType === PRESET_ENTRY_TYPE);
    const savedData = savedEntry?.type === "custom" && isRecord(savedEntry.data) ? savedEntry.data : undefined;
    const sessionName = typeof savedData?.name === "string" ? savedData.name : undefined;
    const storedName =
      typeof presetFlag === "string" && presetFlag.trim() ? presetFlag.trim() : (sessionName ?? readStoredPresetName());

    if (storedName && state.presets[storedName]) {
      await deps.presets.applyPreset(storedName, state.presets[storedName], ctx, {
        persist: false,
        notify: Boolean(presetFlag),
      });
    } else if (typeof presetFlag === "string" && presetFlag.trim()) {
      notify(ctx, `Unknown preset "${presetFlag}". Available: ${deps.presets.getPresetOrder().join(", ")}`, "warning");
      deps.statusline.renderStatus(ctx);
    } else {
      deps.statusline.renderStatus(ctx);
    }

    const selectedTier = findServiceTier(ctx.model, state.selectedServiceTier);
    if (selectedTier) {
      // Persisted names and legacy aliases are normalized to the provider's
      // actual request value before the first request is sent.
      state.selectedServiceTier = selectedTier.id;
    } else if (state.selectedServiceTier) {
      state.selectedServiceTier = undefined;
    }
    await deps.usage.loadGitBranch(ctx);
    deps.statusline.renderStatus(ctx);
    if (!ctx.hasUI) return;
    deps.usage.scheduleRefresh(ctx, true);
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (!ctx.hasUI) return;
    // Refreshing usage is intentionally fire-and-forget. The provider may have
    // replaced the session while the request was in flight, so stale contexts
    // must not turn a best-effort status update into an extension error.
    deps.usage.scheduleRefresh(ctx);
  });

  pi.on("model_select", (_event, ctx) => {
    deps.usage.cancelRefresh();
    state.lastAttempt = 0;
    const selectedTier = findServiceTier(ctx.model, state.selectedServiceTier);
    if (selectedTier) {
      state.selectedServiceTier = selectedTier.id;
    } else if (state.selectedServiceTier) {
      state.selectedServiceTier = undefined;
    }
    deps.statusline.renderStatus(ctx);
    if (!ctx.hasUI) return;
    deps.usage.scheduleRefresh(ctx, true);
  });

  pi.on("before_provider_request", (event, ctx) => {
    if (!isRecord(event.payload)) return;
    const tier = findServiceTier(ctx.model, state.selectedServiceTier);
    if (!tier) return;
    return { ...event.payload, service_tier: tier.id };
  });
}
