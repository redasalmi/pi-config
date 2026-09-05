import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createCodexState } from "./state.ts";
import { createStatusline } from "./statusline.ts";
import { createUsage, snapshotsFromHeaders, mergeSnapshot } from "./usage.ts";
import { createPresets } from "./presets.ts";
import { createServiceTier } from "./fast.ts";
import { registerLifecycle } from "./lifecycle.ts";
import { registerPresetCommands } from "./preset-command.ts";
import { registerStatusCommand } from "./status.ts";
import { createQuotaWarnings } from "./quota.ts";
import { registerPlanning } from "./plan.ts";
import { registerGitCommands } from "./git.ts";
import { PROVIDER } from "./constants.ts";

export default function (pi: ExtensionAPI) {
  const state = createCodexState();
  const statusline = createStatusline(state, { pi });
  const quota = createQuotaWarnings(state);
  const usage = createUsage(pi, state, { renderStatus: statusline.renderStatus, observeQuota: quota.observe });
  const presets = createPresets(pi, state, { renderStatus: statusline.renderStatus });
  createServiceTier(pi, state, { renderStatus: statusline.renderStatus, persistSession: presets.persist });

  registerLifecycle(pi, state, { usage, presets, statusline });
  registerPresetCommands(pi, state, presets);
  registerStatusCommand(pi, state, usage);
  registerPlanning(pi, state);
  registerGitCommands(pi, state);
  pi.on("session_shutdown", () => quota.clear());

  pi.on("after_provider_response", (event, ctx) => {
    if (ctx.model?.provider !== PROVIDER) return;
    const updates = snapshotsFromHeaders(event.headers);
    if (!updates.length) return;
    const merged = updates.map((update) => {
      const snapshot = mergeSnapshot(state.snapshots.get(update.limitId), update);
      state.snapshots.set(update.limitId, snapshot);
      return snapshot;
    });
    // Partial headers must not postpone full-account refreshes or clear their errors.
    // Warn from merged windows so missing reset headers do not reset deduplication.
    quota.observe(ctx, merged);
    statusline.renderStatus(ctx);
  });

  pi.on("before_agent_start", (event, ctx) => {
    presets.persist(ctx);
    const instructions = state.activePreset?.instructions?.trim();
    if (instructions) return { systemPrompt: `${event.systemPrompt}\n\n${instructions}` };
  });

  pi.registerCommand("statusline", {
    description: "Configure ordered Codex footer fields (quota percentages are remaining)",
    getArgumentCompletions: statusline.statuslineCompletions,
    handler: async (args, ctx) => {
      await statusline.handleStatuslineCommand(args, ctx);
      if (state.statusline.includes("git")) await usage.loadGitBranch(ctx);
    },
  });
  pi.registerCommand("usage", {
    description: "View account limits/token activity, configure warnings, or confirm a reset redemption",
    getArgumentCompletions: (prefix) => ["limits", "daily", "weekly", "cumulative", "reset", "warnings on", "warnings off"].filter((value) => value.startsWith(prefix)).map((value) => ({ value, label: value })),
    handler: usage.handleUsageCommand,
  });
}
