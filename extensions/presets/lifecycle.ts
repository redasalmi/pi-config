import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { PresetsState } from "./types.ts";
import type { createPresets } from "./presets.ts";
import { loadPresets, readStoredPresetName } from "./storage.ts";
import { getServiceTierIntegration, PERSIST_PRESET } from "./integration.ts";
import { notify } from "./utils.ts";

export function registerLifecycle(pi: ExtensionAPI, state: PresetsState, presets: ReturnType<typeof createPresets>): void {
  let initialTools: string[] = [];
  const unsubscribe = pi.events.on(PERSIST_PRESET, (data) => {
    presets.persist(data as Parameters<typeof presets.persist>[0]);
  });

  pi.on("session_start", async (event, ctx) => {
    const loaded = loadPresets(ctx.cwd, ctx.isProjectTrusted());
    state.presets = loaded.presets;
    state.presetSources = loaded.sources;
    initialTools = [...pi.getActiveTools()];
    await getServiceTierIntegration(pi)?.initialize(ctx);
    const flag = pi.getFlag("preset");
    const presetFlag = event.reason === "startup" && typeof flag === "string" ? flag.trim() : "";
    const restored = presets.restore(ctx);
    const name = presetFlag || (!restored ? readStoredPresetName() : undefined);
    if (name === "none") {
      await presets.clearPreset(ctx, { persist: true, notify: Boolean(presetFlag), source: "CLI --preset" });
    } else if (name) {
      if (Object.hasOwn(state.presets, name)) await presets.applyPreset(name, state.presets[name], ctx, { persist: true, notify: Boolean(presetFlag), source: presetFlag ? "CLI --preset" : "global default" });
      else notify(ctx, `Unknown preset "${name}". Use /preset status to inspect configuration.`, "warning");
    }
    presets.persist(ctx);
    presets.updateStatus(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    if (!presets.restore(ctx)) {
      pi.setActiveTools(initialTools);
      state.selectedServiceTier = undefined;
      state.presetSelectionSource = "session branch (none)";
    }
    presets.updateStatus(ctx);
  });

  pi.on("before_agent_start", (event, ctx) => {
    presets.persist(ctx);
    const instructions = state.activePreset?.instructions?.trim();
    if (instructions) return { systemPrompt: `${event.systemPrompt}\n\n${instructions}` };
  });

  pi.on("session_shutdown", (_event, ctx) => {
    presets.persist(ctx);
    unsubscribe();
  });
}
