import { DEFAULT_PRESETS, DEFAULT_STATUSLINE } from "./constants.ts";
import type { CodexState } from "./types.ts";

export function createCodexState(): CodexState {
  return {
    snapshots: new Map(),
    resetCreditCount: undefined,
    lastAttempt: 0,
    accountObservedAt: 0,
    refreshGeneration: 0,
    refreshPromise: undefined,
    refreshAbortController: undefined,
    statusStale: false,
    presets: { ...DEFAULT_PRESETS },
    presetSources: {},
    presetSelectionSource: "none",
    activePresetName: undefined,
    activePreset: undefined,
    originalState: undefined,
    selectedServiceTier: undefined,
    statusline: [...DEFAULT_STATUSLINE],
    tokenUsage: undefined,
    gitBranch: undefined,
    plan: { mode: "off", steps: [] },
    quotaWarnings: true,
  };
}
