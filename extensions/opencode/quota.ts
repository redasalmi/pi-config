import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { notify, resetText, WINDOW_LABELS, WINDOW_NAMES, type Snapshot, type State, type WindowName } from "./types.ts";

export function createQuotaWarnings(state: State) {
  const warned = new Map<WindowName, { resetsAt: number; used: number; threshold: number }>();
  function observe(ctx: ExtensionContext, snapshot: Snapshot): void {
    if (!state.settings.warnings || !ctx.hasUI) return;
    for (const name of WINDOW_NAMES) {
      const window = snapshot.windows[name];
      if (window.resetsAt <= Date.now()) continue;
      let previous = warned.get(name);
      // Upstream rounds reset timestamps to seconds; tolerate that jitter.
      if (previous && (Math.abs(window.resetsAt - previous.resetsAt) > 2000 || window.usedPercent < previous.used)) previous = undefined;
      const left = 100 - window.usedPercent;
      const threshold = left <= 10 ? 10 : left <= 30 ? 30 : 100;
      if (threshold < (previous?.threshold ?? 100)) {
        notify(ctx, `OpenCode Go ${WINDOW_LABELS[name]}: ${left}% remaining; ${resetText(window.resetsAt)}. Use /opencode usage for details. Go models share quota; no settings changed.`, "warning");
      }
      warned.set(name, { resetsAt: window.resetsAt, used: window.usedPercent, threshold: Math.min(threshold, previous?.threshold ?? 100) });
    }
  }
  return { observe, clear: () => warned.clear() };
}
