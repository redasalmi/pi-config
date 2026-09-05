import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CodexState, RateLimitSnapshot } from "./types.ts";
import { formatLimitName } from "./usage.ts";
import { formatRemainingTime, formatWindow, notify } from "./utils.ts";

export function createQuotaWarnings(state: CodexState) {
  const warned = new Map<string, { reset?: number; threshold: number; left: number }>();
  function observe(ctx: ExtensionContext, snapshots: Iterable<RateLimitSnapshot>): void {
    if (!state.quotaWarnings) return;
    for (const snapshot of snapshots) {
      for (const kind of ["primary", "secondary"] as const) {
        const window = snapshot[kind];
        if (!window) continue;
        const key = `${snapshot.limitId}/${kind}`;
        const left = Math.max(0, Math.min(100, 100 - window.used_percent));
        let previous = warned.get(key);
        // Relative-only windows can still signal a refill by decreasing usage.
        if (previous && (previous.reset !== window.reset_at || (!window.reset_at && left > previous.left))) previous = undefined;
        const threshold = left <= 10 ? 10 : left <= 30 ? 30 : 100;
        if (threshold < (previous?.threshold ?? 100)) {
          const label = [formatLimitName(snapshot), formatWindow(window.limit_window_seconds)].filter(Boolean).join(" ");
          notify(ctx, `Codex ${label}: ${Math.round(left)}% remaining; ${formatRemainingTime(window)}. Use /preset to choose another workflow or /usage limits for details. No settings changed.`, "warning");
        }
        warned.set(key, { reset: window.reset_at, threshold: Math.min(threshold, previous?.threshold ?? 100), left });
      }
    }
  }
  return { observe, clear: () => warned.clear() };
}
