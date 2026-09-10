import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export function notify(ctx: ExtensionContext, message: string, type: "info" | "warning" | "error" = "info"): void {
  if (ctx.hasUI) ctx.ui.notify(message, type);
  else if (type !== "info") console.error(message);
}
