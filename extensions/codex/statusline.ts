import type { AutocompleteItem } from "@earendil-works/pi-tui";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CodexState, StatuslineItem } from "./types.ts";
import { DEFAULT_STATUSLINE, STALE_AFTER_MS, STATUSLINE_ITEMS, STATUS_KEY } from "./constants.ts";
import { writeStoredStatusline } from "./storage.ts";
import { formatLimitName } from "./usage.ts";
import { findServiceTier, isFastTier, isUltrafastTier } from "./service-tiers.ts";
import { formatWindow, itemLabel, notify, renderCredits, shortModelName, statusColor } from "./utils.ts";

type StatuslineDeps = { pi: { getThinkingLevel: () => string } };

export function createStatusline(state: CodexState, deps: StatuslineDeps) {
  function renderStatus(ctx: ExtensionContext): boolean {
    const hasData = state.snapshots.size > 0 || state.resetCreditCount !== undefined;
    if (!ctx.hasUI) return hasData;
    const parts: string[] = [];
    const codex = state.snapshots.get("codex");
    const context = state.statusline.includes("context") ? ctx.getContextUsage() : undefined;
    const tier = state.statusline.some((item) => item === "fast" || item === "service-tier")
      ? findServiceTier(ctx.model, state.selectedServiceTier) : undefined;
    let stale = false;
    const now = Date.now();
    for (const item of state.statusline) {
      if (item === "preset" && state.activePresetName) parts.push(itemLabel(ctx, "Preset", state.activePresetName));
      if (item === "model" && ctx.model) parts.push(itemLabel(ctx, "Model", shortModelName(ctx.model.id)));
      if (item === "thinking") parts.push(itemLabel(ctx, "Thinking", deps.pi.getThinkingLevel()));
      if (item === "fast" && isFastTier(tier)) parts.push(itemLabel(ctx, "Fast", "ON"));
      if (item === "fast" && isUltrafastTier(tier)) parts.push(itemLabel(ctx, "ULTRAFAST", "ON"));
      if (item === "service-tier" && tier) parts.push(itemLabel(ctx, "Tier", tier.name));
      if (item === "context" && context?.percent !== null && context?.percent !== undefined) parts.push(itemLabel(ctx, "Context", `${Math.round(context.percent)}%`));
      if (item === "git" && state.gitBranch) parts.push(itemLabel(ctx, "Git", state.gitBranch));
      if (item === "credits") {
        if (codex?.credits) {
          const credits = renderCredits(ctx, codex.credits);
          if (credits) parts.push(credits);
        }
        if (state.resetCreditCount !== undefined && state.resetCreditCount > 0) parts.push(itemLabel(ctx, "Resets", String(state.resetCreditCount)));
        if (codex?.credits || state.resetCreditCount !== undefined) stale ||= !state.accountObservedAt || now - state.accountObservedAt > STALE_AFTER_MS;
      }
      if (item === "usage") {
        const ordered = [...state.snapshots.values()].sort((a, b) => Number(b.limitId === "codex") - Number(a.limitId === "codex"));
        for (const snapshot of ordered) {
          for (const kind of ["primary", "secondary"] as const) {
            const window = snapshot[kind];
            if (!window) continue;
            const left = Math.max(0, Math.min(100, Math.round(100 - window.used_percent)));
            const label = [formatLimitName(snapshot), formatWindow(window.limit_window_seconds)].filter(Boolean).join(" ");
            parts.push(`${ctx.ui.theme.fg("mdLink", label)} ${ctx.ui.theme.fg(statusColor(left), `${left}%`)}`);
            stale ||= !window.observedAt || now - window.observedAt > STALE_AFTER_MS;
          }
        }
        if (codex?.spendControlReached || codex?.rateLimitReachedType) parts.push(ctx.ui.theme.fg("error", "limit reached"));
        if (codex?.individualLimit?.remaining_percent !== undefined) {
          const left = Math.max(0, Math.min(100, Math.round(codex.individualLimit.remaining_percent)));
          parts.push(ctx.ui.theme.fg(statusColor(left), `monthly ${left}%`));
          stale ||= !state.accountObservedAt || now - state.accountObservedAt > STALE_AFTER_MS;
        }
      }
    }
    stale ||= state.statusStale && state.statusline.some((item) => item === "usage" || item === "credits");
    if (stale) parts.push(ctx.ui.theme.fg("warning", "stale · /usage limits"));
    ctx.ui.setStatus(STATUS_KEY, parts.length ? `${ctx.ui.theme.fg("mdLink", "Codex")} ${parts.join(ctx.ui.theme.fg("dim", " • "))}` : undefined);
    return hasData;
  }

  async function handleStatuslineCommand(args: string, ctx: ExtensionContext): Promise<void> {
    const [operation, ...rest] = args.trim().split(/\s+/);
    if (!operation) {
      notify(ctx, `Statusline: ${state.statusline.join(", ") || "empty"}\nUsage: /statusline set|add|remove items | reset. Percentages are quota remaining.`);
      return;
    }
    const values = rest.join(" ").split(",").map((item) => item.trim()).filter(Boolean);
    if (operation === "reset") state.statusline = [...DEFAULT_STATUSLINE];
    else if (["set", "add", "remove"].includes(operation)) {
      const unknown = values.filter((value) => !STATUSLINE_ITEMS.includes(value as StatuslineItem));
      if (unknown.length) { notify(ctx, `Unknown items: ${unknown.join(", ")}. Available: ${STATUSLINE_ITEMS.join(", ")}`, "error"); return; }
      const items = values as StatuslineItem[];
      if (operation === "set") state.statusline = [...new Set(items)];
      if (operation === "add") state.statusline = [...new Set([...state.statusline, ...items])];
      if (operation === "remove") state.statusline = state.statusline.filter((item) => !items.includes(item));
    } else { notify(ctx, "Usage: /statusline set|add|remove items | reset", "error"); return; }
    writeStoredStatusline(state.statusline);
    renderStatus(ctx);
    notify(ctx, `Statusline: ${state.statusline.join(", ") || "empty"}`);
  }

  function statuslineCompletions(prefix: string): AutocompleteItem[] | null {
    const match = prefix.match(/^(set|add|remove)\s+(.*)$/);
    if (!match) return ["set ", "add ", "remove ", "reset"].filter((value) => value.startsWith(prefix)).map((value) => ({ value, label: value }));
    const split = match[2].lastIndexOf(",") + 1;
    const stem = `${match[1]} ${match[2].slice(0, split)}`;
    return STATUSLINE_ITEMS.filter((item) => item.startsWith(match[2].slice(split).trim())).map((item) => ({ value: `${stem}${item}`, label: item }));
  }

  return { renderStatus, handleStatuslineCommand, statuslineCompletions };
}
