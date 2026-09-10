export const PROVIDER = "opencode-go";
export const STATUS_KEY = "opencode";
export const USAGE_URL = "https://opencode.ai/zen/go/v1/usage";
export const CONSOLE_URL = "https://opencode.ai/auth";
export const MIN_REFRESH_MS = 60_000;
export const STALE_AFTER_MS = 15 * 60_000;
export const WINDOW_NAMES = ["rolling", "weekly", "monthly"] as const;
export type WindowName = typeof WINDOW_NAMES[number];
export const WINDOW_LABELS: Record<WindowName, string> = { rolling: "5h", weekly: "week", monthly: "month" };
export const STATUSLINE_ITEMS = ["usage", "resets", "model", "thinking", "context", "freshness"] as const;
export type StatuslineItem = typeof STATUSLINE_ITEMS[number];
export type Settings = { warnings: boolean; statusline: StatuslineItem[] };
export const defaultSettings = (): Settings => ({ warnings: true, statusline: ["usage"] });

export type UsageWindow = { status: "ok" | "rate-limited"; usedPercent: number; resetsAt: number };
export type Snapshot = { windows: Record<WindowName, UsageWindow>; observedAt: number };
export type Issue = "missing-key" | "auth" | "entitlement" | "network" | "timeout" | "invalid-response" | "rate-limit" | "server" | "endpoint";
export type State = {
  settings: Settings;
  snapshot?: Snapshot;
  issue?: Issue;
  httpStatus?: number;
  retryAt?: number;
  refreshing: boolean;
  lastAttempt?: number;
};
export const createState = (): State => ({ settings: defaultSettings(), refreshing: false });

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isStale(state: State, now = Date.now()): boolean {
  return Boolean(state.snapshot && (state.issue || now - state.snapshot.observedAt > STALE_AFTER_MS ||
    WINDOW_NAMES.some((name) => state.snapshot!.windows[name].resetsAt <= now)));
}

export function resetText(resetsAt: number, now = Date.now()): string {
  if (resetsAt <= now) return "reset due; refresh needed";
  const minutes = Math.ceil((resetsAt - now) / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return `resets in ${[days ? `${days}d` : "", hours ? `${hours}h` : "", !days ? `${minutes % 60}m` : ""].filter(Boolean).join(" ")}`;
}

export function notify(ctx: { hasUI: boolean; ui: { notify(message: string, type?: "info" | "warning" | "error"): void } }, text: string, type: "info" | "warning" | "error" = "info"): void {
  if (ctx.hasUI) ctx.ui.notify(text, type);
}
