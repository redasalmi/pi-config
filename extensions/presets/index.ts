import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPresetsState } from "./state.ts";
import { createPresets } from "./presets.ts";
import { registerPresetCommands } from "./commands.ts";
import { registerLifecycle } from "./lifecycle.ts";
import { PRESET_CHANGED, type PresetChanged } from "./integration.ts";

export default function (pi: ExtensionAPI) {
  const state = createPresetsState();
  const presets = createPresets(pi, state, {
    renderStatus(ctx) {
      const update: PresetChanged = { ctx, name: state.activePresetName, source: state.presetSelectionSource };
      pi.events.emit(PRESET_CHANGED, update);
      return true;
    },
  });
  registerPresetCommands(pi, state, presets);
  registerLifecycle(pi, state, presets);
}
