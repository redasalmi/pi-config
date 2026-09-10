import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  defaultSettings,
  isStale,
  PROVIDER,
  resetText,
  STATUS_KEY,
  STATUSLINE_ITEMS,
  WINDOW_LABELS,
  WINDOW_NAMES,
  type State,
  type StatuslineItem,
} from "./types.ts";

export function parseStatusline(args: string, current: StatuslineItem[]): StatuslineItem[] {
  const [operation, ...rest] = args.trim().split(/\s+/);
  if (operation === "reset" && rest.length === 0) return defaultSettings().statusline;
  if (!["set", "add", "remove"].includes(operation))
    throw new Error("Use /opencode statusline set|add|remove FIELDS or reset.");
  const values = rest
    .join(" ")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (values.some((item) => !STATUSLINE_ITEMS.includes(item as StatuslineItem))) {
    throw new Error(`Unknown footer field. Available: ${STATUSLINE_ITEMS.join(", ")}.`);
  }
  if (!values.length && operation !== "set") throw new Error("Specify comma-separated footer fields.");
  const items = [...new Set(values as StatuslineItem[])];
  if (operation === "set") return items;
  if (operation === "add") return [...new Set([...current, ...items])];
  return current.filter((item) => !items.includes(item));
}

export function createStatusline(state: State, thinking: () => string) {
  function render(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    if (ctx.model?.provider !== PROVIDER || !state.settings.statusline.length) {
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }
    const parts: string[] = [];
    const snapshot = state.snapshot;
    const stale = isStale(state);
    let showsAccount = false;
    for (const field of state.settings.statusline) {
      if (field === "model") parts.push(ctx.model.name);
      if (field === "thinking") parts.push(thinking());
      if (field === "context") {
        const percent = ctx.getContextUsage()?.percent;
        if (typeof percent === "number" && Number.isFinite(percent)) parts.push(`context ${Math.round(percent)}%`);
      }
      if (field === "usage" || field === "resets" || field === "freshness") showsAccount = true;
      if (field === "usage") {
        if (!snapshot)
          parts.push(state.refreshing ? "quota loading" : state.issue ? "quota unavailable" : "quota unknown");
        else
          for (const name of WINDOW_NAMES) {
            const window = snapshot.windows[name];
            const left = 100 - window.usedPercent;
            const color = stale
              ? "warning"
              : window.status === "rate-limited" || left <= 10
                ? "error"
                : left <= 30
                  ? "warning"
                  : "success";
            parts.push(
              ctx.ui.theme.fg(
                color,
                `${WINDOW_LABELS[name]} ${left}% left${window.status === "rate-limited" ? " (limited)" : ""}`,
              ),
            );
          }
      }
      if (field === "resets") {
        if (!snapshot) parts.push("resets unknown");
        else
          for (const name of WINDOW_NAMES)
            parts.push(`${WINDOW_LABELS[name]} ${resetText(snapshot.windows[name].resetsAt)}`);
      }
      if (field === "freshness")
        parts.push(
          snapshot
            ? `updated ${Math.max(0, Math.floor((Date.now() - snapshot.observedAt) / 60_000))}m ago`
            : "not refreshed",
        );
    }
    if (showsAccount && stale) parts.push(ctx.ui.theme.fg("warning", "stale · /opencode usage"));
    else if (showsAccount && state.issue) parts.push(ctx.ui.theme.fg("warning", "refresh failed · /opencode status"));
    ctx.ui.setStatus(STATUS_KEY, parts.length ? `Go · ${parts.join(" · ")}` : undefined);
  }
  return { render };
}
