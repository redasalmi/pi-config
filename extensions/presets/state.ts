import { DEFAULT_PRESETS } from "./constants.ts";
import type { PresetsState } from "./types.ts";

export function createPresetsState(): PresetsState {
  return {
    presets: { ...DEFAULT_PRESETS },
    presetSources: {},
    presetSelectionSource: "none",
    activePresetName: undefined,
    activePreset: undefined,
    originalState: undefined,
    selectedServiceTier: undefined,
  };
}
