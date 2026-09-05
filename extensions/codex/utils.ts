import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Credits, IndividualLimit, UsageWindow } from "./types.ts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function notify(ctx: ExtensionContext, message: string, type: "info" | "warning" | "error" = "info"): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, type);
  } else if (type !== "info") {
    console.error(message);
  }
}

export function getHeader(headers: Record<string, string | null> | undefined, name: string): string | undefined {
  const target = name.toLowerCase();
  const value = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === target)?.[1];
  return typeof value === "string" ? value : undefined;
}

export function getAccountId(token: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    return payload?.["https://api.openai.com/auth"]?.chatgpt_account_id;
  } catch {
    return undefined;
  }
}

export function itemLabel(ctx: ExtensionContext, label: string, value: string): string {
  return `${ctx.ui.theme.fg("mdLink", `${label}:`)} ${ctx.ui.theme.fg("success", value)}`;
}

export function shortModelName(modelId: string): string {
  return modelId.replace(/^gpt-5\.6-/, "");
}

export function getStat(
  stats: { [key: string]: unknown } | undefined,
  snake: string,
  camel: string,
): number | undefined {
  const value = stats?.[snake] ?? stats?.[camel];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function formatTokens(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return "unknown";
  const amount = value as number;
  if (Math.abs(amount) >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return String(Math.round(amount));
}

export function formatWindow(seconds: number | undefined): string {
  if (!seconds) return "limit";
  const minutes = Math.round(seconds / 60);
  if (minutes === 24 * 60) return "day";
  if (minutes === 7 * 24 * 60) return "week";
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

export function formatRemainingTime(window: Pick<UsageWindow, "reset_at" | "reset_after_seconds">): string {
  const seconds = window.reset_at
    ? Math.max(0, window.reset_at - Math.floor(Date.now() / 1000))
    : window.reset_after_seconds;
  if (seconds === undefined) return "reset unknown";
  if (seconds < 60) return "resets <1m";

  const totalMinutes = Math.ceil(seconds / 60);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [days ? `${days}d` : "", hours ? `${hours}h` : "", !days && minutes ? `${minutes}m` : ""].filter(
    Boolean,
  );
  return `resets ${parts.join(" ")}`;
}

export function statusColor(percentLeft: number): "error" | "warning" | "success" {
  return percentLeft <= 10 ? "error" : percentLeft <= 30 ? "warning" : "success";
}

export function renderWindow(
  ctx: ExtensionContext,
  window: UsageWindow,
  kind: "primary" | "secondary",
  limitName?: string,
): string {
  const used = Math.max(0, Math.min(100, Math.round(window.used_percent)));
  const left = 100 - used;
  const windowName = formatWindow(window.limit_window_seconds);
  const label = [limitName, windowName === "limit" ? kind : windowName].filter(Boolean).join(" ");
  return `${ctx.ui.theme.fg("mdLink", `${label}:`)} ${ctx.ui.theme.fg(statusColor(left), `${left}% left`)} ${ctx.ui.theme.fg("dim", `(${used}% used, ${formatRemainingTime(window)})`)}`;
}

export function renderIndividualLimit(ctx: ExtensionContext, limit: IndividualLimit): string | undefined {
  if (!Number.isFinite(limit.remaining_percent)) return undefined;
  const left = Math.max(0, Math.min(100, Math.round(limit.remaining_percent!)));
  const usage = limit.used !== undefined && limit.limit !== undefined ? `, ${limit.used}/${limit.limit} used` : "";
  return `${ctx.ui.theme.fg("mdLink", "monthly:")} ${ctx.ui.theme.fg(statusColor(left), `${left}% left`)} ${ctx.ui.theme.fg("dim", `(${formatRemainingTime(limit)}${usage})`)}`;
}

export function renderCredits(ctx: ExtensionContext, credits: Credits): string | undefined {
  if (credits.unlimited) return `${ctx.ui.theme.fg("mdLink", "credits:")} ${ctx.ui.theme.fg("success", "unlimited")}`;
  if (credits.balance !== undefined && credits.balance !== null) {
    return `${ctx.ui.theme.fg("mdLink", "credits:")} ${ctx.ui.theme.fg("success", String(credits.balance))}`;
  }
  return undefined;
}
