import { Key } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CodexState } from "./types.ts";
import { notify } from "./utils.ts";
import type { createPresets } from "./presets.ts";

export function registerPresetCommands(
  pi: ExtensionAPI,
  state: CodexState,
  presets: ReturnType<typeof createPresets>,
): void {
  pi.registerFlag("preset", {
    description: "Start with a named Codex preset",
    type: "string",
  });

  pi.registerCommand("preset", {
    description: "Switch Codex preset configuration",
    getArgumentCompletions: presets.getPresetCompletions,
    handler: presets.handlePresetCommand,
  });

  pi.registerShortcut(Key.ctrlShift("u"), {
    description: "Cycle Codex presets",
    handler: async (ctx: ExtensionContext) => {
      if (!ctx.isIdle()) {
        notify(ctx, "Wait for the current task to finish before changing presets", "warning");
        return;
      }

      const names = presets.getPresetOrder();
      if (names.length === 0) {
        notify(ctx, "No presets are defined", "warning");
        return;
      }

      const cycle = ["(none)", ...names];
      const current = state.activePresetName ?? "(none)";
      const currentIndex = cycle.indexOf(current);
      const next = cycle[(currentIndex + 1) % cycle.length];

      if (next === "(none)") {
        await presets.clearPreset(ctx, { persist: true, notify: true });
      } else if (next) {
        await presets.applyPreset(next, state.presets[next], ctx, { persist: true, notify: true });
      }
    },
  });
}
