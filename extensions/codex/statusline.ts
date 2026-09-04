import type { AutocompleteItem } from "@earendil-works/pi-tui";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CodexState, StatuslineItem } from "./types.ts";
import { DEFAULT_STATUSLINE, STATUSLINE_ITEMS, STATUS_KEY } from "./constants.ts";
import { writeStoredStatusline } from "./storage.ts";
import { formatLimitName } from "./usage.ts";
import { findServiceTier, isFastActive, isUltrafastActive } from "./service-tiers.ts";
import { itemLabel, notify, renderCredits, renderIndividualLimit, renderWindow, shortModelName } from "./utils.ts";

type StatuslineDeps = {
  pi: {
    getThinkingLevel: () => string;
  };
};

export function createStatusline(state: CodexState, deps: StatuslineDeps) {
  function renderStatus(ctx: ExtensionContext, stale = state.statusStale): boolean {
    const parts: string[] = [];
    const codex = state.snapshots.get("codex");
    const context = ctx.getContextUsage();
    const selectedTier = state.selectedServiceTier;
    const activeTier = findServiceTier(ctx.model, selectedTier);

    for (const item of state.statusline) {
      if (item === "preset" && state.activePresetName) parts.push(itemLabel(ctx, "Preset", state.activePresetName));
      if (item === "model" && ctx.model) parts.push(itemLabel(ctx, "Model", shortModelName(ctx.model.id)));
      if (item === "thinking") parts.push(itemLabel(ctx, "Thinking", deps.pi.getThinkingLevel()));
      if (item === "fast" && isFastActive(ctx, selectedTier)) parts.push(itemLabel(ctx, "Fast", "ON"));
      if (item === "fast" && isUltrafastActive(ctx, selectedTier)) parts.push(itemLabel(ctx, "ULTRAFAST", "ON"));
      if (item === "service-tier" && activeTier) parts.push(itemLabel(ctx, "Tier", activeTier.name));
      if (item === "context" && context?.percent !== null && context?.percent !== undefined) {
        parts.push(itemLabel(ctx, "Context", `${Math.round(context.percent)}%`));
      }
      if (item === "credits" && codex?.credits) {
        const credits = renderCredits(ctx, codex.credits);
        if (credits) parts.push(credits);
      }
      if (item === "git" && state.gitBranch) parts.push(itemLabel(ctx, "Git", state.gitBranch));
    }

    if (state.statusline.includes("usage")) {
      const ordered = [...state.snapshots.values()].sort(
        (a, b) => Number(b.limitId === "codex") - Number(a.limitId === "codex"),
      );
      for (const snapshot of ordered) {
        const limitName = formatLimitName(snapshot);
        if (snapshot.primary) parts.push(renderWindow(ctx, snapshot.primary, "primary", limitName));
        if (snapshot.secondary) parts.push(renderWindow(ctx, snapshot.secondary, "secondary", limitName));
      }

      const individual = codex?.individualLimit ? renderIndividualLimit(ctx, codex.individualLimit) : undefined;
      if (individual) parts.push(individual);
      if (codex?.spendControlReached || codex?.rateLimitReachedType) {
        const reason = codex.rateLimitReachedType?.replace(/^(workspace_(owner|member)_)?/, "").replaceAll("_", " ") ?? "limit reached";
        parts.push(ctx.ui.theme.fg("error", reason));
      }
    }
    if (state.statusline.includes("credits") && state.resetCreditCount !== undefined && state.resetCreditCount > 0) {
      parts.push(`${ctx.ui.theme.fg("mdLink", "Resets:")} ${ctx.ui.theme.fg("success", String(state.resetCreditCount))}`);
    }

    if (parts.length === 0) {
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return state.snapshots.size > 0 || state.resetCreditCount !== undefined;
    }
    const label = stale ? "Codex (stale)" : "Codex";
    ctx.ui.setStatus(STATUS_KEY, `${ctx.ui.theme.fg("mdLink", label)} ${parts.join(ctx.ui.theme.fg("dim", " • "))}`);
    return true;
  }

  function statuslineDescription(): string {
    return state.statusline.length > 0 ? state.statusline.join(" · ") : "empty";
  }

  async function handleStatuslineCommand(args: string, ctx: ExtensionContext): Promise<void> {
    const trimmed = args.trim();
    if (!trimmed) {
      notify(ctx, `Statusline: ${statuslineDescription()}\nUsage: /statusline [set|add|remove|reset] [items]`);
      return;
    }
    const [operation, ...rest] = trimmed.split(/\s+/);
    const values = rest.join(" ").split(",").map((item) => item.trim()).filter(Boolean);
    if (operation === "reset") {
      state.statusline = [...DEFAULT_STATUSLINE];
    } else if (["set", "add", "remove"].includes(operation)) {
      const unknown = values.filter((value) => !STATUSLINE_ITEMS.includes(value as StatuslineItem));
      if (unknown.length > 0) {
        notify(ctx, `Unknown statusline items: ${unknown.join(", ")}. Available: ${STATUSLINE_ITEMS.join(", ")}`, "error");
        return;
      }
      const items = values as StatuslineItem[];
      if (operation === "set") state.statusline = [...new Set(items)];
      if (operation === "add") state.statusline = [...new Set([...state.statusline, ...items])];
      if (operation === "remove") state.statusline = state.statusline.filter((item) => !items.includes(item));
    } else {
      notify(ctx, "Usage: /statusline [set|add|remove|reset] [preset,model,thinking,fast,service-tier,context,usage,credits,git]", "error");
      return;
    }
    writeStoredStatusline(state.statusline);
    renderStatus(ctx);
    notify(ctx, `Statusline: ${statuslineDescription()}`);
  }

  function statuslineCompletions(prefix: string): AutocompleteItem[] | null {
    const items = STATUSLINE_ITEMS.filter((item) => item.startsWith(prefix.toLowerCase())).map((item) => ({ value: item, label: item }));
    return items.length > 0 ? items : null;
  }

  return { renderStatus, handleStatuslineCommand, statuslineCompletions };
}
