import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { PRESET_ENTRY_TYPE } from "../presets/constants.ts";
import {
  PERSIST_PRESET,
  PRESET_CHANGED,
  SERVICE_TIER_REQUEST,
  type PresetChanged,
  type ServiceTierIntegration,
  type ServiceTierRequest,
} from "../presets/integration.ts";
import type { CodexState } from "./types.ts";
import { isRecord } from "./utils.ts";
import { readStoredServiceTier } from "./storage.ts";
import { findServiceTier, refreshServiceTierCatalog } from "./service-tiers.ts";

export const SERVICE_TIER_ENTRY_TYPE = "codex-service-tier";

export function createPresetIntegration(
  pi: ExtensionAPI,
  state: CodexState,
  renderStatus: (ctx: ExtensionContext) => boolean,
) {
  let initialization: Promise<void> | undefined;
  let lastSaved: string | null | undefined;

  function restore(ctx: ExtensionContext, defaultTier?: string | null): void {
    const entry = ctx.sessionManager
      .getBranch()
      .reverse()
      .find(
        (entry) =>
          entry.type === "custom" &&
          [SERVICE_TIER_ENTRY_TYPE, PRESET_ENTRY_TYPE].includes(entry.customType) &&
          isRecord(entry.data) &&
          (entry.data.serviceTier === null || typeof entry.data.serviceTier === "string"),
      );
    const requested =
      entry?.type === "custom" && isRecord(entry.data) ? (entry.data.serviceTier as string | null) : defaultTier;
    state.selectedServiceTier = findServiceTier(ctx.model, requested ?? undefined)?.id;
    lastSaved = entry ? requested : undefined;
  }

  function initialize(ctx: ExtensionContext): Promise<void> {
    // Both extensions can request this; never reset a preset applied earlier in load order.
    initialization ??= refreshServiceTierCatalog().then(() => {
      restore(ctx, readStoredServiceTier());
      // Pin the startup tier without saving Presets before its restoration runs.
      persistTier();
    });
    return initialization;
  }

  function persistTier(): void {
    const serviceTier = state.selectedServiceTier ?? null;
    if (serviceTier !== lastSaved) {
      pi.appendEntry(SERVICE_TIER_ENTRY_TYPE, { serviceTier });
      lastSaved = serviceTier;
    }
  }

  function persist(ctx: ExtensionContext): void {
    persistTier();
    pi.events.emit(PERSIST_PRESET, ctx);
  }

  const integration: ServiceTierIntegration = {
    initialize,
    get: () => state.selectedServiceTier,
    resolve: (model, requested) => findServiceTier(model, requested)?.id,
    set(ctx, tier) {
      state.selectedServiceTier = tier;
      renderStatus(ctx);
    },
  };
  const unsubscribeTier = pi.events.on(SERVICE_TIER_REQUEST, (data) => {
    (data as ServiceTierRequest).integration = integration;
  });
  const unsubscribeStatus = pi.events.on(PRESET_CHANGED, (data) => {
    const update = data as PresetChanged;
    state.activePresetName = update.name;
    state.presetSelectionSource = update.source;
    renderStatus(update.ctx);
  });

  return {
    initialize,
    restore,
    persist,
    dispose() {
      unsubscribeTier();
      unsubscribeStatus();
    },
  };
}
