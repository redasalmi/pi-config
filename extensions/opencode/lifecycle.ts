import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { defaultSettings, notify, PROVIDER, STATUS_KEY, type State } from "./types.ts";
import { readSettings } from "./storage.ts";
import type { createUsage } from "./usage.ts";

export function registerLifecycle(pi: ExtensionAPI, state: State, usage: ReturnType<typeof createUsage>, render: (ctx: ExtensionContext) => void) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let started = false;
  const wantsAccount = () => state.settings.warnings || state.settings.statusline.some((field) => ["usage", "resets", "freshness"].includes(field));

  function schedule(ctx: ExtensionContext, force = false): void {
    if (started && ctx.hasUI && ctx.model?.provider === PROVIDER && wantsAccount()) void usage.refresh(ctx, force);
  }

  function configure(ctx: ExtensionContext): void {
    clearInterval(timer);
    timer = undefined;
    render(ctx);
    if (!started || !ctx.hasUI || ctx.model?.provider !== PROVIDER || !wantsAccount()) {
      usage.cancel();
      return;
    }
    schedule(ctx);
    timer = setInterval(() => {
      render(ctx);
      if (ctx.isIdle()) schedule(ctx);
    }, 30_000);
    timer.unref();
  }

  pi.on("session_start", (_event, ctx) => {
    started = true;
    usage.reset();
    try { state.settings = readSettings(); }
    catch {
      state.settings = defaultSettings();
      notify(ctx, "Could not load opencode.json; using default Go footer and warnings. Fix the file before saving settings.", "warning");
    }
    configure(ctx);
  });
  pi.on("session_shutdown", (_event, ctx) => {
    started = false;
    clearInterval(timer);
    timer = undefined;
    usage.reset();
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
  });
  pi.on("model_select", (event, ctx) => {
    if (ctx.model?.provider !== PROVIDER || event.previousModel?.provider !== PROVIDER ||
      event.previousModel.baseUrl !== ctx.model.baseUrl) {
      // Model navigation does not reset the Go account's backoff or warning history.
      usage.cancel();
    }
    configure(ctx);
  });
  pi.on("agent_settled", (_event, ctx) => { render(ctx); schedule(ctx); });
  pi.on("session_tree", (_event, ctx) => { render(ctx); });
  pi.on("session_compact", (_event, ctx) => { render(ctx); });
  pi.on("thinking_level_select", (_event, ctx) => { render(ctx); });
  return { settingsChanged: configure };
}
