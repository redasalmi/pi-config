import { DEFAULT_STATUSLINE } from "./constants.ts";
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
    presetSelectionSource: "none",
    activePresetName: undefined,
    selectedServiceTier: undefined,
    statusline: [...DEFAULT_STATUSLINE],
    tokenUsage: undefined,
    gitBranch: undefined,
    quotaWarnings: true,
  };
}
