import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { resetText, WINDOW_LABELS, type UsageWindow, type WindowName } from "./types.ts";

export type StatusColor = "error" | "warning" | "success";

// Labels use the theme's link accent and values its success color, matching the
// Codex extension's informational output so both commands read the same way.
export function itemLabel(ctx: ExtensionContext, label: string, value: string): string {
  return `${ctx.ui.theme.fg("mdLink", `${label}:`)} ${ctx.ui.theme.fg("success", value)}`;
}

export function statusColor(percentLeft: number): StatusColor {
  return percentLeft <= 10 ? "error" : percentLeft <= 30 ? "warning" : "success";
}

export function renderWindow(ctx: ExtensionContext, name: WindowName, window: UsageWindow): string {
  // Preserve the upstream value (and match the footer) instead of rounding to whole percent.
  const left = 100 - window.usedPercent;
  const color: StatusColor = window.status === "rate-limited" ? "error" : statusColor(left);
  const detail = `${window.usedPercent}% used, ${window.status}, ${resetText(window.resetsAt)} · ${new Date(window.resetsAt).toISOString()}`;
  return `${ctx.ui.theme.fg("mdLink", `${WINDOW_LABELS[name]}:`)} ${ctx.ui.theme.fg(color, `${left}% left`)} ${ctx.ui.theme.fg("dim", `(${detail})`)}`;
}
