import type { ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { PROVIDER } from "./types.ts";
import { itemLabel } from "./render.ts";

export function collectStats(entries: readonly SessionEntry[]) {
  const totals = {
    messages: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    missingUsage: 0,
    missingCost: 0,
  };
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    if (entry.type !== "message" || entry.message.role !== "assistant" || entry.message.provider !== PROVIDER) continue;
    totals.messages++;
    const usage = entry.message.usage;
    for (const field of ["input", "output", "cacheRead", "cacheWrite"] as const) {
      const value = usage?.[field];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) totals[field] += value;
    }
    if (
      !usage ||
      [usage.input, usage.output, usage.cacheRead, usage.cacheWrite].some(
        (value) => !Number.isFinite(value) || value < 0,
      )
    )
      totals.missingUsage++;
    if (typeof usage?.cost?.total === "number" && Number.isFinite(usage.cost.total) && usage.cost.total >= 0)
      totals.cost += usage.cost.total;
    else totals.missingCost++;
  }
  return totals;
}

export function statsText(entries: readonly SessionEntry[], ctx: ExtensionContext): string {
  const theme = ctx.ui.theme;
  const stats = collectStats(entries);
  const promptTokens = stats.input + stats.cacheRead + stats.cacheWrite;
  const cache = promptTokens ? `${((stats.cacheRead / promptTokens) * 100).toFixed(1)}%` : "n/a";
  return [
    theme.fg("mdLink", "OpenCode Go — current session branch"),
    theme.fg("dim", "Local assistant messages only; no account request."),
    itemLabel(ctx, "Messages", String(stats.messages)),
    itemLabel(ctx, "Input", stats.input.toLocaleString("en-US")),
    itemLabel(ctx, "Output", stats.output.toLocaleString("en-US")),
    itemLabel(ctx, "Cache read", stats.cacheRead.toLocaleString("en-US")),
    itemLabel(ctx, "Cache write", stats.cacheWrite.toLocaleString("en-US")),
    itemLabel(ctx, "Cache share", promptTokens ? `${cache} of prompt tokens` : "n/a"),
    itemLabel(
      ctx,
      "Estimated cost",
      `$${stats.cost.toFixed(4)} USD${stats.missingCost ? ` (${stats.missingCost} messages without cost data)` : ""}`,
    ),
    ...(stats.missingUsage ? [theme.fg("warning", `Token data incomplete for ${stats.missingUsage} messages.`)] : []),
    theme.fg(
      "dim",
      "Includes reported usage from failed/aborted messages and pre-compaction messages on this branch. Excludes other branches/sessions, unattributed tool/subagent usage, and summary-generation usage.",
    ),
    theme.fg(
      "dim",
      "Catalog cost estimates are not a bill or Go quota consumption; model multipliers/pricing can differ. Use /opencode usage for subscription limits.",
    ),
  ].join("\n");
}
