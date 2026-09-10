import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CONSOLE_URL, isStale, notify, PROVIDER, resetText, STATUSLINE_ITEMS, WINDOW_LABELS, WINDOW_NAMES, type Issue, type State } from "./types.ts";
import { limitingWindows, type createUsage } from "./usage.ts";
import { parseStatusline } from "./statusline.ts";
import { saveSettings } from "./storage.ts";
import { statsText } from "./stats.ts";

const ISSUES: Record<Issue, string> = {
  "missing-key": "No OpenCode API key configured. Use Pi's /login for OpenCode Go or configure OPENCODE_API_KEY.",
  auth: "OpenCode authentication failed. Check the Go key with Pi's /login; credentials are never displayed.",
  entitlement: "The usage endpoint denied Go entitlement. Check that the key belongs to the subscribed workspace member.",
  network: "Network request failed. Check connectivity and retry /opencode usage.",
  timeout: "Usage refresh timed out after 10 seconds. Retry /opencode usage.",
  "invalid-response": "The usage endpoint returned an invalid or oversized response. Cached data has not been replaced.",
  "rate-limit": "The usage endpoint is rate-limiting requests; this alone does not prove Go quota exhaustion.",
  server: "The usage endpoint returned an unexpected HTTP status. Retry later; the upstream API may have changed.",
  endpoint: "Go uses a custom endpoint. Account reads are restricted to the official OpenCode Go service; no key was sent.",
};

export function usageText(state: State): string {
  const snapshot = state.snapshot;
  const lines = ["OpenCode Go subscription — server-reported, shared across clients and Go models"];
  if (state.issue) lines.push(`${ISSUES[state.issue]}${state.httpStatus ? ` (HTTP ${state.httpStatus})` : ""}`);
  if (state.retryAt) lines.push(`Automatic refresh deferred until ${new Date(state.retryAt).toISOString()}.`);
  if (!snapshot) lines.push("Quota unknown; no successful observation available.");
  else {
    lines.push(`Last successful refresh: ${new Date(snapshot.observedAt).toISOString()}${isStale(state) ? " — STALE; refresh required" : ""}`);
    for (const name of WINDOW_NAMES) {
      const window = snapshot.windows[name];
      lines.push(`${WINDOW_LABELS[name]}: ${100 - window.usedPercent}% remaining (${window.usedPercent}% used; ${window.status}) · ${resetText(window.resetsAt)} · ${new Date(window.resetsAt).toISOString()}`);
    }
    const limiting = limitingWindows(snapshot).map(([name]) => WINDOW_LABELS[name]).join(", ");
    const exhausted = WINDOW_NAMES.some((name) => snapshot.windows[name].status === "rate-limited");
    lines.push(`${exhausted ? "Exhausted" : "Most constrained"} window(s)${isStale(state) ? " at last observation" : ""}: ${limiting}.`);
  }
  lines.push("Percentages have upstream rounding. Dollar/token/request balances and billing renewal dates are not available.");
  lines.push("If console ‘Use balance’ is enabled, requests can spend Zen credits after Go limits are exhausted. Warnings are not a spending cap; the API does not expose that setting or wallet balance.");
  return lines.join("\n");
}

export function statusText(state: State, ctx: ExtensionContext): string {
  return [
    `Provider selected: ${ctx.model?.provider ?? "none"}${ctx.model?.provider === PROVIDER ? " (Go footer enabled when configured)" : " (Go footer hidden)"}`,
    `Quota warnings: ${state.settings.warnings ? "on" : "off"} · Footer: ${state.settings.statusline.join(", ") || "off"}`,
    "Uses Pi's Go authentication and transport; no separate OpenCode CLI required.",
    usageText(state),
  ].join("\n");
}

export function completions(prefix: string) {
  const match = prefix.match(/^statusline (set|add|remove)\s+(.*)$/);
  if (match) {
    const split = match[2].lastIndexOf(",") + 1;
    const stem = `statusline ${match[1]} ${match[2].slice(0, split)}`;
    return STATUSLINE_ITEMS.filter((field) => field.startsWith(match[2].slice(split).trim())).map((field) => ({ value: `${stem}${field}`, label: field }));
  }
  return ["usage", "status", "stats", "console", "warnings on", "warnings off", "statusline", "statusline set ", "statusline add ", "statusline remove ", "statusline reset"]
    .filter((value) => value.startsWith(prefix)).map((value) => ({ value, label: value }));
}

export function registerCommand(pi: ExtensionAPI, state: State, usage: ReturnType<typeof createUsage>, settingsChanged: (ctx: ExtensionContext) => void): void {
  pi.registerCommand("opencode", {
    description: "OpenCode Go quota, connection status, local stats, console link, warnings, and footer settings",
    getArgumentCompletions: completions,
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        console.error("/opencode informational commands require a TUI or compatible RPC client; no account request made.");
        return;
      }
      const [command = "status", ...rest] = args.trim().split(/\s+/).filter(Boolean);
      if ((command === "usage" || command === "status") && !rest.length) {
        const current = usage.generation();
        notify(ctx, state.snapshot ? `${usageText(state)}\nRefreshing…` : "Refreshing OpenCode Go subscription…");
        await usage.refresh(ctx, true);
        if (current !== usage.generation()) return;
        notify(ctx, command === "status" ? statusText(state, ctx) : usageText(state), state.issue ? "warning" : "info");
        return;
      }
      if (command === "stats" && !rest.length) { notify(ctx, statsText(ctx.sessionManager.getBranch())); return; }
      if (command === "console" && !rest.length) {
        notify(ctx, `OpenCode account console: ${CONSOLE_URL}\nSign in and choose your workspace for Go limits, detailed usage, billing, and ‘Use balance’ settings. No browser was opened and no billing settings changed.`);
        return;
      }
      if (command === "warnings") {
        if (!rest.length) { notify(ctx, `Quota warnings: ${state.settings.warnings ? "on" : "off"}. Use /opencode warnings on|off.`); return; }
        if (rest.length !== 1 || !["on", "off"].includes(rest[0])) { notify(ctx, "Use /opencode warnings on|off.", "error"); return; }
        try { state.settings = saveSettings({ warnings: rest[0] === "on" }); }
        catch { notify(ctx, "Could not save opencode.json. Check the settings file and directory permissions; no changes applied.", "error"); return; }
        settingsChanged(ctx);
        notify(ctx, `Go quota warnings ${state.settings.warnings ? "enabled" : "disabled"} globally.`);
        return;
      }
      if (command === "statusline") {
        if (!rest.length) {
          notify(ctx, `Go footer: ${state.settings.statusline.join(", ") || "off"}. Available: ${STATUSLINE_ITEMS.join(", ")}.\nUse /opencode statusline set|add|remove FIELDS or reset. Percentages are remaining. An empty set hides the footer.`);
          return;
        }
        let fields;
        try { fields = parseStatusline(rest.join(" "), state.settings.statusline); }
        catch (error) { notify(ctx, (error as Error).message, "error"); return; }
        try { state.settings = saveSettings({ statusline: fields }); }
        catch { notify(ctx, "Could not save opencode.json. Check the settings file and directory permissions; no changes applied.", "error"); return; }
        settingsChanged(ctx);
        notify(ctx, `Go footer saved globally: ${fields.join(", ") || "off"}.`);
        return;
      }
      notify(ctx, "Use /opencode usage|status|stats|console|warnings on|off|statusline … . Model selection remains with Pi.", "error");
    },
  });
}
