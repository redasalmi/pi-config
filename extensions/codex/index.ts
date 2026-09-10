import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createCodexState } from "./state.ts";
import { createStatusline } from "./statusline.ts";
import { createUsage, snapshotsFromHeaders, mergeSnapshot } from "./usage.ts";
import { createPresetIntegration } from "./preset-integration.ts";
import { createServiceTier } from "./fast.ts";
import { registerLifecycle } from "./lifecycle.ts";
import { createStatusCommand } from "./status.ts";
import { createQuotaWarnings } from "./quota.ts";
import { registerCodexCommand } from "./commands.ts";
import { PROVIDER } from "./constants.ts";

export default function (pi: ExtensionAPI) {
  const state = createCodexState();
  const statusline = createStatusline(state, { pi });
  const quota = createQuotaWarnings(state);
  const usage = createUsage(pi, state, { renderStatus: statusline.renderStatus, observeQuota: quota.observe });
  const tiers = createPresetIntegration(pi, state, statusline.renderStatus);
  const tier = createServiceTier(state, { renderStatus: statusline.renderStatus, persistSession: tiers.persist });

  registerLifecycle(pi, state, { usage, tiers, statusline });

  registerCodexCommand(pi, {
    status: createStatusCommand(pi, state, usage),
    usage: { handler: usage.handleUsageCommand, completions: usage.usageCompletions },
    statusline: {
      completions: statusline.statuslineCompletions,
      handler: async (args, ctx) => {
        await statusline.handleStatuslineCommand(args, ctx);
        if (state.statusline.includes("git")) await usage.loadGitBranch(ctx);
      },
    },
    tier,
  });

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
}
