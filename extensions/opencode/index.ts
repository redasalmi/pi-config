import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createState } from "./types.ts";
import { createUsage } from "./usage.ts";
import { createQuotaWarnings } from "./quota.ts";
import { createStatusline } from "./statusline.ts";
import { registerLifecycle } from "./lifecycle.ts";
import { registerCommand } from "./status.ts";

export default function (pi: ExtensionAPI) {
  const state = createState();
  const statusline = createStatusline(state, () => pi.getThinkingLevel());
  const quota = createQuotaWarnings(state);
  const usage = createUsage(state, { render: statusline.render, observe: quota.observe, clearWarnings: quota.clear });
  const lifecycle = registerLifecycle(pi, state, usage, statusline.render);
  registerCommand(pi, state, usage, lifecycle.settingsChanged);
}
