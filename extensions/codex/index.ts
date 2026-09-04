import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { CodexState } from "./types.ts";
import { DEFAULT_PRESETS, DEFAULT_STATUSLINE } from "./constants.ts";
import { createStatusline } from "./statusline.ts";
import { createUsage } from "./usage.ts";
import { createPresets } from "./presets.ts";
import { createServiceTier } from "./fast.ts";
import { registerLifecycle } from "./lifecycle.ts";
import { registerPresetCommands } from "./preset-command.ts";
import { registerStatusCommand } from "./status.ts";
import { isRecord, notify } from "./utils.ts";
import { PROVIDER } from "./constants.ts";
import { snapshotsFromHeaders, mergeSnapshot } from "./usage.ts";

export default function (pi: ExtensionAPI) {
  const state: CodexState = {
    snapshots: new Map(),
    resetCreditCount: undefined,
    lastAttempt: 0,
    refreshGeneration: 0,
    refreshPromise: undefined,
    refreshAbortController: undefined,
    statusStale: false,
    presets: { ...DEFAULT_PRESETS },
    activePresetName: undefined,
    activePreset: undefined,
    originalState: undefined,
    selectedServiceTier: undefined,
    statusline: [...DEFAULT_STATUSLINE],
    tokenUsage: undefined,
    gitBranch: undefined,
  };

  const statusline = createStatusline(state, { pi });
  const usage = createUsage(pi, state, { renderStatus: statusline.renderStatus });
  const presets = createPresets(pi, state, { renderStatus: statusline.renderStatus });
  createServiceTier(pi, state, { renderStatus: statusline.renderStatus });

  registerLifecycle(pi, state, { usage, presets, statusline });
  registerPresetCommands(pi, state, presets);
  registerStatusCommand(pi, state, usage);

  pi.on("after_provider_response", (event, ctx) => {
    if (ctx.model?.provider !== PROVIDER) return;
    const updates = snapshotsFromHeaders(event.headers);
    if (updates.length === 0) return;
    for (const update of updates) state.snapshots.set(update.limitId, mergeSnapshot(state.snapshots.get(update.limitId), update));
    state.lastAttempt = Date.now();
    state.statusStale = false;
    statusline.renderStatus(ctx);
  });

  pi.on("before_agent_start", (event) => {
    const instructions = state.activePreset?.instructions?.trim();
    if (!instructions) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${instructions}` };
  });

  pi.registerCommand("statusline", {
    description: "Configure Codex footer fields",
    getArgumentCompletions: statusline.statuslineCompletions,
    handler: statusline.handleStatuslineCommand,
  });

  pi.registerCommand("usage", {
    description: "View Codex rate limits, token activity, or redeem a usage limit reset",
    handler: usage.handleUsageCommand,
  });
}
